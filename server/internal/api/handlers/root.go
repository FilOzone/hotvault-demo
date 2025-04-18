package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/fws/backend/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RemoveRootRequest struct {
	PieceID     uint   `json:"pieceId" binding:"required"`
	ProofSetID  int    `json:"proofSetId"`
	ServiceURL  string `json:"serviceUrl"`
	ServiceName string `json:"serviceName"`
	RootID      string `json:"rootId"`
}

// ProofSet represents the structure returned by get-proof-set command
type ProofSet struct {
	ID        int      `json:"id"`
	ServiceID string   `json:"service_id"`
	RootIDs   []string `json:"root_ids"`
	Roots     []Root   `json:"roots"`
}

// Root represents an individual root in the proof set
type Root struct {
	ID       string `json:"id"`
	CID      string `json:"cid"`
	PieceIDs []uint `json:"piece_ids"`
}

// @Summary Remove roots using pdptool
// @Description Remove a specific root from the PDP service
// @Tags roots
// @Accept json
// @Produce json
// @Param request body RemoveRootRequest true "Remove root request data"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/roots/remove [post]
func RemoveRoot(c *gin.Context) {
	if db == nil {
		log.Error("Database connection not initialized")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error: database not initialized",
		})
		return
	}

	var request RemoveRootRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
		})
		return
	}

	// Get user ID from context (set by JWT middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	// Retrieve the piece from the database
	var piece models.Piece
	if err := db.Where("id = ? AND user_id = ?", request.PieceID, userID).First(&piece).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Piece not found or does not belong to the authenticated user",
			})
			return
		}
		log.WithField("error", err.Error()).Error("Failed to fetch piece")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch piece: " + err.Error(),
		})
		return
	}

	// Use the piece data for the fields if not provided in the request
	serviceURL := request.ServiceURL
	if serviceURL == "" {
		serviceURL = piece.ServiceURL
	}

	serviceName := request.ServiceName
	if serviceName == "" {
		serviceName = piece.ServiceName
	}

	// For proofSetID, we'll rely on get-proof-set to find it
	proofSetID := request.ProofSetID
	if proofSetID == 0 {
		proofSetID = 1 // Default only if we need it as a fallback
	}

	pdptoolPath := "/Users/art3mis/Developer/opensource/protocol/curio/pdptool"
	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("path", pdptoolPath).Error("pdptool not found")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pdptool not found",
			"path":  pdptoolPath,
		})
		return
	}

	// Log command parameters for debugging
	log.WithField("serviceUrl", serviceURL).
		WithField("pieceId", request.PieceID).
		WithField("cid", piece.CID).
		Info("Attempting to find root information")

	// Validate that we have the service URL
	if serviceURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Service URL is required but not available",
		})
		return
	}

	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Service name is required but not available",
		})
		return
	}

	// 1. First get the proof set to find the proper root ID
	proofSetIDStr := fmt.Sprintf("%d", proofSetID)
	log.WithField("proofSetIDStr", proofSetIDStr).Info("Proof set ID")
	proofSetCmd := exec.Command(
		pdptoolPath,
		"get-proof-set",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--proof-set", proofSetIDStr,
	)
	proofSetCmd.Dir = filepath.Dir(pdptoolPath)

	var proofSetStdout bytes.Buffer
	var proofSetStderr bytes.Buffer
	proofSetCmd.Stdout = &proofSetStdout
	proofSetCmd.Stderr = &proofSetStderr

	// Log the exact command being executed
	proofSetCmdStr := proofSetCmd.String()
	log.WithField("command", proofSetCmdStr).Info("Executing get-proof-set command")

	if err := proofSetCmd.Run(); err != nil {
		errMsg := proofSetStderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}

		log.WithField("error", err.Error()).
			WithField("stderr", errMsg).
			WithField("command", proofSetCmdStr).
			Error("Failed to execute get-proof-set command")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to get proof set information: " + errMsg,
			"details": err.Error(),
			"command": proofSetCmdStr,
		})
		return
	}

	// Parse the proof set output to find the root ID that contains our CID
	proofSetOutput := proofSetStdout.String()
	log.WithField("output", proofSetOutput).Info("get-proof-set executed successfully")

	// Try to parse the JSON output from get-proof-set
	var proofSets []ProofSet
	if err := json.Unmarshal([]byte(proofSetOutput), &proofSets); err != nil {
		log.WithField("error", err.Error()).
			WithField("output", proofSetOutput).
			Error("Failed to parse proof set JSON")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to parse proof set information",
			"details": err.Error(),
			"output":  proofSetOutput,
		})
		return
	}

	// Find the root that contains our CID
	var foundRootID string
	var foundProofSetID int

	for _, ps := range proofSets {
		for _, root := range ps.Roots {
			if root.CID == piece.CID {
				foundRootID = root.ID
				foundProofSetID = ps.ID
				break
			}
		}
		if foundRootID != "" {
			break
		}
	}

	if foundRootID == "" {
		// If we couldn't find the exact root by CID, try an alternative approach
		// Look through the output for lines that might contain the CID
		lines := strings.Split(proofSetOutput, "\n")
		for _, line := range lines {
			if strings.Contains(line, piece.CID) {
				// This is a simplistic approach and might need refinement
				// Ideally, we should use a regex to extract the root ID
				parts := strings.Split(line, " ")
				if len(parts) > 1 {
					// Assume the first part might be the root ID
					foundRootID = parts[0]
					log.WithField("extractedRootID", foundRootID).Info("Extracted root ID from output line")
					break
				}
			}
		}
	}

	if foundRootID == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"error":  "Could not find root ID for the given CID",
			"cid":    piece.CID,
			"output": proofSetOutput,
		})
		return
	}

	// Use the found proof set ID if available
	if foundProofSetID != 0 {
		proofSetID = foundProofSetID
	}

	log.WithField("rootId", foundRootID).
		WithField("proofSetId", proofSetID).
		Info("Found root ID and proof set ID")

	// 2. Now remove the root using the correct root ID
	removeCmd := exec.Command(
		pdptoolPath,
		"remove-roots",
		"--service-url", serviceURL,
		"--proof-set", proofSetIDStr,
		"--service-name", serviceName,
		"--root-id", foundRootID,
	)
	removeCmd.Dir = filepath.Dir(pdptoolPath)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	removeCmd.Stdout = &stdout
	removeCmd.Stderr = &stderr

	// Log the exact command being executed
	cmdStr := removeCmd.String()
	log.WithField("command", cmdStr).Info("Executing remove-roots command")

	if err := removeCmd.Run(); err != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}

		log.WithField("error", err.Error()).
			WithField("stderr", errMsg).
			WithField("command", cmdStr).
			Error("Failed to execute pdptool command")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to remove root: " + errMsg,
			"details": err.Error(),
			"command": cmdStr,
		})
		return
	}

	// Command executed successfully
	log.WithField("output", stdout.String()).Info("pdptool executed successfully")

	// Mark the piece as pending removal in the database with removal date 24 hours from now
	piece.PendingRemoval = true
	removalDate := time.Now().Add(24 * time.Hour)
	piece.RemovalDate = &removalDate

	if err := db.Save(&piece).Error; err != nil {
		log.WithField("error", err.Error()).Warning("Failed to mark piece as pending removal in database")
		// Continue with the response even if this fails, as the removal command was successful
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Root removal scheduled successfully",
		"output":  stdout.String(),
	})
}

package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/hotvault/backend/internal/models"
	"gorm.io/gorm"
)

type RemoveRootRequest struct {
	PieceID     uint   `json:"pieceId" binding:"required"`
	ProofSetID  int    `json:"proofSetId"`
	ServiceURL  string `json:"serviceUrl"`
	ServiceName string `json:"serviceName"`
	RootID      string `json:"rootId"`
}

type ProofSet struct {
	ID        int      `json:"id"`
	ServiceID string   `json:"service_id"`
	RootIDs   []string `json:"root_ids"`
	Roots     []Root   `json:"roots"`
}

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

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var piece models.Piece
	if err := db.Where("id = ? AND user_id = ?", request.PieceID, userID).First(&piece).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Piece not found or does not belong to the authenticated user",
			})
			return
		}
		log.WithField("error", err.Error()).WithField("pieceID", request.PieceID).Error("Failed to fetch piece")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch piece information: " + err.Error(),
		})
		return
	}

	if piece.ProofSetID == nil {
		log.WithField("pieceID", piece.ID).Error("Piece is missing associated ProofSetID")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal error: Piece is missing required proof set data",
		})
		return
	}

	if piece.RootID == nil || *piece.RootID == "" {
		log.WithField("pieceID", piece.ID).Error("Piece is missing the stored Root ID")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal error: Piece is missing the required Root ID",
		})
		return
	}

	var proofSet models.ProofSet
	if err := db.Where("id = ? AND user_id = ?", *piece.ProofSetID, userID).First(&proofSet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.WithField("pieceID", piece.ID).WithField("proofSetDbId", *piece.ProofSetID).Error("Associated proof set record not found in DB")
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Internal error: Associated proof set record not found for this piece",
			})
		} else {
			log.WithField("pieceID", piece.ID).WithField("proofSetDbId", *piece.ProofSetID).WithField("error", err).Error("Failed to fetch associated proof set record")
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch proof set record: " + err.Error(),
			})
		}
		return
	}

	if proofSet.ProofSetID == "" {
		log.WithField("pieceID", piece.ID).WithField("proofSetDbId", proofSet.ID).Error("Fetched proof set record is missing the service ProofSetID string")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal error: Proof set record is incomplete",
		})
		return
	}

	serviceURL := piece.ServiceURL
	serviceName := piece.ServiceName
	serviceProofSetIDStr := proofSet.ProofSetID
	storedIntegerRootIDStr := *piece.RootID

	if request.ServiceURL != "" {
		serviceURL = request.ServiceURL
		log.WithField("pieceID", piece.ID).Info("Overriding Service URL from request")
	}
	if request.ServiceName != "" {
		serviceName = request.ServiceName
		log.WithField("pieceID", piece.ID).Info("Overriding Service Name from request")
	}

	if _, err := strconv.Atoi(storedIntegerRootIDStr); err != nil {
		log.WithField("pieceID", piece.ID).WithField("storedRootID", storedIntegerRootIDStr).Error("Stored Root ID in piece record is not a valid integer string")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal error: Invalid Root ID format stored for piece",
		})
		return
	}

	log.WithField("pieceID", piece.ID).
		WithField("serviceProofSetID", serviceProofSetIDStr).
		WithField("integerRootID", storedIntegerRootIDStr).
		Info("Proceeding with root removal using stored data")

	pdptoolPath := cfg.PdptoolPath
	if pdptoolPath == "" {
		log.Error("PDPTool path not configured in environment/config")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Server configuration error: PDPTool path missing",
		})
		return
	}

	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("path", pdptoolPath).Error("pdptool not found at configured path")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pdptool executable not found at configured path",
			"path":  pdptoolPath,
		})
		return
	}

	// Change working directory to pdptool directory
	pdptoolDir := getPdptoolParentDir(pdptoolPath)
	if err := os.Chdir(pdptoolDir); err != nil {
		log.Error(fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to set working directory",
		})
		return
	}
	log.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")

	if serviceURL == "" || serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Service URL and Service Name are required but missing from piece/proofset data",
		})
		return
	}

	removeArgs := []string{
		"remove-roots",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--proof-set-id", serviceProofSetIDStr,
		"--root-id", storedIntegerRootIDStr,
	}
	removeCmd := exec.Command(pdptoolPath, removeArgs...)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	removeCmd.Stdout = &stdout
	removeCmd.Stderr = &stderr

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
			Error("Failed to execute pdptool remove-roots command")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to remove root: " + errMsg,
			"details": err.Error(),
			"command": cmdStr,
		})
		return
	}

	log.WithField("output", stdout.String()).Info("pdptool remove-roots executed successfully")

	if err := db.Delete(&piece).Error; err != nil {
		log.WithField("pieceID", piece.ID).WithField("error", err.Error()).Error("Failed to delete piece from database after successful root removal")
		c.JSON(http.StatusOK, gin.H{
			"message": "Root removal command succeeded, but failed to delete piece record from DB",
			"output":  stdout.String(),
			"dbError": err.Error(),
		})
		return
	}

	log.WithField("pieceID", piece.ID).Info("Piece successfully deleted from database")

	c.JSON(http.StatusOK, gin.H{
		"message": "Root removed successfully and piece deleted",
		"output":  stdout.String(),
	})
}

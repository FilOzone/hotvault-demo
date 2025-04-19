package handlers

import (
	"bytes"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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

	var request RemoveRootRequest // Request might still be useful for explicit overrides, but we prioritize DB data
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

	// 1. Retrieve the piece from the database, ensuring it belongs to the user
	var piece models.Piece
	// Fetch Piece first
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

	// 2. Validate required data from the fetched piece
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

	// 3. Fetch the associated ProofSet record using the piece.ProofSetID
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

	// Validate the fetched ProofSet record has the Service ID
	if proofSet.ProofSetID == "" {
		log.WithField("pieceID", piece.ID).WithField("proofSetDbId", proofSet.ID).Error("Fetched proof set record is missing the service ProofSetID string")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal error: Proof set record is incomplete",
		})
		return
	}

	// 4. Consolidate data for the command
	serviceURL := piece.ServiceURL
	serviceName := piece.ServiceName
	serviceProofSetIDStr := proofSet.ProofSetID // Service's String ID from the proof_sets table
	storedIntegerRootIDStr := *piece.RootID     // Stored Integer Root ID string from the pieces table

	// Optional: Allow overrides from request if provided (use with caution)
	if request.ServiceURL != "" {
		serviceURL = request.ServiceURL
		log.WithField("pieceID", piece.ID).Info("Overriding Service URL from request")
	}
	if request.ServiceName != "" {
		serviceName = request.ServiceName
		log.WithField("pieceID", piece.ID).Info("Overriding Service Name from request")
	}
	// Do NOT allow overriding ProofSetID or RootID from request, use the DB values.

	// Basic validation: Check if stored Root ID looks like an integer string
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

	pdptoolPath := "/Users/art3mis/Developer/opensource/protocol/curio/pdptool" // TODO: Configurable
	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("path", pdptoolPath).Error("pdptool not found")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pdptool not found",
			"path":  pdptoolPath,
		})
		return
	}

	// Validate that we have the service URL and name
	if serviceURL == "" || serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Service URL and Service Name are required but missing from piece/proofset data",
		})
		return
	}

	// REMOVED: Call to get-proof-set before removal (no longer needed)

	// 5. Execute remove-roots using the Service's ProofSetID string and the stored integer Root ID string
	removeArgs := []string{
		"remove-roots",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--proof-set-id", serviceProofSetIDStr, // Use the Service's ID string
		"--root-id", storedIntegerRootIDStr, // Use the stored integer Root ID string
	}
	removeCmd := exec.Command(pdptoolPath, removeArgs...)
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
			Error("Failed to execute pdptool remove-roots command")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to remove root: " + errMsg,
			"details": err.Error(),
			"command": cmdStr,
		})
		return
	}

	// Command executed successfully
	log.WithField("output", stdout.String()).Info("pdptool remove-roots executed successfully")

	// 6. Mark the piece as pending removal in the database
	pendingRemovalStatus := true // Explicitly set to true
	removalDate := time.Now().Add(24 * time.Hour)

	// Update specific fields to mark for removal
	// Use map[string]interface{} for Updates to handle zero values correctly if needed,
	// or ensure the model uses pointers for fields that should be updatable to zero/false.
	// Assuming PendingRemoval is bool and RemovalDate is *time.Time in the model:
	if err := db.Model(&piece).Updates(map[string]interface{}{
		"pending_removal": pendingRemovalStatus, // Use column name from DB tag
		"removal_date":    &removalDate,
	}).Error; err != nil {
		log.WithField("pieceID", piece.ID).WithField("error", err.Error()).Error("Failed to mark piece as pending removal in database")
		// Don't fail the request, but maybe return a warning in the response?
		c.JSON(http.StatusOK, gin.H{
			"message": "Root removal command succeeded, but failed to mark piece for removal in DB",
			"output":  stdout.String(),
			"dbError": err.Error(),
		})
		return
	}

	log.WithField("pieceID", piece.ID).Info("Piece successfully marked for removal")

	c.JSON(http.StatusOK, gin.H{
		"message": "Root removal initiated successfully and piece marked for removal",
		"output":  stdout.String(),
	})
}

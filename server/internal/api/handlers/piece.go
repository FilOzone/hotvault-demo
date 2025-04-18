package handlers

import (
	"net/http"

	"github.com/fws/backend/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetUserPieces returns all pieces for the authenticated user
// @Summary Get user's pieces
// @Description Get all pieces uploaded by the authenticated user
// @Tags pieces
// @Produce json
// @Success 200 {array} models.Piece
// @Router /api/v1/pieces [get]
func GetUserPieces(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var pieces []models.Piece
	if err := db.Where("user_id = ?", userID).Find(&pieces).Error; err != nil {
		log.WithField("error", err.Error()).Error("Failed to fetch user pieces")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch pieces",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, pieces)
}

// GetPieceByID returns a specific piece by ID
// @Summary Get piece by ID
// @Description Get a specific piece by its ID
// @Tags pieces
// @Param id path string true "Piece ID"
// @Produce json
// @Success 200 {object} models.Piece
// @Router /api/v1/pieces/{id} [get]
func GetPieceByID(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	pieceID := c.Param("id")
	var piece models.Piece

	if err := db.Where("id = ? AND user_id = ?", pieceID, userID).First(&piece).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Piece not found",
			})
			return
		}
		log.WithField("error", err.Error()).Error("Failed to fetch piece")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch piece",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, piece)
}

// GetPieceByCID returns a specific piece by CID
// @Summary Get piece by CID
// @Description Get a specific piece by its CID
// @Tags pieces
// @Param cid path string true "Piece CID"
// @Produce json
// @Success 200 {object} models.Piece
// @Router /api/v1/pieces/cid/{cid} [get]
func GetPieceByCID(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	cid := c.Param("cid")
	var piece models.Piece

	if err := db.Where("cid = ? AND user_id = ?", cid, userID).First(&piece).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Piece not found",
			})
			return
		}
		log.WithField("error", err.Error()).Error("Failed to fetch piece")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch piece",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, piece)
}

// GetPieceProofs returns all pieces with proof information for the authenticated user
// @Summary Get user's pieces with proof data
// @Description Get all pieces with proof information (proofSetId and rootId) for the authenticated user
// @Tags pieces
// @Produce json
// @Success 200 {array} models.Piece
// @Router /api/v1/pieces/proofs [get]
func GetPieceProofs(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var pieces []models.Piece
	if err := db.Where("user_id = ?", userID).Find(&pieces).Error; err != nil {
		log.WithField("error", err.Error()).Error("Failed to fetch user pieces with proofs")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch piece proofs",
			"details": err.Error(),
		})
		return
	}

	log.WithField("pieceCount", len(pieces)).Info("Fetched pieces for proofs")

	// Update proof information for each piece
	for i := range pieces {
		// Log the CID to help debug issues
		log.WithField("pieceId", pieces[i].ID).
			WithField("cid", pieces[i].CID).
			WithField("index", i).
			Debug("Processing piece for proof data")

		// This is where you would normally query your proof system
		// For now, we're just setting dummy values to demonstrate the concept
		proofSetID := fetchProofSetID(pieces[i].CID)
		if proofSetID > 0 {
			pieces[i].ProofSetID = &proofSetID
			rootID := fetchRootID(pieces[i].CID)
			if rootID != "" {
				pieces[i].RootID = &rootID
			}
		}
	}

	c.JSON(http.StatusOK, pieces)
}

// Helper function to fetch proof set ID from the proof system
// This would normally call your actual proof service
func fetchProofSetID(cid string) uint {
	// Dummy implementation - in real code, this would call your proof service
	if cid == "" {
		return 0 // Return 0 for empty CIDs, indicating no proof
	}

	// Return dummy ID 5 for demonstration
	return 5
}

// Helper function to fetch root ID from the proof system
func fetchRootID(cid string) string {
	// Dummy implementation - in real code, this would call your proof service
	if cid == "" {
		return "root_unknown" // Return a default value for empty CIDs
	}

	// Safely get a substring, handling potential shorter CIDs
	endIdx := 8
	if len(cid) < 8 {
		endIdx = len(cid)
	}

	return "root_" + cid[:endIdx] // Just a dummy value for demonstration
}

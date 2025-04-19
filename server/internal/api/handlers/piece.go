package handlers

import (
	"net/http"
	"time"

	"github.com/fws/backend/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PieceResponse defines the structure returned by the GetUserPieces endpoint
// It includes the service's string ProofSetID
type PieceResponse struct {
	ID                uint       `json:"id"`
	UserID            uint       `json:"userId"`
	CID               string     `json:"cid"`
	Filename          string     `json:"filename"`
	Size              int64      `json:"size"`
	ServiceName       string     `json:"serviceName"`
	ServiceURL        string     `json:"serviceUrl"`
	PendingRemoval    *bool      `json:"pendingRemoval,omitempty"` // Use pointer to handle null/false
	RemovalDate       *time.Time `json:"removalDate,omitempty"`
	ProofSetDbID      *uint      `json:"proofSetDbId,omitempty"`      // Local DB FK ID
	ServiceProofSetID *string    `json:"serviceProofSetId,omitempty"` // Service's String ID
	RootID            *string    `json:"rootId,omitempty"`            // Service's Integer Root ID (string)
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// GetUserPieces returns all pieces for the authenticated user
// @Summary Get user's pieces
// @Description Get all pieces uploaded by the authenticated user, including service proof set ID
// @Tags pieces
// @Produce json
// @Success 200 {array} PieceResponse
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
	if err := db.Where("user_id = ?", userID).Order("created_at DESC").Find(&pieces).Error; err != nil {
		log.WithField("error", err.Error()).Error("Failed to fetch user pieces")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch pieces",
			"details": err.Error(),
		})
		return
	}

	proofSetIDs := make([]uint, 0, len(pieces))
	for _, piece := range pieces {
		if piece.ProofSetID != nil {
			proofSetIDs = append(proofSetIDs, *piece.ProofSetID)
		}
	}

	proofSetMap := make(map[uint]models.ProofSet)
	if len(proofSetIDs) > 0 {
		var proofSets []models.ProofSet
		if err := db.Where("id IN ?", proofSetIDs).Find(&proofSets).Error; err != nil {
			log.WithField("error", err.Error()).Error("Failed to fetch associated proof sets for pieces")
		} else {
			for _, ps := range proofSets {
				proofSetMap[ps.ID] = ps
			}
		}
	}

	responsePieces := make([]PieceResponse, 0, len(pieces))
	for _, piece := range pieces {
		var pendingRemovalPtr *bool
		if piece.PendingRemoval {
			tempVal := true
			pendingRemovalPtr = &tempVal
		}

		respPiece := PieceResponse{
			ID:             piece.ID,
			UserID:         piece.UserID,
			CID:            piece.CID,
			Filename:       piece.Filename,
			Size:           piece.Size,
			ServiceName:    piece.ServiceName,
			ServiceURL:     piece.ServiceURL,
			PendingRemoval: pendingRemovalPtr,
			RemovalDate:    piece.RemovalDate,
			ProofSetDbID:   piece.ProofSetID,
			RootID:         piece.RootID,
			CreatedAt:      piece.CreatedAt,
			UpdatedAt:      piece.UpdatedAt,
		}
		if piece.ProofSetID != nil {
			if proofSet, ok := proofSetMap[*piece.ProofSetID]; ok {
				if proofSet.ProofSetID != "" {
					serviceID := proofSet.ProofSetID
					respPiece.ServiceProofSetID = &serviceID
				}
			}
		}
		responsePieces = append(responsePieces, respPiece)
	}

	c.JSON(http.StatusOK, responsePieces)
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
// @Summary Get user's pieces with proof data (DEPRECATED)
// @Description (DEPRECATED - Use /api/v1/pieces instead) Get all pieces with proof information
// @Tags pieces
// @Produce json
// @Success 200 {array} models.Piece
// @Router /api/v1/pieces/proofs [get]
func GetPieceProofs(c *gin.Context) {
	log.Warning("Deprecated endpoint /api/v1/pieces/proofs called. Use /api/v1/pieces.")
	c.JSON(http.StatusGone, gin.H{
		"error":   "Endpoint deprecated",
		"message": "Please use the /api/v1/pieces endpoint instead.",
	})
}

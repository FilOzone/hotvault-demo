package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hotvault/backend/internal/models"
	"gorm.io/gorm"
)

type PieceResponse struct {
	ID                uint       `json:"id"`
	UserID            uint       `json:"userId"`
	CID               string     `json:"cid"`
	Filename          string     `json:"filename"`
	Size              int64      `json:"size"`
	ServiceName       string     `json:"serviceName"`
	ServiceURL        string     `json:"serviceUrl"`
	PendingRemoval    *bool      `json:"pendingRemoval,omitempty"`
	RemovalDate       *time.Time `json:"removalDate,omitempty"`
	ProofSetDbID      *uint      `json:"proofSetDbId,omitempty"`
	ServiceProofSetID *string    `json:"serviceProofSetId,omitempty"`
	RootID            *string    `json:"rootId,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

type ProofSetsResponse struct {
	ProofSets []ProofSetWithPieces `json:"proofSets"`
	Pieces    []PieceResponse      `json:"pieces"`
}

type ProofSetWithPieces struct {
	ID              uint      `json:"id"`
	ProofSetID      string    `json:"proofSetId"`
	TransactionHash string    `json:"transactionHash"`
	ServiceName     string    `json:"serviceName"`
	ServiceURL      string    `json:"serviceUrl"`
	PieceIDs        []uint    `json:"pieceIds"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
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

// GetProofSets returns all proof sets and associated pieces for the authenticated user
// @Summary Get user's proof sets
// @Description Get all proof sets and their pieces for the authenticated user
// @Tags pieces
// @Produce json
// @Success 200 {object} ProofSetsResponse
// @Router /api/v1/pieces/proof-sets [get]
func GetProofSets(c *gin.Context) {
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

	proofSetIDs := make([]uint, 0)
	for _, piece := range pieces {
		if piece.ProofSetID != nil {
			proofSetIDs = append(proofSetIDs, *piece.ProofSetID)
		}
	}

	if len(proofSetIDs) == 0 {
		c.JSON(http.StatusOK, ProofSetsResponse{
			ProofSets: []ProofSetWithPieces{},
			Pieces:    []PieceResponse{},
		})
		return
	}

	var proofSets []models.ProofSet
	if err := db.Where("id IN ?", proofSetIDs).Find(&proofSets).Error; err != nil {
		log.WithField("error", err.Error()).Error("Failed to fetch proof sets")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch proof sets",
			"details": err.Error(),
		})
		return
	}

	piecesByProofSetID := make(map[uint][]uint)
	for _, piece := range pieces {
		if piece.ProofSetID != nil {
			piecesByProofSetID[*piece.ProofSetID] = append(piecesByProofSetID[*piece.ProofSetID], piece.ID)
		}
	}

	proofSetResponses := make([]ProofSetWithPieces, 0, len(proofSets))
	for _, ps := range proofSets {
		proofSetResponse := ProofSetWithPieces{
			ID:              ps.ID,
			ProofSetID:      ps.ProofSetID,
			TransactionHash: ps.TransactionHash,
			ServiceName:     ps.ServiceName,
			ServiceURL:      ps.ServiceURL,
			PieceIDs:        piecesByProofSetID[ps.ID],
			CreatedAt:       ps.CreatedAt,
			UpdatedAt:       ps.UpdatedAt,
		}
		proofSetResponses = append(proofSetResponses, proofSetResponse)
	}

	pieceResponses := make([]PieceResponse, 0, len(pieces))
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

		for _, ps := range proofSets {
			if piece.ProofSetID != nil && *piece.ProofSetID == ps.ID {
				serviceID := ps.ProofSetID
				respPiece.ServiceProofSetID = &serviceID
				break
			}
		}

		pieceResponses = append(pieceResponses, respPiece)
	}

	c.JSON(http.StatusOK, ProofSetsResponse{
		ProofSets: proofSetResponses,
		Pieces:    pieceResponses,
	})
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

// @Summary Get User's Proof Set ID
// @Description Get the proof set ID for the authenticated user
// @Tags proofset
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 401 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/proofset/id [get]
func GetUserProofSetID(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var proofSet models.ProofSet
	if err := db.Where("user_id = ?", userID).First(&proofSet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Proof set not found for user",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch proof set",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"proofSetId": proofSet.ProofSetID,
	})
}

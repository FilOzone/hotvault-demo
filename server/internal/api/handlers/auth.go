package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/fws/backend/config"
	"github.com/fws/backend/internal/models"
	"github.com/fws/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error string `json:"error" example:"Invalid request"`
}

// @title FWS Backend API
// @version 1.0
// @description API Server for FWS Backend Application
// @host localhost:8080
// @BasePath /api/v1

// AuthHandler handles authentication related requests
type AuthHandler struct {
	db         *gorm.DB
	cfg        *config.Config
	ethService *services.EthereumService
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(db *gorm.DB, cfg *config.Config) *AuthHandler {
	ethService := services.NewEthereumService(cfg.Ethereum)
	return &AuthHandler{
		db:         db,
		cfg:        cfg,
		ethService: ethService,
	}
}

// NonceRequest represents the request for generating a nonce
// @Description Request body for generating a nonce
type NonceRequest struct {
	Address string `json:"address" binding:"required,hexadecimal" example:"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"`
}

// NonceResponse represents the response containing the generated nonce
// @Description Response containing the generated nonce
type NonceResponse struct {
	Nonce string `json:"nonce" example:"7a39f642c2608fd2bded0c35b1612d8716757326f870b6bd3f6cb7824f2b5c6d"`
}

// GenerateNonce godoc
// @Summary Generate Authentication Nonce
// @Description Generates a nonce for wallet signature authentication
// @Tags Authentication
// @Accept json
// @Produce json
// @Param request body NonceRequest true "Wallet address"
// @Success 200 {object} NonceResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /auth/nonce [post]
func (h *AuthHandler) GenerateNonce(c *gin.Context) {
	var req NonceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "Invalid request: " + err.Error()})
		return
	}

	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to generate nonce"})
		return
	}
	nonce := hex.EncodeToString(nonceBytes)

	var user models.User
	if err := h.db.Where("wallet_address = ?", req.Address).First(&user).Error; err != nil {
		user = models.User{
			WalletAddress: req.Address,
			Nonce:         nonce,
		}
		if err := h.db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to create user"})
			return
		}
	} else {
		if err := h.db.Model(&user).Update("nonce", nonce).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to update nonce"})
			return
		}
	}

	c.JSON(http.StatusOK, NonceResponse{
		Nonce: nonce,
	})
}

// VerifyRequest represents the request for verifying a signature
// @Description Request body for verifying a signature
type VerifyRequest struct {
	Address   string `json:"address" binding:"required,hexadecimal" example:"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"`
	Signature string `json:"signature" binding:"required,hexadecimal" example:"0x..."`
}

// VerifyResponse represents the response for a verification request
// @Description Response containing the JWT token and expiration
type VerifyResponse struct {
	Token   string `json:"token" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	Expires int64  `json:"expires" example:"1679529600"`
}

// VerifySignature godoc
// @Summary Verify Signature
// @Description Verifies the signature and issues a JWT token
// @Tags Authentication
// @Accept json
// @Produce json
// @Param request body VerifyRequest true "Address and signature"
// @Success 200 {object} VerifyResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /auth/verify [post]
func (h *AuthHandler) VerifySignature(c *gin.Context) {
	var req VerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "Invalid request: " + err.Error()})
		return
	}

	// Get the user from the database
	var user models.User
	if err := h.db.Where("wallet_address = ?", req.Address).First(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "Invalid wallet address"})
		return
	}

	// Verify the signature
	valid, err := h.ethService.VerifySignature(req.Address, user.Nonce, req.Signature)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to verify signature: " + err.Error()})
		return
	}

	if !valid {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "Invalid signature"})
		return
	}

	// Generate a new nonce for the next authentication
	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to generate nonce"})
		return
	}
	newNonce := hex.EncodeToString(nonceBytes)

	// Update the user's nonce
	if err := h.db.Model(&user).Update("nonce", newNonce).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to update nonce"})
		return
	}

	// Generate a JWT token
	expirationTime := time.Now().Add(h.cfg.JWT.Expiration)
	claims := &models.JWTClaims{
		UserID:        user.ID,
		WalletAddress: user.WalletAddress,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(h.cfg.JWT.Secret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, VerifyResponse{
		Token:   tokenString,
		Expires: expirationTime.Unix(),
	})
}

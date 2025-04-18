package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
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

// StatusResponse represents the response for checking authentication status
// @Description Response containing authentication status
type StatusResponse struct {
	Authenticated bool   `json:"authenticated"`
	Address       string `json:"address,omitempty"`
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
	Message   string `json:"message,omitempty" example:"Sign this message to authenticate with FWS: abcd1234..."`
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

	// Log debug information to help diagnose issues
	fmt.Printf("Verifying signature - Address: %s, Nonce: %s, Message: %s\n",
		req.Address, user.Nonce, req.Message)

	// Check if we received a full message that includes the nonce
	var valid bool
	var err error

	if req.Message != "" {
		// If a message was provided, extract the nonce from it and compare
		// This is an example pattern - adjust based on your actual message format
		expectedPrefix := fmt.Sprintf("Sign this message to authenticate with FWS: %s", user.Nonce)
		if req.Message == expectedPrefix {
			// Message matches expected format, verify the signature against the full message
			valid, err = h.ethService.VerifySignature(req.Address, req.Message, req.Signature)
		} else {
			// Message doesn't match expected format
			fmt.Println("Message format does not match expected format")
			fmt.Printf("Expected: %s\nActual: %s\n", expectedPrefix, req.Message)
			c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "Invalid message format"})
			return
		}
	} else {
		// Fall back to the original method for backward compatibility
		// Construct the message the same way as before
		message := fmt.Sprintf("Sign this message to authenticate with FWS: %s", user.Nonce)
		valid, err = h.ethService.VerifySignature(req.Address, message, req.Signature)
	}

	if err != nil {
		fmt.Printf("Signature verification error: %v\n", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to verify signature: " + err.Error()})
		return
	}

	if !valid {
		fmt.Println("Invalid signature detected")
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

	// Set the JWT as an HTTP-only cookie
	domain := "" // Default domain is the current domain

	// In development, don't set secure flag for local testing
	isProduction := h.cfg.Server.Env == "production"

	// Set the cookie with appropriate security settings
	if isProduction {
		// In production, use more secure settings
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, true, true)
	} else {
		// For development, allow non-HTTPS
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, false, true)
	}

	// Return token in body for backward compatibility
	c.JSON(http.StatusOK, VerifyResponse{
		Token:   tokenString,
		Expires: expirationTime.Unix(),
	})
}

// CheckAuthStatus godoc
// @Summary Check Authentication Status
// @Description Checks if the user is authenticated via cookie
// @Tags Authentication
// @Produce json
// @Success 200 {object} StatusResponse
// @Failure 401 {object} ErrorResponse
// @Router /auth/status [get]
func (h *AuthHandler) CheckAuthStatus(c *gin.Context) {
	// Extract the cookie
	tokenString, err := c.Cookie("jwt_token")
	if err != nil {
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated: false,
		})
		return
	}

	// Parse and validate the token
	token, err := jwt.ParseWithClaims(tokenString, &models.JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.cfg.JWT.Secret), nil
	})

	if err != nil || !token.Valid {
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated: false,
		})
		return
	}

	// Get the user info from the token
	claims, ok := token.Claims.(*models.JWTClaims)
	if !ok {
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated: false,
		})
		return
	}

	// Return the user's authentication status and address
	c.JSON(http.StatusOK, StatusResponse{
		Authenticated: true,
		Address:       claims.WalletAddress,
	})
}

// Logout godoc
// @Summary Logout User
// @Description Logs out the user by clearing the JWT cookie
// @Tags Authentication
// @Produce json
// @Success 200 {object} map[string]string
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// Clear the cookie by setting an expired one
	domain := "" // Default domain is the current domain
	c.SetCookie("jwt_token", "", -1, "/", domain, false, true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Successfully logged out",
	})
}

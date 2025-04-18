package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/fws/backend/config"
	"github.com/fws/backend/internal/models"
	"github.com/fws/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

var authLog = logrus.New()

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
	ProofSetReady bool   `json:"proofSetReady"`
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

	// Check if the user has a proof set, create one in background if not
	go h.ensureProofSetExists(&user)

	// Generate a JWT token IMMEDIATELY
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
	isProduction := h.cfg.Server.Env == "production"
	if isProduction {
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, true, true)
	} else {
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, false, true)
	}

	// Return token in body
	c.JSON(http.StatusOK, VerifyResponse{
		Token:   tokenString,
		Expires: expirationTime.Unix(),
	})
}

// New helper function to check and potentially create proof set in background
func (h *AuthHandler) ensureProofSetExists(user *models.User) {
	var proofSetCount int64
	if err := h.db.Model(&models.ProofSet{}).Where("user_id = ?", user.ID).Count(&proofSetCount).Error; err != nil {
		authLog.WithField("userID", user.ID).Errorf("[Goroutine Check] Error counting proof sets: %v", err)
		return // Log error and exit goroutine
	}

	if proofSetCount == 0 {
		authLog.WithField("userID", user.ID).Info("[Goroutine Check] No proof set found, initiating creation.")
		if createErr := h.createProofSetForUser(user); createErr != nil {
			authLog.WithField("userID", user.ID).Errorf("[Goroutine Create] Background proof set creation failed: %v", createErr)
			// TODO: Consider adding a mechanism to notify the user or allow retry
		}
	} else {
		authLog.WithField("userID", user.ID).Debug("[Goroutine Check] Proof set already exists.")
	}
}

// createProofSetForUser remains mostly the same - designed to be called by ensureProofSetExists
func (h *AuthHandler) createProofSetForUser(user *models.User) error {
	pdptoolPath := h.cfg.PdptoolPath
	if pdptoolPath == "" {
		pdptoolPath = "/Users/art3mis/Developer/opensource/protocol/curio/pdptool" // Fallback path
		authLog.Warn("pdptoolPath not configured, using default: ", pdptoolPath)
	}
	serviceName := "pdp-artemis"
	serviceURL := "https://yablu.net"
	recordKeeper := "0x6170dE2b09b404776197485F3dc6c968Ef948505"

	authLog.Infof("[Goroutine Create] Creating proof set for user %d...", user.ID)

	createProofSetCmd := exec.Command(
		pdptoolPath,
		"create-proof-set",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--recordkeeper", recordKeeper,
	)

	var createProofSetOutput bytes.Buffer
	var createProofSetError bytes.Buffer
	createProofSetCmd.Stdout = &createProofSetOutput
	createProofSetCmd.Stderr = &createProofSetError
	createProofSetCmd.Dir = filepath.Dir(pdptoolPath)

	if err := createProofSetCmd.Run(); err != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to run create-proof-set command for user %d: %v, stderr: %s", user.ID, err, createProofSetError.String())
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}

	outputStr := createProofSetOutput.String()
	authLog.WithField("createOutput", outputStr).Debug("[Goroutine Create] Create proof set output for user ", user.ID)

	directProofSetIDRegex := regexp.MustCompile(`ProofSet (?:ID|Id|id):[ \t]*(\d+)`)
	directMatches := directProofSetIDRegex.FindStringSubmatch(outputStr)
	var proofSetIDStr string
	var txHash string = "direct_or_unknown"

	if len(directMatches) > 1 {
		proofSetIDStr = directMatches[1]
		authLog.WithField("directProofSetID", proofSetIDStr).Info("[Goroutine Create] Found proof set ID directly in creation output for user ", user.ID)
	} else {
		txHashRegex := regexp.MustCompile(`0x[a-fA-F0-9]{64}`)
		txHashMatches := txHashRegex.FindStringSubmatch(outputStr)
		if len(txHashMatches) == 0 {
			errMsg := fmt.Sprintf("[Goroutine Create] Failed to extract transaction hash or direct ProofSet ID for user %d", user.ID)
			authLog.Error(errMsg)
			return fmt.Errorf(errMsg)
		}
		txHash = txHashMatches[0]
		authLog.WithField("txHash", txHash).Info("[Goroutine Create] Extracted transaction hash for user %d, polling...", user.ID)

		extractedID, err := h.pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash, user)
		if err != nil {
			authLog.Errorf("[Goroutine Create] Failed to poll for proof set ID for user %d: %v", user.ID, err)
			return err
		}
		proofSetIDStr = extractedID
	}

	// Save the new proof set to the database
	newProofSet := models.ProofSet{
		UserID:          user.ID,
		ProofSetID:      proofSetIDStr,
		TransactionHash: txHash,
		ServiceName:     serviceName,
		ServiceURL:      serviceURL,
	}

	if result := h.db.Create(&newProofSet); result.Error != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to save new proof set info for user %d: %v", user.ID, result.Error)
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}

	authLog.WithField("proofSetDBID", newProofSet.ID).WithField("proofSetPdpID", newProofSet.ProofSetID).Infof("[Goroutine Create] Successfully created and saved proof set for user %d", user.ID)
	return nil
}

// pollForProofSetID remains the same (indefinite polling)
func (h *AuthHandler) pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash string, user *models.User) (string, error) {
	proofSetIDRegexPatterns := []*regexp.Regexp{
		regexp.MustCompile(`ProofSet ID: (\d+)`), // This is the primary expected format
		regexp.MustCompile(`ProofSet ID:[ \t]*(\d+)`),
		regexp.MustCompile(`Proof Set ID:[ \t]*(\d+)`),
		regexp.MustCompile(`ProofSet[^:]*ID:[ \t]*(\d+)`),
		regexp.MustCompile(`ProofsetID:[ \t]*(\d+)`),
		regexp.MustCompile(`Proofset ID:[ \t]*(\d+)`),
		regexp.MustCompile(`ID:[ \t]*(\d+)`),
	}

	var proofSetIDStr string
	sleepDuration := 5 * time.Second // Keep the sleep duration
	attemptCounter := 0

	for { // Loop indefinitely
		attemptCounter++
		// Create a new command object for each attempt
		getStatusCmd := exec.Command(
			pdptoolPath,
			"get-proof-set-create-status",
			"--service-url", serviceURL,
			"--service-name", serviceName,
			"--tx-hash", txHash,
		)

		var getStatusOutput bytes.Buffer
		var getStatusError bytes.Buffer
		getStatusCmd.Stdout = &getStatusOutput
		getStatusCmd.Stderr = &getStatusError
		getStatusCmd.Dir = filepath.Dir(pdptoolPath)

		if err := getStatusCmd.Run(); err != nil {
			authLog.WithField("error", err.Error()).WithField("stderr", getStatusError.String()).Warn("[Goroutine Polling] Failed to run get proof set status command, retrying...")
			time.Sleep(sleepDuration)
			continue
		}

		statusOutput := getStatusOutput.String()
		authLog.WithField("statusOutput", statusOutput).Debug("[Goroutine Polling] Proof set status output for user ", user.ID)

		for _, regex := range proofSetIDRegexPatterns {
			proofSetIDMatches := regex.FindStringSubmatch(statusOutput)
			if len(proofSetIDMatches) > 1 {
				proofSetIDStr = proofSetIDMatches[1]
				authLog.WithField("proofSetID", proofSetIDStr).WithField("attempts", attemptCounter).Info("[Goroutine Polling] Successfully extracted proof set ID")
				return proofSetIDStr, nil // Success
			}
		}

		// Log progress periodically
		if attemptCounter%10 == 0 {
			authLog.WithField("attempt", attemptCounter).Info("[Goroutine Polling] Still waiting for proof set ID to become available...")
		}

		time.Sleep(sleepDuration)
	}

	// Code below this loop might be unreachable now unless the loop is broken by other means in the future.
	// Kept for robustness in case loop structure changes.

	// Fallback after retries: list proof sets and try to find the one with matching extra data
	authLog.Warn("[Goroutine Polling] Polling loop exited unexpectedly, trying list-proof-sets fallback")
	listProofSetsCmd := exec.Command(
		pdptoolPath,
		"list-proof-sets",
		"--service-url", serviceURL,
		"--service-name", serviceName,
	)
	var listOutput bytes.Buffer
	listProofSetsCmd.Stdout = &listOutput
	listProofSetsCmd.Dir = filepath.Dir(pdptoolPath)
	if err := listProofSetsCmd.Run(); err == nil {
		listOutputStr := listOutput.String()
		authLog.WithField("listOutput", listOutputStr).Debug("[Goroutine Polling] List proof sets output for fallback")

		// Simple extraction: find the last line that looks like an ID line
		lines := strings.Split(listOutputStr, "\n")
		lastID := ""
		idLineRegex := regexp.MustCompile(`ID:[ \t]*(\d+)`)
		for _, line := range lines {
			matches := idLineRegex.FindStringSubmatch(line)
			if len(matches) > 1 {
				lastID = matches[1]
			}
		}
		if lastID != "" {
			proofSetIDStr = lastID
			authLog.WithField("fallbackListID", proofSetIDStr).Info("[Goroutine Polling] Using last ID found via list-proof-sets fallback")
			return proofSetIDStr, nil
		}
	}

	return "", fmt.Errorf("failed to extract proof set ID even after fallback attempts")
}

// CheckAuthStatus godoc
// @Summary Check Authentication Status
// @Description Checks if the user is authenticated via cookie and if their proof set is ready
// @Tags Authentication
// @Produce json
// @Success 200 {object} StatusResponse
// @Failure 401 {object} ErrorResponse
// @Router /auth/status [get]
func (h *AuthHandler) CheckAuthStatus(c *gin.Context) {
	tokenString, err := c.Cookie("jwt_token")
	if err != nil {
		c.JSON(http.StatusOK, StatusResponse{Authenticated: false, ProofSetReady: false})
		return
	}

	token, err := jwt.ParseWithClaims(tokenString, &models.JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.cfg.JWT.Secret), nil
	})

	if err != nil || !token.Valid {
		c.SetCookie("jwt_token", "", -1, "/", "", false, true) // Clear invalid cookie
		c.JSON(http.StatusOK, StatusResponse{Authenticated: false, ProofSetReady: false})
		return
	}

	claims, ok := token.Claims.(*models.JWTClaims)
	if !ok {
		c.SetCookie("jwt_token", "", -1, "/", "", false, true) // Clear invalid cookie
		c.JSON(http.StatusOK, StatusResponse{Authenticated: false, ProofSetReady: false})
		return
	}

	// Check proof set readiness
	var proofSet models.ProofSet
	isReady := false
	if err := h.db.Where("user_id = ?", claims.UserID).First(&proofSet).Error; err == nil {
		// Record found, check if the ProofSetID (from PDP service) is populated
		if proofSet.ProofSetID != "" {
			isReady = true
		}
	} else if err != gorm.ErrRecordNotFound {
		// Log other DB errors
		authLog.WithField("userID", claims.UserID).Errorf("Error checking proof set readiness in /auth/status: %v", err)
	}

	c.JSON(http.StatusOK, StatusResponse{
		Authenticated: true,
		Address:       claims.WalletAddress,
		ProofSetReady: isReady,
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

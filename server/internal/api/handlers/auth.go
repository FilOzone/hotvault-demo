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

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
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

	fmt.Printf("Verifying signature - Address: %s, Nonce: %s, Message: %s\n",
		req.Address, user.Nonce, req.Message)

	var valid bool
	var err error

	if req.Message != "" {
		expectedPrefix := fmt.Sprintf("Sign this message to authenticate with FWS: %s", user.Nonce)
		if req.Message == expectedPrefix {
			valid, err = h.ethService.VerifySignature(req.Address, req.Message, req.Signature)
		} else {
			fmt.Println("Message format does not match expected format")
			fmt.Printf("Expected: %s\nActual: %s\n", expectedPrefix, req.Message)
			c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "Invalid message format"})
			return
		}
	} else {
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
		return
	}

	if proofSetCount == 0 {
		authLog.WithField("userID", user.ID).Info("[Goroutine Check] No proof set found, initiating creation.")
		if createErr := h.createProofSetForUser(user); createErr != nil {
			authLog.WithField("userID", user.ID).Errorf("[Goroutine Create] Background proof set creation failed: %v", createErr)
		}
	} else {
		authLog.WithField("userID", user.ID).Debug("[Goroutine Check] Proof set already exists.")
	}
}

// createProofSetForUser remains mostly the same - designed to be called by ensureProofSetExists
func (h *AuthHandler) createProofSetForUser(user *models.User) error {
	pdptoolPath := h.cfg.PdptoolPath
	if pdptoolPath == "" {
		return fmt.Errorf("pdptool path not configured")
	}
	serviceName := h.cfg.ServiceName
	serviceURL := h.cfg.ServiceURL
	recordKeeper := h.cfg.RecordKeeper

	if serviceName == "" || serviceURL == "" || recordKeeper == "" {
		errMsg := "Service Name, Service URL, or Record Keeper not configured"
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}

	authLog.Infof("[Goroutine Create] Creating proof set for user %d (Address: %s)...", user.ID, user.WalletAddress)

	metadata := fmt.Sprintf("fws-user-%d", user.ID)
	payerAddress := user.WalletAddress

	extraDataHex, err := encodeExtraData(metadata, payerAddress)
	if err != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to ABI encode extra data for user %d: %v", user.ID, err)
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}
	authLog.WithField("extraDataHex", extraDataHex).Info("[Goroutine Create] ABI encoded extra data for user ", user.ID)

	createProofSetArgs := []string{
		"create-proof-set",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--recordkeeper", recordKeeper,
		"--extra-data", extraDataHex,
	}

	createProofSetCmd := exec.Command(pdptoolPath, createProofSetArgs...)

	var createProofSetOutput bytes.Buffer
	var createProofSetError bytes.Buffer
	createProofSetCmd.Stdout = &createProofSetOutput
	createProofSetCmd.Stderr = &createProofSetError
	createProofSetCmd.Dir = filepath.Dir(pdptoolPath)

	authLog.WithField("command", pdptoolPath+" "+strings.Join(createProofSetArgs, " ")).Info("[Goroutine Create] Executing create-proof-set command for user ", user.ID)

	if err := createProofSetCmd.Run(); err != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to run create-proof-set command for user %d: %v, stderr: %s", user.ID, err, createProofSetError.String())
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}

	outputStr := createProofSetOutput.String()
	authLog.WithField("createOutput", outputStr).Debug("[Goroutine Create] Create proof set output for user ", user.ID)

	txHashRegex := regexp.MustCompile(`Location: /pdp/proof-sets/created/(0x[a-fA-F0-9]{64})`)
	txHashMatches := txHashRegex.FindStringSubmatch(outputStr)
	var txHash string

	if len(txHashMatches) > 1 {
		txHash = txHashMatches[1]
		authLog.WithField("txHash", txHash).Info("[Goroutine Create] Extracted transaction hash for user %d, polling...", user.ID)
	} else {
		authLog.Warn("[Goroutine Create] Could not extract transaction hash using Location regex for user ", user.ID, ". Check pdptool output format.")
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to extract transaction hash needed for polling for user %d. Output: %s", user.ID, outputStr)
		authLog.Error(errMsg)
		return fmt.Errorf(errMsg)
	}

	extractedID, pollErr := h.pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash, user)
	if pollErr != nil {
		authLog.Errorf("[Goroutine Create] Failed to poll for proof set ID for user %d: %v", user.ID, pollErr)
		return pollErr
	}

	newProofSet := models.ProofSet{
		UserID:          user.ID,
		ProofSetID:      extractedID,
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

// pollForProofSetID polls the status using the transaction hash and extracts the ProofSet ID string
func (h *AuthHandler) pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash string, user *models.User) (string, error) {
	proofSetIDRegex := regexp.MustCompile(`ProofSet ID:[ \t]*(\d+)`)
	creationStatusRegex := regexp.MustCompile(`Proofset Created:[ \t]*(true|false)`)
	txStatusRegex := regexp.MustCompile(`Transaction Status:[ \t]*(confirmed|pending|failed)`)
	txSuccessRegex := regexp.MustCompile(`Transaction Successful:[ \t]*(true|false|Pending)`)

	sleepDuration := 10 * time.Second
	attemptCounter := 0
	const maxLogInterval = 6

	authLog.WithField("txHash", txHash).Info("[Goroutine Polling] Starting polling for ProofSet ID for user ", user.ID)

	for {
		attemptCounter++
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

		authLog.Debugf("[Goroutine Polling] Attempt %d: Executing %s", attemptCounter, getStatusCmd.String())

		err := getStatusCmd.Run()
		statusOutput := getStatusOutput.String()
		statusStderr := getStatusError.String()

		if err != nil {
			authLog.WithField("error", err.Error()).WithField("stderr", statusStderr).Warnf("[Goroutine Polling] Attempt %d: Failed to run get proof set status command, retrying in %v...", attemptCounter, sleepDuration)
			time.Sleep(sleepDuration)
			continue
		}

		authLog.WithField("statusOutput", statusOutput).Debugf("[Goroutine Polling] Attempt %d: Proof set status output for user %d", attemptCounter, user.ID)

		txStatusMatch := txStatusRegex.FindStringSubmatch(statusOutput)
		txSuccessMatch := txSuccessRegex.FindStringSubmatch(statusOutput)
		createdMatch := creationStatusRegex.FindStringSubmatch(statusOutput)
		idMatch := proofSetIDRegex.FindStringSubmatch(statusOutput)

		var txStatus, txSuccess, createdStatus string
		if len(txStatusMatch) > 1 {
			txStatus = txStatusMatch[1]
		}
		if len(txSuccessMatch) > 1 {
			txSuccess = txSuccessMatch[1]
		}
		if len(createdMatch) > 1 {
			createdStatus = createdMatch[1]
		}

		if txStatus == "confirmed" && txSuccess == "true" && createdStatus == "true" && len(idMatch) > 1 {
			proofSetIDStr := idMatch[1]
			authLog.WithField("proofSetID", proofSetIDStr).WithField("attempts", attemptCounter).Infof("[Goroutine Polling] Successfully extracted proof set ID for user %d", user.ID)
			return proofSetIDStr, nil
		}

		if txStatus == "confirmed" && txSuccess == "true" && createdStatus == "false" {
			authLog.Infof("[Goroutine Polling] Attempt %d: Transaction confirmed for user %d, but proofset creation still processing (TxStatus: %s, TxSuccess: %s, CreatedStatus: %s)... Polling again in %v.",
				attemptCounter, user.ID, txStatus, txSuccess, createdStatus, sleepDuration)
			time.Sleep(sleepDuration)
			continue
		}

		if txStatus == "confirmed" && (txSuccess == "false" || (createdStatus == "true" && len(idMatch) == 0)) {
			authLog.Errorf("[Goroutine Polling] Proof set creation failed or stalled for user %d (TxStatus: %s, TxSuccess: %s, CreatedStatus: %s, ID Found: %t). Output: %s",
				user.ID, txStatus, txSuccess, createdStatus, len(idMatch) > 1, statusOutput)
			return "", fmt.Errorf("proof set creation failed or stalled post-confirmation for tx %s (status: %s, success: %s, created: %s)", txHash, txStatus, txSuccess, createdStatus)
		}

		if txStatus == "failed" {
			authLog.Errorf("[Goroutine Polling] Proof set creation transaction failed for user %d (TxStatus: %s). Output: %s",
				user.ID, txStatus, statusOutput)
			return "", fmt.Errorf("proof set creation transaction failed for tx %s (status: %s)", txHash, txStatus)
		}

		if txStatus == "pending" || txStatus == "" {
			authLog.Infof("[Goroutine Polling] Attempt %d: Proof set creation still pending for user %d (TxStatus: '%s')... Polling again in %v.", attemptCounter, user.ID, txStatus, sleepDuration)
			if attemptCounter%maxLogInterval == 0 {
				authLog.WithField("attempt", attemptCounter).Info("[Goroutine Polling] Still waiting for proof set ID for user ", user.ID, " (TxHash: ", txHash, ")")
			}
			time.Sleep(sleepDuration)
			continue
		}

		authLog.Warnf("[Goroutine Polling] Attempt %d: Encountered unhandled status for user %d (TxStatus: %s, TxSuccess: %s, CreatedStatus: %s). Retrying in %v... Output: %s",
			attemptCounter, user.ID, txStatus, txSuccess, createdStatus, sleepDuration, statusOutput)
		time.Sleep(sleepDuration)
	}

	return "", fmt.Errorf("polling loop exited unexpectedly for tx %s", txHash)
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
		c.SetCookie("jwt_token", "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, StatusResponse{Authenticated: false, ProofSetReady: false})
		return
	}

	claims, ok := token.Claims.(*models.JWTClaims)
	if !ok {
		c.SetCookie("jwt_token", "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, StatusResponse{Authenticated: false, ProofSetReady: false})
		return
	}

	var proofSet models.ProofSet
	isReady := false
	if err := h.db.Where("user_id = ?", claims.UserID).First(&proofSet).Error; err == nil {
		if proofSet.ProofSetID != "" {
			isReady = true
		}
	} else if err != gorm.ErrRecordNotFound {
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
	domain := ""
	c.SetCookie("jwt_token", "", -1, "/", domain, false, true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Successfully logged out",
	})
}

// encodeExtraData encodes the metadata and payer address according to the expected ABI.
func encodeExtraData(metadata string, payerAddress string) (string, error) {
	StringTy, err := abi.NewType("string", "", nil)
	if err != nil {
		return "", fmt.Errorf("failed to create string type: %w", err)
	}
	AddressTy, err := abi.NewType("address", "", nil)
	if err != nil {
		return "", fmt.Errorf("failed to create address type: %w", err)
	}

	arguments := abi.Arguments{
		{Type: StringTy, Name: "metadata"},
		{Type: AddressTy, Name: "payer"},
	}

	if !common.IsHexAddress(payerAddress) {
		return "", fmt.Errorf("invalid payer address format: %s", payerAddress)
	}
	payer := common.HexToAddress(payerAddress)

	packedBytes, err := arguments.Pack(metadata, payer)
	if err != nil {
		return "", fmt.Errorf("failed to pack ABI arguments: %w", err)
	}

	return hex.EncodeToString(packedBytes), nil
}

package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/hotvault/backend/config"
	"github.com/hotvault/backend/internal/models"
	"github.com/hotvault/backend/internal/services"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

var authLog = logrus.New()

type ErrorResponse struct {
	Error string `json:"error" example:"Invalid request"`
}

type AuthHandler struct {
	db         *gorm.DB
	cfg        *config.Config
	ethService *services.EthereumService
}

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
	Authenticated     bool   `json:"authenticated" example:"true"`
	Address           string `json:"address,omitempty" example:"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"`
	ProofSetReady     bool   `json:"proofSetReady" example:"true"`
	ProofSetInitiated bool   `json:"proofSetInitiated" example:"true"`
}

// VerifyRequest represents the request for verifying a signature
// @Description Request body for verifying a signature
type VerifyRequest struct {
	Address   string `json:"address" binding:"required,hexadecimal" example:"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"`
	Signature string `json:"signature" binding:"required,hexadecimal" example:"0x1234567890abcdef"`
	Message   string `json:"message,omitempty" example:"Sign this message to login to Hot Vault (No funds will be transferred in this step): 7a39f642c2608fd2"`
}

// VerifyResponse represents the response for a verification request
// @Description Response containing the JWT token and expiration
type VerifyResponse struct {
	Token   string `json:"token" example:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
	Expires int64  `json:"expires" example:"1679529600"`
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
		expectedPrefix := fmt.Sprintf("Sign this message to login to Hot Vault (No funds will be transferred in this step): %s", user.Nonce)
		if req.Message == expectedPrefix {
			valid, err = h.ethService.VerifySignature(req.Address, req.Message, req.Signature)
		} else {
			fmt.Println("Message format does not match expected format")
			fmt.Printf("Expected: %s\nActual: %s\n", expectedPrefix, req.Message)
			c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "Invalid message format"})
			return
		}
	} else {
		message := fmt.Sprintf("Sign this message to login to Hot Vault (No funds will be transferred in this step): %s", user.Nonce)
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

	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to generate nonce"})
		return
	}
	newNonce := hex.EncodeToString(nonceBytes)

	if err := h.db.Model(&user).Update("nonce", newNonce).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to update nonce"})
		return
	}

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

	domain := "" // Default domain is the current domain
	isProduction := h.cfg.Server.Env == "production"
	if isProduction {
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, true, true)
	} else {
		c.SetCookie("jwt_token", tokenString, int(h.cfg.JWT.Expiration.Seconds()), "/", domain, false, true)
	}

	c.JSON(http.StatusOK, VerifyResponse{
		Token:   tokenString,
		Expires: expirationTime.Unix(),
	})
}

// CreateProofSet godoc
// @Summary Create Proof Set
// @Description Manually initiates the creation of a proof set for the authenticated user if one doesn't exist.
// @Tags Proof Set
// @Security ApiKeyAuth
// @Produce json
// @Success 200 {object} map[string]interface{} "message:Proof set creation initiated successfully"
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /proof-set/create [post]
func (h *AuthHandler) CreateProofSet(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "Unauthorized: User ID not found in token"})
		return
	}

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "User not found"})
		return
	}

	var existingProofSet models.ProofSet
	err := h.db.Where("user_id = ?", user.ID).First(&existingProofSet).Error
	if err == nil {
		if existingProofSet.ProofSetID != "" {
			authLog.WithField("userID", user.ID).Warn("CreateProofSet called but ProofSetID already exists.")
			c.JSON(http.StatusConflict, ErrorResponse{Error: "Proof set already exists and is complete for this user"})
			return
		}
		if existingProofSet.TransactionHash != "" {
			authLog.WithField("userID", user.ID).Warn("CreateProofSet called but TransactionHash exists (creation likely in progress).")
			c.JSON(http.StatusConflict, ErrorResponse{Error: "Proof set creation is already in progress for this user. Check status."})
			return
		}
		authLog.WithField("userID", user.ID).Info("Found existing proof set record with empty fields, proceeding with creation attempt.")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		authLog.WithField("userID", user.ID).Errorf("Error checking for existing proof set: %v", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "Failed to check for existing proof sets"})
		return
	} else {
		authLog.WithField("userID", user.ID).Info("No existing proof set record found.")
	}

	go func(u *models.User) {
		authLog.WithField("userID", u.ID).Info("Starting background proof set creation...")
		if err := h.createProofSetForUser(u); err != nil {
			authLog.WithField("userID", u.ID).Errorf("Background proof set creation failed: %v", err)
		} else {
			authLog.WithField("userID", u.ID).Info("Background proof set creation completed successfully.")
		}
	}(&user)

	c.JSON(http.StatusOK, gin.H{"message": "Proof set creation initiated successfully. Monitor /auth/status for readiness."})
}

func (h *AuthHandler) createProofSetForUser(user *models.User) error {
	pdptoolPath := h.cfg.PdptoolPath
	if pdptoolPath == "" {
		return errors.New("pdptool path not configured")
	}
	serviceName := h.cfg.ServiceName
	serviceURL := h.cfg.ServiceURL
	recordKeeper := h.cfg.RecordKeeper

	if serviceName == "" || serviceURL == "" || recordKeeper == "" {
		errMsg := "service name, service url, or record keeper not configured"
		authLog.Error(errMsg)
		return errors.New(errMsg)
	}

	// Change working directory to pdptool directory
	pdptoolDir := getPdptoolParentDir(pdptoolPath)
	if err := os.Chdir(pdptoolDir); err != nil {
		errMsg := fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err)
		authLog.Error(errMsg)
		return errors.New(errMsg)
	}
	authLog.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")

	authLog.Infof("[Goroutine Create] Creating proof set for user %d (Address: %s)...", user.ID, user.WalletAddress)

	metadata := fmt.Sprintf("hotvault-user-%d", user.ID)
	payerAddress := user.WalletAddress

	extraDataHex, err := encodeExtraData(metadata, payerAddress)
	if err != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to ABI encode extra data for user %d: %v", user.ID, err)
		authLog.Error(errMsg)
		return errors.New(errMsg)
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

	authLog.WithField("command", pdptoolPath+" "+strings.Join(createProofSetArgs, " ")).Info("[Goroutine Create] Executing create-proof-set command for user ", user.ID)

	if err := createProofSetCmd.Run(); err != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to run create-proof-set command for user %d: %v", user.ID, err)
		authLog.WithFields(logrus.Fields{
			"userID":  user.ID,
			"error":   err.Error(),
			"stderr":  createProofSetError.String(),
			"stdout":  createProofSetOutput.String(),
			"command": pdptoolPath + " " + strings.Join(createProofSetArgs, " "),
		}).Error(errMsg)
		return errors.New(errMsg + ", stderr: " + createProofSetError.String())
	}

	outputStr := createProofSetOutput.String()
	authLog.WithField("createOutput", outputStr).Debug("[Goroutine Create] Create proof set output for user ", user.ID)

	txHashRegex := regexp.MustCompile(`Location: /pdp/proof-sets/created/(0x[a-fA-F0-9]{64})`)
	txHashMatches := txHashRegex.FindStringSubmatch(outputStr)
	var txHash string

	if len(txHashMatches) > 1 {
		txHash = txHashMatches[1]
		authLog.WithField("txHash", txHash).Infof("[Goroutine Create] Extracted transaction hash for user %d. Updating database and starting polling...", user.ID)

		proofSetToUpdate := models.ProofSet{
			UserID:          user.ID,
			TransactionHash: txHash,
			ServiceName:     serviceName,
			ServiceURL:      serviceURL,
		}
		result := h.db.Where(models.ProofSet{UserID: user.ID}).Assign(proofSetToUpdate).FirstOrCreate(&models.ProofSet{})
		if result.Error != nil {
			errMsg := fmt.Sprintf("[Goroutine Create] Failed to save/update proof set with txHash for user %d: %v", user.ID, result.Error)
			authLog.Error(errMsg)
			return errors.New(errMsg)
		}

	} else {
		authLog.Warn("[Goroutine Create] Could not extract transaction hash using Location regex for user ", user.ID, ". Check pdptool output format.")
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to extract transaction hash needed for polling for user %d. Output: %s", user.ID, outputStr)
		authLog.Error(errMsg)
		return errors.New(errMsg)
	}

	extractedID, pollErr := h.pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash, user)
	if pollErr != nil {
		authLog.Errorf("[Goroutine Create] Failed to poll for proof set ID for user %d: %v", user.ID, pollErr)
		return pollErr
	}

	finalUpdate := models.ProofSet{
		ProofSetID: extractedID,
	}
	result := h.db.Model(&models.ProofSet{}).Where("user_id = ?", user.ID).Updates(finalUpdate)
	if result.Error != nil {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to update proof set with ProofSetID for user %d: %v", user.ID, result.Error)
		authLog.Error(errMsg)
		return errors.New(errMsg)
	}
	if result.RowsAffected == 0 {
		errMsg := fmt.Sprintf("[Goroutine Create] Failed to find proof set record for user %d to update with ProofSetID", user.ID)
		authLog.Error(errMsg)
		return errors.New(errMsg)
	}
	authLog.WithField("proofSetPdpID", extractedID).Infof("[Goroutine Create] Successfully updated proof set with ID for user %d", user.ID)
	return nil
}

func (h *AuthHandler) pollForProofSetID(pdptoolPath, serviceURL, serviceName, txHash string, user *models.User) (string, error) {
	proofSetIDRegex := regexp.MustCompile(`ProofSet ID:[ \t]*(\d+)`)
	creationStatusRegex := regexp.MustCompile(`Proofset Created:[ \t]*(true|false)`)
	txStatusRegex := regexp.MustCompile(`Transaction Status:[ \t]*(confirmed|pending|failed)`)
	txSuccessRegex := regexp.MustCompile(`Transaction Successful:[ \t]*(true|false|Pending)`)

	// Change working directory to pdptool directory
	pdptoolDir := getPdptoolParentDir(pdptoolPath)
	if err := os.Chdir(pdptoolDir); err != nil {
		errMsg := fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err)
		authLog.Error(errMsg)
		return "", errors.New(errMsg)
	}
	authLog.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")

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

		cmdString := fmt.Sprintf("%s %s", pdptoolPath, strings.Join(getStatusCmd.Args[1:], " "))
		authLog.WithField("command", cmdString).
			WithField("attempt", attemptCounter).
			WithField("txHash", txHash).
			WithField("userID", user.ID).
			Info("[Goroutine Polling] Executing get-proof-set-create-status command")

		err := getStatusCmd.Run()
		statusOutput := getStatusOutput.String()
		statusStderr := getStatusError.String()

		if err != nil {
			authLog.WithField("error", err.Error()).
				WithField("stderr", statusStderr).
				WithField("command", cmdString).
				WithField("attempt", attemptCounter).
				WithField("userID", user.ID).
				Warnf("[Goroutine Polling] Failed to run get-proof-set-create-status command, retrying in %v...", sleepDuration)
			time.Sleep(sleepDuration)
			continue
		}

		authLog.WithField("statusOutput", statusOutput).
			WithField("attempt", attemptCounter).
			WithField("userID", user.ID).
			WithField("txHash", txHash).
			Info("[Goroutine Polling] get-proof-set-create-status command output")

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

		// Log the status details for each polling attempt
		var idMatchValue string
		if len(idMatch) > 1 {
			idMatchValue = idMatch[1]
		} else {
			idMatchValue = "none"
		}

		authLog.WithFields(logrus.Fields{
			"userID":        user.ID,
			"txHash":        txHash,
			"attempt":       attemptCounter,
			"txStatus":      txStatus,
			"txSuccess":     txSuccess,
			"createdStatus": createdStatus,
			"idFound":       len(idMatch) > 1,
			"idMatch":       idMatchValue,
		}).Info("[Goroutine Polling] Current proof set creation status")

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
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated:     false,
			ProofSetReady:     false,
			ProofSetInitiated: false,
		})
		return
	}

	token, err := jwt.ParseWithClaims(tokenString, &models.JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.cfg.JWT.Secret), nil
	})

	if err != nil || !token.Valid {
		c.SetCookie("jwt_token", "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated:     false,
			ProofSetReady:     false,
			ProofSetInitiated: false,
		})
		return
	}

	claims, ok := token.Claims.(*models.JWTClaims)
	if !ok {
		c.SetCookie("jwt_token", "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, StatusResponse{
			Authenticated:     false,
			ProofSetReady:     false,
			ProofSetInitiated: false,
		})
		return
	}

	var proofSet models.ProofSet
	isReady := false
	isInitiated := false
	if err := h.db.Where("user_id = ?", claims.UserID).First(&proofSet).Error; err == nil {
		if proofSet.ProofSetID != "" {
			isReady = true
		}
		if proofSet.TransactionHash != "" {
			isInitiated = true
		}
	} else if err != gorm.ErrRecordNotFound {
		authLog.WithField("userID", claims.UserID).Errorf("Error checking proof set readiness in /auth/status: %v", err)
	}

	c.JSON(http.StatusOK, StatusResponse{
		Authenticated:     true,
		Address:           claims.WalletAddress,
		ProofSetReady:     isReady,
		ProofSetInitiated: isInitiated,
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

func encodeExtraData(metadata string, payerAddress string) (string, error) {
	if !common.IsHexAddress(payerAddress) {
		return "", fmt.Errorf("invalid payer address format: %s", payerAddress)
	}

	structTy, err := abi.NewType("tuple", "", []abi.ArgumentMarshaling{
		{
			Name: "metadata",
			Type: "string",
		},
		{
			Name: "payer",
			Type: "address",
		},
	})

	if err != nil {
		return "", fmt.Errorf("failed to create struct type: %w", err)
	}

	arguments := abi.Arguments{
		{
			Type: structTy,
		},
	}

	structData := struct {
		Metadata string
		Payer    common.Address
	}{
		Metadata: metadata,
		Payer:    common.HexToAddress(payerAddress),
	}

	packedBytes, err := arguments.Pack(structData)
	if err != nil {
		return "", fmt.Errorf("failed to pack ABI arguments: %w", err)
	}

	return hex.EncodeToString(packedBytes), nil
}

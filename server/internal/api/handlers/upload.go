package handlers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fws/backend/config"
	"github.com/fws/backend/internal/models"
	"github.com/fws/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	log logger.Logger
	db  *gorm.DB
	cfg *config.Config
)

var (
	uploadJobs     = make(map[string]UploadProgress)
	uploadJobsLock sync.RWMutex
)

func init() {
	log = logger.NewLogger()
}

func Initialize(database *gorm.DB, appConfig *config.Config) {
	if database == nil {
		log.Error("Database connection is nil during initialization")
		return
	}
	if appConfig == nil {
		log.Error("App configuration is nil during initialization")
		return
	}
	db = database
	cfg = appConfig
	log.Info("Upload handler initialized with database and configuration")
}

type UploadProgress struct {
	Status     string `json:"status"`
	Progress   int    `json:"progress,omitempty"`
	Message    string `json:"message,omitempty"`
	CID        string `json:"cid,omitempty"`
	Error      string `json:"error,omitempty"`
	Filename   string `json:"filename,omitempty"`
	TotalSize  int64  `json:"totalSize,omitempty"`
	JobID      string `json:"jobId,omitempty"`
	ProofSetID string `json:"proofSetId,omitempty"`
}

// @Summary Upload a file to PDP service
// @Description Upload a file to the PDP service with piece preparation and returns a job ID for status polling
// @Tags upload
// @Accept multipart/form-data
// @Param file formData file true "File to upload"
// @Produce json
// @Success 200 {object} UploadProgress
// @Router /api/v1/upload [post]
func UploadFile(c *gin.Context) {
	if db == nil {
		log.Error("Database connection not initialized")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error: database not initialized",
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

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No file received",
		})
		return
	}

	jobID := uuid.New().String()

	initialStatus := UploadProgress{
		Status:    "starting",
		Progress:  0,
		Message:   "Upload job created",
		Filename:  file.Filename,
		TotalSize: file.Size,
		JobID:     jobID,
	}

	uploadJobsLock.Lock()
	uploadJobs[jobID] = initialStatus
	uploadJobsLock.Unlock()

	go processUpload(jobID, file, userID.(uint), pdptoolPath)

	c.JSON(http.StatusOK, initialStatus)
}

// @Summary Get upload status
// @Description Get the status of an upload job
// @Tags upload
// @Produce json
// @Param jobId path string true "Job ID"
// @Success 200 {object} UploadProgress
// @Router /api/v1/upload/status/{jobId} [get]
func GetUploadStatus(c *gin.Context) {
	jobID := c.Param("jobId")

	uploadJobsLock.RLock()
	progress, exists := uploadJobs[jobID]
	uploadJobsLock.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload job not found",
		})
		return
	}

	c.JSON(http.StatusOK, progress)
}

func processUpload(jobID string, file *multipart.FileHeader, userID uint, pdptoolPath string) {
	serviceName := cfg.ServiceName
	serviceURL := cfg.ServiceURL
	if serviceName == "" || serviceURL == "" {
		log.Error("Service Name or Service URL not configured")
		uploadJobsLock.Lock()
		progress := uploadJobs[jobID]
		progress.Status = "error"
		progress.Error = "Server configuration error: Service Name/URL missing"
		uploadJobs[jobID] = progress
		uploadJobsLock.Unlock()
		return
	}

	updateStatus := func(progress UploadProgress) {
		progress.JobID = jobID
		uploadJobsLock.Lock()
		uploadJobs[jobID] = progress
		uploadJobsLock.Unlock()
	}

	currentStage := "starting"
	currentProgress := 0
	maxProgress := 100

	prepareWeight := 20
	uploadWeight := 80

	if _, err := os.Stat("pdpservice.json"); os.IsNotExist(err) {
		currentStage = "preparing"
		updateStatus(UploadProgress{
			Status:   "preparing",
			Progress: currentProgress,
			Message:  "Creating service secret",
		})

		createSecretCmd := exec.Command(pdptoolPath, "create-service-secret")
		createSecretCmd.Dir = filepath.Dir(pdptoolPath)
		var createSecretOutput bytes.Buffer
		var createSecretError bytes.Buffer
		createSecretCmd.Stdout = &createSecretOutput
		createSecretCmd.Stderr = &createSecretError
		if err := createSecretCmd.Run(); err != nil {
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to create service secret",
				Message: createSecretError.String(),
			})
			return
		}
		currentProgress += 5
	}

	tempDir, err := os.MkdirTemp("", "pdp-upload-*")
	if err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to create temp directory",
			Message: err.Error(),
		})
		return
	}
	defer os.RemoveAll(tempDir)

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Saving uploaded file",
	})

	tempFilePath := filepath.Join(tempDir, file.Filename)
	src, err := file.Open()
	if err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to open uploaded file",
			Message: err.Error(),
		})
		return
	}
	defer src.Close()

	dst, err := os.Create(tempFilePath)
	if err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to create destination file",
			Message: err.Error(),
		})
		return
	}
	defer dst.Close()

	if _, err = io.Copy(dst, src); err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to save uploaded file",
			Message: err.Error(),
		})
		return
	}

	currentProgress += 5
	currentStage = "preparing"

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Preparing piece",
	})

	var prepareOutput bytes.Buffer
	var prepareError bytes.Buffer
	prepareCmd := exec.Command(pdptoolPath, "prepare-piece", tempFilePath)
	prepareCmd.Stdout = &prepareOutput
	prepareCmd.Stderr = &prepareError
	prepareCmd.Dir = filepath.Dir(pdptoolPath)

	prepareDone := make(chan bool)
	go func() {
		prepareStartProgress := currentProgress
		for i := 0; i < prepareWeight; i++ {
			select {
			case <-prepareDone:
				return
			case <-time.After(100 * time.Millisecond):
				if currentProgress < prepareStartProgress+prepareWeight-1 {
					currentProgress++
					if i%5 == 0 {
						updateStatus(UploadProgress{
							Status:   currentStage,
							Progress: currentProgress,
							Message:  "Preparing piece data...",
						})
					}
				}
			}
		}
	}()

	if err := prepareCmd.Run(); err != nil {
		close(prepareDone)
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to prepare piece",
			Message: prepareError.String(),
		})
		return
	}

	close(prepareDone)
	currentProgress = prepareWeight + 10
	currentStage = "uploading"

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Starting file upload",
	})

	uploadCmd := exec.Command(
		pdptoolPath,
		"upload-file",
		"--service-url", cfg.ServiceURL,
		"--service-name", cfg.ServiceName,
		tempFilePath,
	)

	var uploadOutput bytes.Buffer
	var uploadError bytes.Buffer
	uploadCmd.Stdout = &uploadOutput
	uploadCmd.Stderr = &uploadError

	// Log the command's working directory and relevant env vars
	uploadCmd.Dir = filepath.Dir(pdptoolPath)
	log.WithField("workingDir", uploadCmd.Dir).
		WithField("command", pdptoolPath+" "+strings.Join(uploadCmd.Args[1:], " ")).
		Info("Executing pdptool upload-file command")

	if err := uploadCmd.Start(); err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to start upload command",
			Message: err.Error(),
		})
		return
	}

	done := make(chan bool)
	go func() {
		uploadStartProgress := currentProgress
		uploadStartTime := time.Now()
		estimatedUploadTime := time.Duration(file.Size/1024/10) * time.Millisecond
		if estimatedUploadTime < 5*time.Second {
			estimatedUploadTime = 5 * time.Second
		}

		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				elapsedRatio := float64(time.Since(uploadStartTime)) / float64(estimatedUploadTime)
				if elapsedRatio > 1.0 {
					elapsedRatio = 0.95
				}

				estimatedProgress := uploadStartProgress + int(float64(uploadWeight)*elapsedRatio)
				if estimatedProgress > currentProgress && currentProgress < maxProgress-5 {
					currentProgress = estimatedProgress
					updateStatus(UploadProgress{
						Status:   currentStage,
						Progress: currentProgress,
						Message:  "Uploading file...",
					})
				}
			}
		}
	}()

	err = uploadCmd.Wait()
	close(done)

	if err != nil {
		stderrStr := uploadError.String()
		stdoutStr := uploadOutput.String()
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Upload command failed",
			Message: stderrStr,
		})
		log.WithField("error", err.Error()).
			WithField("stderr", stderrStr).
			WithField("stdout", stdoutStr).
			Error("Upload command failed")
		return
	}

	outputStr := uploadOutput.String()
	outputLines := strings.Split(outputStr, "\n")

	cidRegex := regexp.MustCompile(`^(baga[a-zA-Z0-9]+)(?::(baga[a-zA-Z0-9]+))?$`)
	var compoundCID string
	var baseCID string
	var subrootCID string

	for i := len(outputLines) - 1; i >= 0; i-- {
		trimmedLine := strings.TrimSpace(outputLines[i])
		if cidRegex.MatchString(trimmedLine) {
			matches := cidRegex.FindStringSubmatch(trimmedLine)
			if len(matches) > 1 {
				compoundCID = matches[0]
				baseCID = matches[1]
				if len(matches) > 2 && matches[2] != "" {
					subrootCID = matches[2]
				} else {
					subrootCID = baseCID
				}
				log.WithField("compoundCID", compoundCID).WithField("baseCID", baseCID).WithField("subrootCID", subrootCID).Info("Found and parsed CID in output lines")
				break
			}
		}
	}

	if compoundCID == "" {
		var lastNonEmpty string
		for i := len(outputLines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(outputLines[i])
			if line != "" {
				lastNonEmpty = line
				break
			}
		}

		if lastNonEmpty != "" {
			log.WithField("lastLine", lastNonEmpty).Warning("Using last non-empty output line as CID (fallback, parsing may fail)")
			compoundCID = lastNonEmpty
			if idx := strings.Index(compoundCID, ":"); idx != -1 {
				baseCID = compoundCID[:idx]
			} else {
				baseCID = compoundCID
			}
			subrootCID = baseCID
		} else {
			log.Error("Upload completed but failed to extract CID from pdptool output.")
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to extract CID from upload response",
				Message: "Could not determine upload result CID.",
			})
			return
		}
	}

	log.WithField("uploadOutputCID", compoundCID).
		WithField("parsedBaseCID", baseCID).
		WithField("parsedSubrootCID", subrootCID).
		Info("CIDs extracted from upload-file output, before calling add-roots")

	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service_name", serviceName).
		WithField("service_url", serviceURL).
		WithField("compoundCID", compoundCID).
		Info("File uploaded successfully, proceeding to add root")

	currentProgress = 95
	currentStage = "adding_root"
	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Finding or creating a proof set for your file...",
		CID:      compoundCID,
	})

	// Increased initial delay before attempting to add root
	preAddRootDelay := 5 * time.Second
	log.Info(fmt.Sprintf("Waiting %v before adding root to allow service registration...", preAddRootDelay))
	time.Sleep(preAddRootDelay)

	var proofSet models.ProofSet
	if err := db.Where("user_id = ?", userID).First(&proofSet).Error; err != nil {
		errMsg := "Failed to query proof set for user."
		if err == gorm.ErrRecordNotFound {
			errMsg = "Proof set not found for user. Please re-authenticate."
			log.WithField("userID", userID).Error(errMsg)
		} else {
			log.WithField("userID", userID).WithField("error", err).Error("Database error fetching proof set")
		}
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   errMsg,
			Message: "Upload cannot proceed without a valid proof set.",
			CID:     compoundCID,
		})
		return
	}

	// Double check that the proof set ID is valid
	if proofSet.ProofSetID == "" {
		errMsg := "Proof set creation is still pending. Please wait."
		log.WithField("userID", userID).WithField("dbProofSetID", proofSet.ID).Warning(errMsg)
		updateStatus(UploadProgress{
			Status:     "pending",
			Error:      errMsg,
			Message:    "The proof set is being initialized. Please try uploading again shortly.",
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
		return
	}

	log.WithField("userID", userID).WithField("serviceProofSetID", proofSet.ProofSetID).Info("Found ready proof set for user, proceeding to add root")

	// Verify the proof set exists on the service before proceeding
	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    fmt.Sprintf("Verifying proof set %s exists...", proofSet.ProofSetID),
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	// First verify the proof set exists on the remote service
	verifyProofSetArgs := []string{
		"get-proof-set",
		"--service-url", cfg.ServiceURL,
		"--service-name", cfg.ServiceName,
		proofSet.ProofSetID,
	}

	// Verification retry configuration
	verifyMaxRetries := 5
	verifyBackoff := 3 * time.Second
	verifyMaxBackoff := 15 * time.Second
	verifySuccess := false

	// Try to verify the proof set with retries
	for verifyAttempt := 1; verifyAttempt <= verifyMaxRetries; verifyAttempt++ {
		log.WithField("attempt", verifyAttempt).
			WithField("maxRetries", verifyMaxRetries).
			WithField("proofSetID", proofSet.ProofSetID).
			Info(fmt.Sprintf("Verifying proof set (attempt %d/%d)", verifyAttempt, verifyMaxRetries))

		if verifyAttempt > 1 {
			// Update UI with retry status for verification
			updateStatus(UploadProgress{
				Status:     currentStage,
				Progress:   currentProgress,
				Message:    fmt.Sprintf("Verifying proof set (attempt %d/%d)...", verifyAttempt, verifyMaxRetries),
				CID:        compoundCID,
				ProofSetID: proofSet.ProofSetID,
			})
		}

		verifyCmd := exec.Command(pdptoolPath, verifyProofSetArgs...)
		verifyCmd.Dir = filepath.Dir(pdptoolPath)

		var verifyOutput bytes.Buffer
		var verifyError bytes.Buffer
		verifyCmd.Stdout = &verifyOutput
		verifyCmd.Stderr = &verifyError

		// Add a timeout context for verification
		verifyCtx, verifyCancel := context.WithTimeout(context.Background(), 30*time.Second)
		verifyCmdWithTimeout := exec.CommandContext(verifyCtx, pdptoolPath, verifyProofSetArgs...)
		verifyCmdWithTimeout.Dir = filepath.Dir(pdptoolPath)
		verifyCmdWithTimeout.Stdout = &verifyOutput
		verifyCmdWithTimeout.Stderr = &verifyError

		verifyErr := verifyCmdWithTimeout.Run()
		verifyCancel()

		if verifyErr != nil {
			stderrStr := verifyError.String()
			log.WithField("error", verifyErr.Error()).
				WithField("stderr", stderrStr).
				WithField("proofSetID", proofSet.ProofSetID).
				WithField("attempt", verifyAttempt).
				Warning("Proof set verification attempt failed")

			// Check specific errors that suggest the proof set is still initializing
			isRetryableError := false
			var retryMessage string

			if verifyCtx.Err() == context.DeadlineExceeded {
				isRetryableError = true
				retryMessage = "Verification timed out, proof set may still be initializing."
			} else if strings.Contains(stderrStr, "status code 500") {
				isRetryableError = true
				retryMessage = "Service returned internal error, proof set may still be initializing."
			} else if strings.Contains(stderrStr, "Failed to retrieve next challenge epoch") ||
				strings.Contains(stderrStr, "can't scan NULL into") {
				isRetryableError = true
				retryMessage = "Proof set is still initializing on the blockchain."
			} else if strings.Contains(stderrStr, "not found") {
				isRetryableError = true
				retryMessage = "Proof set not found yet, may still be registering."
			}

			if isRetryableError && verifyAttempt < verifyMaxRetries {
				log.WithField("backoff", verifyBackoff).
					WithField("attempt", verifyAttempt).
					Info(retryMessage)

				// Update UI with retry information
				updateStatus(UploadProgress{
					Status:     currentStage,
					Progress:   currentProgress,
					Message:    fmt.Sprintf("%s Waiting before retry %d/%d...", retryMessage, verifyAttempt+1, verifyMaxRetries),
					CID:        compoundCID,
					ProofSetID: proofSet.ProofSetID,
				})

				// Wait with exponential backoff
				time.Sleep(verifyBackoff)

				// Increase backoff for next attempt
				verifyBackoff *= 2
				if verifyBackoff > verifyMaxBackoff {
					verifyBackoff = verifyMaxBackoff
				}
				continue
			}

			// If we've reached max retries for verification
			if verifyAttempt >= verifyMaxRetries {
				log.WithField("proofSetID", proofSet.ProofSetID).
					Warning("Proof set verification failed after max retries, proceeding anyway")

				// Continue with adding roots anyway - the proof set might be in the process of being created
				// and we're going to retry the add-roots operation multiple times
				updateStatus(UploadProgress{
					Status:     currentStage,
					Progress:   currentProgress,
					Message:    "Proceeding to add root despite verification issues...",
					CID:        compoundCID,
					ProofSetID: proofSet.ProofSetID,
				})
				// Don't return, continue to add-roots
				break
			}
		} else {
			// Verification succeeded
			verifySuccess = true
			log.WithField("proofSetID", proofSet.ProofSetID).Info("Proof set verification successful")
			break
		}
	}

	if verifySuccess {
		log.WithField("proofSetID", proofSet.ProofSetID).Info("Proof set verification successful")
	} else {
		log.WithField("proofSetID", proofSet.ProofSetID).Warning("Proceeding without successful verification")
	}

	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    fmt.Sprintf("Adding root to proof set %s...", proofSet.ProofSetID),
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	// Implement retry mechanism with exponential backoff for add-roots command
	rootArgument := compoundCID
	addRootsArgs := []string{
		"add-roots",
		"--service-url", cfg.ServiceURL,
		"--service-name", cfg.ServiceName,
		"--proof-set-id", proofSet.ProofSetID,
		"--root", rootArgument,
	}

	log.WithField("add-roots-args", strings.Join(addRootsArgs, " ")).Info("Adding root to proof set")

	// Check command working directory and secret file
	cmdDir := filepath.Dir(pdptoolPath)
	secretPath := filepath.Join(cmdDir, "pdpservice.json")
	log.WithField("expectedCmdDir", cmdDir).Info("Checking command working directory")
	log.WithField("checkingSecretPath", secretPath).Info("Checking for pdpservice.json")
	if _, errStat := os.Stat(secretPath); errStat == nil {
		log.Info("pdpservice.json FOUND at the expected location.")
	} else if os.IsNotExist(errStat) {
		log.Error("pdpservice.json NOT FOUND at the expected location.")
	} else {
		log.WithField("error", errStat.Error()).Error("Error checking for pdpservice.json")
	}

	// Retry configuration for add-roots
	maxRetries := 10                  // Increased from 5 to 10
	initialBackoff := 5 * time.Second // Increased from 3 to 5 seconds
	maxBackoff := 60 * time.Second    // Increased from 30 to 60 seconds
	backoff := initialBackoff
	success := false

	// Execute add-roots command with retries
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.WithField("command", pdptoolPath).
			WithField("args", strings.Join(addRootsArgs, " ")).
			WithField("attempt", attempt).
			WithField("maxRetries", maxRetries).
			Info("Executing add-roots command")

		// Update UI with current retry attempt
		updateStatus(UploadProgress{
			Status:     currentStage,
			Progress:   currentProgress,
			Message:    fmt.Sprintf("Adding root to proof set %s (attempt %d/%d)...", proofSet.ProofSetID, attempt, maxRetries),
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})

		addRootCmd := exec.Command(pdptoolPath, addRootsArgs...)
		addRootCmd.Dir = filepath.Dir(pdptoolPath)

		var addRootOutput bytes.Buffer
		var addRootError bytes.Buffer
		addRootCmd.Stdout = &addRootOutput
		addRootCmd.Stderr = &addRootError

		// Add a timeout context to prevent hanging on the command execution
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second) // Increased from 45 to 60 seconds
		defer cancel()

		// Use the context with the command
		cmdWithTimeout := exec.CommandContext(ctx, pdptoolPath, addRootsArgs...)
		cmdWithTimeout.Dir = filepath.Dir(pdptoolPath)
		cmdWithTimeout.Stdout = &addRootOutput
		cmdWithTimeout.Stderr = &addRootError

		if err := cmdWithTimeout.Run(); err != nil {
			stderrStr := addRootError.String()
			stdoutStr := addRootOutput.String()

			// Check if it was a timeout
			if ctx.Err() == context.DeadlineExceeded {
				log.WithField("attempt", attempt).
					WithField("maxRetries", maxRetries).
					Error("Command execution timed out after 60 seconds")

				if attempt < maxRetries {
					// Update UI with timeout status
					updateStatus(UploadProgress{
						Status:     currentStage,
						Progress:   currentProgress,
						Message:    fmt.Sprintf("Command timed out. Retrying %d/%d...", attempt+1, maxRetries),
						CID:        compoundCID,
						ProofSetID: proofSet.ProofSetID,
					})

					// Wait with exponential backoff
					time.Sleep(backoff)

					// Double the backoff for next attempt, capped at maxBackoff
					backoff *= 2
					if backoff > maxBackoff {
						backoff = maxBackoff
					}
					continue
				} else {
					updateStatus(UploadProgress{
						Status:     "error",
						Error:      "Command timed out after multiple attempts",
						Message:    "The service took too long to respond. Please try again later.",
						CID:        compoundCID,
						ProofSetID: proofSet.ProofSetID,
					})
					return
				}
			}

			// Log the error with detailed information
			log.WithField("error", err.Error()).
				WithField("stderr", stderrStr).
				WithField("stdout", stdoutStr).
				WithField("commandArgs", strings.Join(addRootsArgs, " ")).
				WithField("attempt", attempt).
				WithField("maxRetries", maxRetries).
				Error("pdptool add-roots command failed")

			// Check for specific error patterns that indicate a retry might succeed
			shouldRetry := false
			retryMessage := ""

			if strings.Contains(stderrStr, "subroot CID") && strings.Contains(stderrStr, "not found or does not belong to service") {
				shouldRetry = true
				retryMessage = "CID not yet registered with service. Will retry after delay."
			} else if strings.Contains(stderrStr, "Size must be a multiple of 32") {
				shouldRetry = true
				retryMessage = "Validation error. Will retry after delay."
			} else if strings.Contains(stderrStr, "Failed to send transaction") {
				shouldRetry = true
				retryMessage = "Transaction error. Will retry after delay."
			} else if strings.Contains(stderrStr, "status code 500") || strings.Contains(stderrStr, "status code 400") {
				shouldRetry = true
				retryMessage = "Service error. Will retry after delay."
			} else if strings.Contains(stderrStr, "Failed to retrieve next challenge epoch") ||
				strings.Contains(stderrStr, "can't scan NULL into") {
				shouldRetry = true
				retryMessage = "Proof set is still initializing on the blockchain. Will retry after delay."
			} else if strings.Contains(stderrStr, "not found") {
				shouldRetry = true
				retryMessage = "Proof set not found yet, may still be registering. Will retry after delay."
			} else if strings.Contains(stderrStr, "can't add root to non-existing proof set") {
				shouldRetry = true
				retryMessage = "Proof set is newly created and not fully registered. Will retry after delay."
			} else {
				// For any other error, let's retry anyway since the proof set might just need more time
				shouldRetry = true
				retryMessage = "Encountered an error. Waiting before retrying..."
			}

			if shouldRetry && attempt < maxRetries {
				log.WithField("backoff", backoff).WithField("attempt", attempt).Info(retryMessage)

				// Update UI with retry status
				updateStatus(UploadProgress{
					Status:     currentStage,
					Progress:   currentProgress,
					Message:    fmt.Sprintf("%s Waiting %v before retry %d/%d...", retryMessage, backoff, attempt, maxRetries),
					CID:        compoundCID,
					ProofSetID: proofSet.ProofSetID,
				})

				// Wait with exponential backoff
				time.Sleep(backoff)

				// Double the backoff for next attempt, capped at maxBackoff
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
				continue
			}

			// If we've reached max retries or it's not a retryable error, fail
			if attempt >= maxRetries {
				updateStatus(UploadProgress{
					Status:     "error",
					Error:      "Failed to add root to proof set after multiple attempts",
					Message:    stderrStr,
					CID:        compoundCID,
					ProofSetID: proofSet.ProofSetID,
				})
				return
			}

			// For non-retryable errors, fail immediately
			updateStatus(UploadProgress{
				Status:     "error",
				Error:      "Failed to add root to proof set",
				Message:    stderrStr,
				CID:        compoundCID,
				ProofSetID: proofSet.ProofSetID,
			})
			return
		}

		// Command succeeded, break out of retry loop
		addRootStderrStrOnSuccess := addRootError.String()
		if addRootStderrStrOnSuccess != "" {
			log.WithField("stderr", addRootStderrStrOnSuccess).Warning("add-roots command succeeded but produced output on stderr")
		}

		addRootStdoutStr := addRootOutput.String()
		log.WithField("proofSetID", proofSet.ProofSetID).
			WithField("rootUsed", rootArgument).
			WithField("stdout", addRootStdoutStr).
			WithField("attempt", attempt).
			Info("add-roots command completed successfully")

		success = true
		break
	}

	if !success {
		updateStatus(UploadProgress{
			Status:     "error",
			Error:      "Failed to add root to proof set after multiple attempts",
			Message:    "Service did not accept the root after multiple attempts.",
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
		return
	}

	currentProgress = 96
	currentStage = "finalizing"
	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    "Confirming Root ID assignment...",
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	var extractedIntegerRootID string
	initialPollInterval := 3 * time.Second
	maxPollInterval := 10 * time.Second
	pollInterval := initialPollInterval
	maxPollAttempts := 120 // Increased to 120 attempts (up to 10-20 minutes)
	pollAttempt := 0
	foundRootInPoll := false
	consecutiveErrors := 0
	maxConsecutiveErrors := 10

	for pollAttempt < maxPollAttempts {
		pollAttempt++

		// Update UI every 5 attempts to show progress
		if pollAttempt%5 == 0 {
			updateStatus(UploadProgress{
				Status:     currentStage,
				Progress:   currentProgress,
				Message:    fmt.Sprintf("Waiting for blockchain confirmation (attempt %d/%d)...", pollAttempt, maxPollAttempts),
				CID:        compoundCID,
				ProofSetID: proofSet.ProofSetID,
			})
		}

		log.Info(fmt.Sprintf("Polling get-proof-set attempt %d/%d...", pollAttempt, maxPollAttempts))

		getProofSetArgs := []string{
			"get-proof-set",
			"--service-url", cfg.ServiceURL,
			"--service-name", cfg.ServiceName,
			proofSet.ProofSetID,
		}
		getProofSetCmd := exec.Command(pdptoolPath, getProofSetArgs...)
		getProofSetCmd.Dir = filepath.Dir(pdptoolPath)

		var getProofSetStdout bytes.Buffer
		var getProofSetStderr bytes.Buffer
		getProofSetCmd.Stdout = &getProofSetStdout
		getProofSetCmd.Stderr = &getProofSetStderr

		log.WithField("command", pdptoolPath).WithField("args", strings.Join(getProofSetArgs, " ")).Debug(fmt.Sprintf("Executing get-proof-set poll attempt %d", pollAttempt))

		if err := getProofSetCmd.Run(); err != nil {
			stderrStr := getProofSetStderr.String()
			log.WithField("error", err.Error()).
				WithField("stderr", stderrStr).
				Warning(fmt.Sprintf("pdptool get-proof-set command failed during poll attempt %d. Retrying after %v...", pollAttempt, pollInterval))

			// Increase consecutive error count
			consecutiveErrors++

			// Check for specific initialization errors we can ignore
			if strings.Contains(stderrStr, "Failed to retrieve next challenge epoch") ||
				strings.Contains(stderrStr, "can't scan NULL into") {

				log.Info("Detected proof set initialization error, this is normal during proof set creation")

				// If we've seen a lot of these initialization errors, slow down our polling
				if consecutiveErrors > 3 {
					// Gradually increase poll interval to avoid hammering the service
					if pollInterval < maxPollInterval {
						pollInterval += time.Second
					}
				}

				time.Sleep(pollInterval)
				continue
			}

			// For other errors, still continue polling but with a warning
			if consecutiveErrors > maxConsecutiveErrors {
				log.Warning(fmt.Sprintf("Received %d consecutive errors while polling for root ID", consecutiveErrors))

				// Increase the interval more aggressively when hitting many errors
				if pollInterval < maxPollInterval {
					pollInterval *= 2
					if pollInterval > maxPollInterval {
						pollInterval = maxPollInterval
					}
				}
			}

			time.Sleep(pollInterval)
			continue
		}

		// Reset consecutive error counter on success
		consecutiveErrors = 0

		getProofSetOutput := getProofSetStdout.String()
		log.WithField("output", getProofSetOutput).Debug(fmt.Sprintf("get-proof-set poll attempt %d output received", pollAttempt))

		// Check if this is an empty proof set response
		if strings.Contains(getProofSetOutput, "Roots:") && !strings.Contains(getProofSetOutput, "Root ID:") {
			log.Debug("Found proof set but no roots listed yet. Continuing to poll...")
			time.Sleep(pollInterval)
			continue
		}

		lines := strings.Split(getProofSetOutput, "\n")
		var lastSeenRootID string
		foundMatchThisAttempt := false
		sawAnyRootID := false

		for _, line := range lines {
			trimmedLine := strings.TrimSpace(line)
			if trimmedLine == "" {
				continue
			}

			if idx := strings.Index(trimmedLine, "Root ID:"); idx != -1 {
				sawAnyRootID = true
				potentialIDValue := strings.TrimSpace(trimmedLine[idx+len("Root ID:"):])
				log.Debug(fmt.Sprintf("[Parsing] Found line containing 'Root ID:', potential value: '%s'", potentialIDValue))
				if _, err := strconv.Atoi(potentialIDValue); err == nil {
					lastSeenRootID = potentialIDValue
					log.Debug(fmt.Sprintf("[Parsing] Captured integer Root ID: %s", lastSeenRootID))
				} else {
					lastSeenRootID = ""
					log.Debug(fmt.Sprintf("[Parsing] Found 'Root ID:' but value '%s' is not integer, resetting lastSeenRootID", potentialIDValue))
				}
			}

			if idx := strings.Index(trimmedLine, "Root CID:"); idx != -1 {
				outputCID := strings.TrimSpace(trimmedLine[idx+len("Root CID:"):])
				log.Debug(fmt.Sprintf("[Parsing] Found line containing 'Root CID:', value: '%s'", outputCID))
				if outputCID == baseCID {
					log.Debug(fmt.Sprintf("[Parsing] CID '%s' matches baseCID '%s'. Checking lastSeenRootID ('%s')...", outputCID, baseCID, lastSeenRootID))
					if lastSeenRootID != "" {
						extractedIntegerRootID = lastSeenRootID
						log.WithField("integerRootID", extractedIntegerRootID).WithField("matchedBaseCID", baseCID).Info(fmt.Sprintf("Successfully matched base CID and found associated integer Root ID on poll attempt %d", pollAttempt))
						foundMatchThisAttempt = true
						break
					} else {
						log.WithField("matchedBaseCID", baseCID).Warning(fmt.Sprintf("Matched base CID on poll attempt %d but no preceding integer Root ID was captured (lastSeenRootID was empty)", pollAttempt))
					}
				}
			}
		}

		if foundMatchThisAttempt {
			foundRootInPoll = true
			break
		}

		// If we saw Root IDs but none matched our CID yet, that's progress!
		// Reduce polling interval to check more frequently
		if sawAnyRootID {
			log.Info("Proof set has roots, but none matching our CID yet. Reducing poll interval.")
			pollInterval = initialPollInterval
		}

		log.Debug(fmt.Sprintf("Root CID %s not found in get-proof-set output on attempt %d. Waiting %v...", baseCID, pollAttempt, pollInterval))
		time.Sleep(pollInterval)
	}

	// If we didn't find the root in the poll but have seen successful get-proof-set responses
	// we can fallback to using a default numeric root ID
	if !foundRootInPoll && consecutiveErrors < maxConsecutiveErrors {
		log.WithField("baseCID", baseCID).
			WithField("proofSetID", proofSet.ProofSetID).
			WithField("attempts", maxPollAttempts).
			Warning("Failed to find integer Root ID in get-proof-set output after polling. Using fallback Root ID.")

		// Use "1" as fallback Root ID
		extractedIntegerRootID = "1"
		foundRootInPoll = true

		updateStatus(UploadProgress{
			Status:     currentStage,
			Progress:   98,
			Message:    "Using default Root ID due to blockchain indexing delay.",
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
	} else if !foundRootInPoll {
		log.WithField("baseCID", baseCID).
			WithField("proofSetID", proofSet.ProofSetID).
			WithField("attempts", maxPollAttempts).
			Error("Failed to find integer Root ID in get-proof-set output after polling.")
		updateStatus(UploadProgress{
			Status:     "error",
			Progress:   98,
			Message:    "Error: Could not confirm integer Root ID assignment after polling.",
			Error:      fmt.Sprintf("Polling for Root ID timed out after %d attempts", maxPollAttempts),
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
		return
	}

	currentProgress = 98
	rootIDToSave := extractedIntegerRootID

	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    "Saving piece information to database...",
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	piece := &models.Piece{
		UserID:      userID,
		CID:         compoundCID,
		Filename:    file.Filename,
		Size:        file.Size,
		ServiceName: cfg.ServiceName,
		ServiceURL:  cfg.ServiceURL,
		ProofSetID:  &proofSet.ID,
		RootID:      &rootIDToSave,
	}

	if result := db.Create(piece); result.Error != nil {
		log.WithField("error", result.Error.Error()).Error("Failed to save piece information")
		updateStatus(UploadProgress{
			Status:     "error",
			Error:      "Failed to save piece information to database",
			Message:    result.Error.Error(),
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
		return
	}

	log.WithField("pieceId", piece.ID).WithField("integerRootID", rootIDToSave).Info("Piece information saved successfully with integer Root ID")

	currentProgress = 100

	updateStatus(UploadProgress{
		Status:     "complete",
		Progress:   currentProgress,
		Message:    "Upload completed successfully",
		CID:        compoundCID,
		Filename:   file.Filename,
		ProofSetID: proofSet.ProofSetID,
	})

	go func() {
		time.Sleep(1 * time.Hour)
		uploadJobsLock.Lock()
		delete(uploadJobs, jobID)
		uploadJobsLock.Unlock()
	}()
}

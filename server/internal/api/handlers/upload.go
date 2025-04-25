package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
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

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hotvault/backend/config"
	"github.com/hotvault/backend/internal/models"
	"github.com/hotvault/backend/pkg/logger"
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

func formatFileSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

func getPdptoolParentDir(pdptoolPath string) string {
	// Get the directory containing the pdptool executable
	return filepath.Dir(pdptoolPath)
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

	// Change working directory to pdptool directory
	if cfg.PdptoolPath != "" {
		pdptoolDir := getPdptoolParentDir(cfg.PdptoolPath)
		if err := os.Chdir(pdptoolDir); err != nil {
			log.Error(fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err))
			return
		}
		log.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")
	}

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
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}
	const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 * 1024
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MAX_UPLOAD_SIZE)

	file, err := c.FormFile("file")
	if err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error":   "File too large",
				"message": fmt.Sprintf("Maximum file size is %s", formatFileSize(MAX_UPLOAD_SIZE)),
			})
			return
		}

		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Failed to get file from form",
			"message": err.Error(),
		})
		return
	}

	jobID := uuid.New().String()

	uploadJobsLock.Lock()
	uploadJobs[jobID] = UploadProgress{
		Status:    "uploading",
		Progress:  0,
		Message:   "Starting upload",
		Filename:  file.Filename,
		TotalSize: file.Size,
		JobID:     jobID,
	}
	uploadJobsLock.Unlock()

	pdptoolPath := cfg.PdptoolPath
	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("pdptoolPath", pdptoolPath).Error("PDPTool executable not found")
		uploadJobsLock.Lock()
		uploadJobs[jobID] = UploadProgress{
			Status:  "error",
			Error:   "PDPTool executable not found",
			Message: fmt.Sprintf("File not found at %s", pdptoolPath),
		}
		uploadJobsLock.Unlock()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "PDPTool executable not found",
			"message": fmt.Sprintf("File not found at %s", pdptoolPath),
		})
		return
	}

	go processUpload(jobID, file, userID.(uint), pdptoolPath)

	c.JSON(http.StatusOK, gin.H{
		"message": "Upload started",
		"jobId":   jobID,
		"status":  "processing",
	})
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

	// Change working directory to pdptool directory
	pdptoolDir := getPdptoolParentDir(pdptoolPath)
	if err := os.Chdir(pdptoolDir); err != nil {
		log.Error(fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err))
		uploadJobsLock.Lock()
		progress := uploadJobs[jobID]
		progress.Status = "error"
		progress.Error = "Failed to set working directory"
		uploadJobs[jobID] = progress
		uploadJobsLock.Unlock()
		return
	}
	log.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")

	updateStatus := func(progress UploadProgress) {
		progress.JobID = jobID
		uploadJobsLock.Lock()
		uploadJobs[jobID] = progress
		uploadJobsLock.Unlock()
	}

	currentStage := "starting"
	currentProgress := 0

	prepareWeight := 20

	fileSizeMB := float64(file.Size) / (1024 * 1024)

	baseDelay := time.Duration(2+int(fileSizeMB/5)) * time.Second
	if baseDelay < 2*time.Second {
		baseDelay = 2 * time.Second
	}
	if baseDelay > 30*time.Second {
		baseDelay = 10 * time.Second
	}

	prepareTimeout := time.Duration(30+int(fileSizeMB*2)) * time.Second
	if prepareTimeout > 3600*time.Second {
		prepareTimeout = 3600 * time.Second
	}

	uploadTimeout := time.Duration(30+int(fileSizeMB*3)) * time.Second
	if uploadTimeout > 7200*time.Second {
		uploadTimeout = 7200 * time.Second
	}

	log.WithField("fileSize", file.Size).
		WithField("fileSizeMB", fileSizeMB).
		WithField("baseDelay", baseDelay).
		WithField("prepareTimeout", prepareTimeout).
		WithField("uploadTimeout", uploadTimeout).
		Info("Calculated timeouts for file processing")

	if _, err := os.Stat("pdpservice.json"); os.IsNotExist(err) {
		currentStage = "preparing"
		updateStatus(UploadProgress{
			Status:   "preparing",
			Progress: currentProgress,
			Message:  "Creating service secret",
		})

		createSecretCmd := exec.Command(pdptoolPath, "create-service-secret")
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

	uploadPathsLock.RLock()
	existingFilePath, hasExistingPath := filePaths[jobID]
	uploadPathsLock.RUnlock()

	var tempFilePath string
	if hasExistingPath {
		tempFilePath = existingFilePath
		log.WithField("path", tempFilePath).Info("Using existing file path from chunked upload")
	} else {
		tempDir, err := os.MkdirTemp("", fmt.Sprintf("upload-%s-", jobID))
		if err != nil {
			log.WithField("error", err.Error()).Error("Failed to create temporary directory")
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to create temporary directory",
				Message: err.Error(),
			})
			return
		}

		originalFilename := filepath.Base(file.Filename)
		tempFilePath = filepath.Join(tempDir, originalFilename)

		src, err := file.Open()
		if err != nil {
			log.WithField("error", err.Error()).
				WithField("filename", file.Filename).
				Error("Failed to open uploaded file")
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
			log.WithField("error", err.Error()).
				WithField("path", tempFilePath).
				Error("Failed to create temporary file")
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to create temporary file",
				Message: err.Error(),
			})
			return
		}

		written, err := io.Copy(dst, src)
		dst.Close()

		if err != nil {
			log.WithField("error", err.Error()).
				WithField("path", tempFilePath).
				Error("Failed to save uploaded file")
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to save uploaded file",
				Message: err.Error(),
			})
			os.RemoveAll(tempDir)
			return
		}

		if written != file.Size {
			err := fmt.Errorf("file size mismatch: expected %d bytes, wrote %d bytes", file.Size, written)
			log.WithField("error", err.Error()).
				WithField("path", tempFilePath).
				Error("Failed to save complete file")
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to save complete file",
				Message: err.Error(),
			})
			os.RemoveAll(tempDir)
			return
		}

		log.WithField("path", tempFilePath).
			WithField("size", formatFileSize(written)).
			Info("File saved to temporary location")
	}

	if _, err := os.Stat(tempFilePath); os.IsNotExist(err) {
		log.WithField("error", err.Error()).
			WithField("path", tempFilePath).
			Error("Temporary file does not exist after save")
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to verify temporary file",
			Message: fmt.Sprintf("File does not exist: %s", err.Error()),
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

	prepareCtx, prepareCancel := context.WithTimeout(context.Background(), prepareTimeout)
	defer prepareCancel()

	prepareCmdWithTimeout := exec.CommandContext(prepareCtx, pdptoolPath, "prepare-piece", tempFilePath)
	prepareCmdWithTimeout.Stdout = &prepareOutput
	prepareCmdWithTimeout.Stderr = &prepareError

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

	if err := prepareCmdWithTimeout.Run(); err != nil {
		close(prepareDone)

		if prepareCtx.Err() == context.DeadlineExceeded {
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Prepare piece command timed out",
				Message: fmt.Sprintf("Operation timed out after %v. Try a smaller file or contact support.", prepareTimeout),
			})
		} else {
			updateStatus(UploadProgress{
				Status:  "error",
				Error:   "Failed to prepare piece",
				Message: prepareError.String(),
			})
		}
		return
	}

	close(prepareDone)
	currentProgress = prepareWeight + 10
	currentStage = "uploading"

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  fmt.Sprintf("Uploading file... (%.1f MB)", fileSizeMB),
	})

	time.Sleep(10 * time.Second)

	var uploadOutput bytes.Buffer
	var uploadError bytes.Buffer

	uploadArgs := []string{
		"upload-file",
		"--service-url", cfg.ServiceURL,
		"--service-name", cfg.ServiceName,
		tempFilePath,
	}

	uploadCmd := exec.Command(pdptoolPath, uploadArgs...)
	uploadCmd.Stdout = &uploadOutput
	uploadCmd.Stderr = &uploadError

	log.WithField("command", pdptoolPath).
		WithField("args", strings.Join(uploadArgs, " ")).
		WithField("fileSize", formatFileSize(file.Size)).
		WithField("timeout", "none").
		Info("Executing pdptool upload-file command")

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  fmt.Sprintf("Uploading file... (%.1f MB)", fileSizeMB),
	})

	uploadRunErr := uploadCmd.Run()
	if uploadRunErr != nil {
		stderrStr := uploadError.String()
		stdoutStr := uploadOutput.String()

		log.WithField("error", uploadRunErr.Error()).
			WithField("stderr", stderrStr).
			WithField("stdout", stdoutStr).
			Error("Upload command failed")

		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Upload command failed",
			Message: stderrStr,
		})
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

	// Reduced delay before adding root
	preAddRootDelay := 1 * time.Second
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

	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    fmt.Sprintf("Adding root to proof set %s...", proofSet.ProofSetID),
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	rootArgument := compoundCID
	addRootsArgs := []string{
		"add-roots",
		"--service-url", cfg.ServiceURL,
		"--service-name", cfg.ServiceName,
		"--proof-set-id", proofSet.ProofSetID,
		"--root", rootArgument,
	}

	log.WithField("add-roots-args", strings.Join(addRootsArgs, " ")).Info("Adding root to proof set")

	cmdDir := pdptoolDir
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

	maxRetries := 100
	backoff := 10 * time.Second
	maxBackoff := 10 * time.Second
	success := false

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			time.Sleep(backoff)
		}

		log.WithField("command", pdptoolPath).
			WithField("args", strings.Join(addRootsArgs, " ")).
			WithField("attempt", attempt).
			WithField("maxRetries", maxRetries).
			Info("Executing add-roots command")

		updateStatus(UploadProgress{
			Status:     currentStage,
			Progress:   currentProgress,
			Message:    "Adding root to proof...",
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})

		addRootCmd := exec.Command(pdptoolPath, addRootsArgs...)
		var addRootOutput bytes.Buffer
		var addRootError bytes.Buffer
		addRootCmd.Stdout = &addRootOutput
		addRootCmd.Stderr = &addRootError

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		cmdWithTimeout := exec.CommandContext(ctx, pdptoolPath, addRootsArgs...)
		cmdWithTimeout.Dir = pdptoolDir
		cmdWithTimeout.Stdout = &addRootOutput
		cmdWithTimeout.Stderr = &addRootError

		if err := cmdWithTimeout.Run(); err != nil {
			stderrStr := addRootError.String()
			stdoutStr := addRootOutput.String()

			if ctx.Err() == context.DeadlineExceeded {
				log.WithField("attempt", attempt).
					WithField("maxRetries", maxRetries).
					Error("Command execution timed out after 60 seconds")

				if attempt < maxRetries {
					updateStatus(UploadProgress{
						Status:     currentStage,
						Progress:   currentProgress,
						Message:    fmt.Sprintf("Command timed out. Retrying %d/%d...", attempt+1, maxRetries),
						CID:        compoundCID,
						ProofSetID: proofSet.ProofSetID,
					})

					time.Sleep(backoff)

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

			log.WithField("error", err.Error()).
				WithField("stderr", stderrStr).
				WithField("stdout", stdoutStr).
				WithField("commandArgs", strings.Join(addRootsArgs, " ")).
				WithField("attempt", attempt).
				WithField("maxRetries", maxRetries).
				Error("pdptool add-roots command failed")

			shouldRetry := false

			if strings.Contains(stderrStr, "subroot CID") && strings.Contains(stderrStr, "not found or does not belong to service") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "Size must be a multiple of 32") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "Failed to send transaction") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "status code 500") || strings.Contains(stderrStr, "status code 400") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "Failed to retrieve next challenge epoch") ||
				strings.Contains(stderrStr, "can't scan NULL into") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "not found") {
				shouldRetry = true
			} else if strings.Contains(stderrStr, "can't add root to non-existing proof set") {
				shouldRetry = true
			} else {
				shouldRetry = true
			}

			if shouldRetry && attempt < maxRetries {
				retryDelay := backoff + time.Duration(rand.Int63n(int64(backoff/2)))
				log.WithField("retryDelay", retryDelay.String()).Info("Waiting before retry")
				time.Sleep(retryDelay)
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
				continue
			}

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

			updateStatus(UploadProgress{
				Status:     "error",
				Error:      "Failed to add root to proof set",
				Message:    stderrStr,
				CID:        compoundCID,
				ProofSetID: proofSet.ProofSetID,
			})
			return
		}

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
	pollInterval := 10 * time.Second
	maxPollInterval := 10 * time.Second
	maxPollAttempts := 100
	pollAttempt := 0
	foundRootInPoll := false
	consecutiveErrors := 0
	maxConsecutiveErrors := 10

	for pollAttempt < maxPollAttempts {
		if pollAttempt > 0 {
			log.Info("Applying fixed 30-second delay before poll attempt")
			time.Sleep(10 * time.Second)
		}

		pollAttempt++

		if pollAttempt%5 == 0 {
			updateStatus(UploadProgress{
				Status:     currentStage,
				Progress:   currentProgress,
				Message:    "Waiting for blockchain confirmation...",
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

			consecutiveErrors++

			if strings.Contains(stderrStr, "Failed to retrieve next challenge epoch") ||
				strings.Contains(stderrStr, "can't scan NULL into") {

				log.Info("Detected proof set initialization error, this is normal during proof set creation")

				if consecutiveErrors > 5 {
					if pollInterval < maxPollInterval {
						pollInterval += time.Second
					}
				}

				time.Sleep(pollInterval)
				continue
			}

			if consecutiveErrors > maxConsecutiveErrors {
				log.Warning(fmt.Sprintf("Received %d consecutive errors while polling for root ID", consecutiveErrors))

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

		consecutiveErrors = 0

		getProofSetOutput := getProofSetStdout.String()
		log.WithField("output", getProofSetOutput).Debug(fmt.Sprintf("get-proof-set poll attempt %d output received", pollAttempt))

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

		if sawAnyRootID {
			log.Info("Proof set has roots, but none matching our CID yet. Polling again.")
			pollInterval = 10 * time.Second
		}

		log.Debug(fmt.Sprintf("Root CID %s not found in get-proof-set output on attempt %d. Waiting %v...", baseCID, pollAttempt, pollInterval))
		time.Sleep(pollInterval)
	}

	if !foundRootInPoll && consecutiveErrors < maxConsecutiveErrors {
		log.WithField("baseCID", baseCID).
			WithField("proofSetID", proofSet.ProofSetID).
			WithField("attempts", maxPollAttempts).
			Warning("Failed to find integer Root ID in get-proof-set output after polling. Using fallback Root ID.")

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
		var tempDir string

		if !hasExistingPath && tempFilePath != "" {
			tempDir = filepath.Dir(tempFilePath)
		}

		time.Sleep(1 * time.Hour)

		uploadJobsLock.Lock()
		delete(uploadJobs, jobID)
		uploadJobsLock.Unlock()

		if tempDir != "" && !hasExistingPath {
			log.WithField("jobID", jobID).
				WithField("tempDir", tempDir).
				Info("Cleaning up temporary directory after successful upload")
			os.RemoveAll(tempDir)
		}
	}()
}

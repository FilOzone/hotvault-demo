package handlers

import (
	"bytes"
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

	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service", serviceName).
		Info("Started pdptool upload command")

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
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Upload command failed",
			Message: uploadError.String(),
		})
		log.WithField("error", err.Error()).Error("Upload command failed")
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
		Message:  "Locating user proof set...",
		CID:      compoundCID,
	})

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
	addRootCmd := exec.Command(pdptoolPath, addRootsArgs...)

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

	log.WithField("command", pdptoolPath).WithField("args", strings.Join(addRootsArgs, " ")).Info("Executing add-roots command")

	var addRootOutput bytes.Buffer
	var addRootError bytes.Buffer
	addRootCmd.Stdout = &addRootOutput
	addRootCmd.Stderr = &addRootError
	addRootCmd.Dir = filepath.Dir(pdptoolPath)

	if err := addRootCmd.Run(); err != nil {
		stderrStr := addRootError.String()
		stdoutStr := addRootOutput.String()
		log.WithField("error", err.Error()).
			WithField("stderr", stderrStr).
			WithField("stdout", stdoutStr).
			WithField("commandArgs", strings.Join(addRootsArgs, " ")).
			Error("pdptool add-roots command failed")

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
		Info("add-roots command completed successfully")

	currentProgress = 96
	currentStage = "finalizing"
	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    "Confirming Root ID assignment via polling...",
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	var extractedIntegerRootID string
	pollInterval := 3 * time.Second
	maxPollAttempts := 100
	pollAttempt := 0
	foundRootInPoll := false

	for pollAttempt < maxPollAttempts {
		pollAttempt++
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
			time.Sleep(pollInterval)
			continue
		}

		getProofSetOutput := getProofSetStdout.String()
		log.WithField("output", getProofSetOutput).Debug(fmt.Sprintf("get-proof-set poll attempt %d output received", pollAttempt))

		lines := strings.Split(getProofSetOutput, "\n")
		var lastSeenRootID string
		foundMatchThisAttempt := false

		for _, line := range lines {
			trimmedLine := strings.TrimSpace(line)
			if trimmedLine == "" {
				continue
			}

			if idx := strings.Index(trimmedLine, "Root ID:"); idx != -1 {
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

		log.Debug(fmt.Sprintf("Root CID %s not found in get-proof-set output on attempt %d. Waiting %v...", baseCID, pollAttempt, pollInterval))
		time.Sleep(pollInterval)
	}

	if !foundRootInPoll {
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

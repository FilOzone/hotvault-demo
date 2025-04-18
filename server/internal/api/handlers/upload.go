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
	"strings"
	"sync"
	"time"

	"github.com/fws/backend/internal/models"
	"github.com/fws/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	log logger.Logger
	db  *gorm.DB
)

// In-memory storage for upload job status
var (
	uploadJobs     = make(map[string]UploadProgress)
	uploadJobsLock sync.RWMutex
)

func init() {
	log = logger.NewLogger()
}

func Initialize(database *gorm.DB) {
	if database == nil {
		log.Error("Database connection is nil")
		return
	}
	db = database
	log.Info("Upload handler initialized with database connection")
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

	pdptoolPath := "/Users/art3mis/Developer/opensource/protocol/curio/pdptool"

	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("path", pdptoolPath).Error("pdptool not found")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pdptool not found",
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

	// Generate a unique job ID
	jobID := uuid.New().String()

	// Initialize job status
	initialStatus := UploadProgress{
		Status:    "starting",
		Progress:  0,
		Message:   "Upload job created",
		Filename:  file.Filename,
		TotalSize: file.Size,
		JobID:     jobID,
	}

	// Store the job status
	uploadJobsLock.Lock()
	uploadJobs[jobID] = initialStatus
	uploadJobsLock.Unlock()

	// Start the upload process in a goroutine
	go processUpload(jobID, file, userID.(uint), pdptoolPath)

	// Return the job ID immediately
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

// Process the file upload in a background goroutine
func processUpload(jobID string, file *multipart.FileHeader, userID uint, pdptoolPath string) {
	serviceName := "pdp-artemis"
	serviceURL := "https://yablu.net"

	// Update job status helper function
	updateStatus := func(progress UploadProgress) {
		progress.JobID = jobID
		uploadJobsLock.Lock()
		uploadJobs[jobID] = progress
		uploadJobsLock.Unlock()
	}

	// Keep track of the current stage and progress
	currentStage := "starting"
	currentProgress := 0
	maxProgress := 100

	// Estimated progress weights for different stages
	prepareWeight := 20 // Preparation takes about 20% of the total time
	uploadWeight := 80  // Uploading takes about 80% of the total time

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

	// Update progress for file save operation
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

	// Simulate preparation progress updates
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
	// Ensure we've updated to the right progress after prepare is done
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
		"--service-url", serviceURL,
		"--service-name", serviceName,
		tempFilePath,
	)

	// craete new proof set for a new user
	// must have min  fo 10usdfccurrentProgressthen allowance of 10
	// then deposit 10usdfc in payments contract
	// create a new proof set for user
	// add the root to the proof set
	// remove the root from the proof set after add-root

	// TODO: call add-root after upload-file
	// TODO: create a new proof set
	// TODO: remove the root from the proof set after add-root

	//

	// abi encode the struct and the convert it to hex

	// Capture stdout and stderr from the command
	var uploadOutput bytes.Buffer
	var uploadError bytes.Buffer
	uploadCmd.Stdout = &uploadOutput
	uploadCmd.Stderr = &uploadError

	// Log the start of the upload command
	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service", serviceName).
		Info("Started pdptool upload command")

	// Start the upload command
	if err := uploadCmd.Start(); err != nil {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to start upload command",
			Message: err.Error(),
		})
		return
	}

	// Periodically update progress while the command runs
	done := make(chan bool)
	go func() {
		uploadStartProgress := currentProgress
		uploadStartTime := time.Now()
		estimatedUploadTime := time.Duration(file.Size/1024/10) * time.Millisecond // rough estimate
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
				// Calculate progress based on elapsed time
				elapsedRatio := float64(time.Since(uploadStartTime)) / float64(estimatedUploadTime)
				if elapsedRatio > 1.0 {
					elapsedRatio = 0.95 // Cap at 95% if taking longer than expected
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

	// Wait for the command to complete
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

	// Process the output to find the CID
	outputStr := uploadOutput.String()
	outputLines := strings.Split(outputStr, "\n")

	// Search for a CID in the output
	cidRegex := regexp.MustCompile(`^(baga[a-zA-Z0-9]+)(?::(baga[a-zA-Z0-9]+))?$`)
	var cid string

	// Check all output lines for a CID, starting from the last line
	for i := len(outputLines) - 1; i >= 0; i-- {
		trimmedLine := strings.TrimSpace(outputLines[i])
		if cidRegex.MatchString(trimmedLine) {
			matches := cidRegex.FindStringSubmatch(trimmedLine)
			cid = matches[0] // Use the full match by default
			log.WithField("cid", cid).Info("Found CID in output lines")
			break
		}
	}

	// If no CID found, use fallback strategy
	if cid == "" {
		// Get the last non-empty line as a fallback
		var lastNonEmpty string
		for i := len(outputLines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(outputLines[i])
			if line != "" {
				lastNonEmpty = line
				break
			}
		}

		if lastNonEmpty != "" {
			log.WithField("lastLine", lastNonEmpty).Info("Using last non-empty output line as CID (fallback)")
			cid = lastNonEmpty
		}
	}

	// If still no CID, report an error
	if cid == "" {
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to extract CID from upload response",
			Message: "Could not determine if upload was successful",
		})
		return
	}

	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service_name", serviceName).
		WithField("service_url", serviceURL).
		Info(fmt.Sprintf("File uploaded successfully with CID: %s", cid))

	// After successful upload, we need to add the root to the proof set
	currentProgress = 95
	currentStage = "adding_root"

	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Locating user proof set",
		CID:      cid,
	})

	// Get the user's existing proof set from the database
	var proofSet models.ProofSet
	if err := db.Where("user_id = ?", userID).First(&proofSet).Error; err != nil {
		errMsg := "Failed to query proof set for user."
		if err == gorm.ErrRecordNotFound {
			errMsg = "Proof set initialization is pending. Please wait or re-authenticate if this persists."
			log.WithField("userID", userID).Warning(errMsg) // Log as warning, it might just be pending
		} else {
			log.WithField("userID", userID).WithField("error", err).Error("Database error fetching proof set")
		}
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   errMsg,
			Message: "Upload cannot proceed without a ready proof set.",
			CID:     cid,
		})
		return
	}

	// Ensure the ProofSetID from the service is populated (meaning creation is complete)
	if proofSet.ProofSetID == "" {
		errMsg := "Proof set creation pending. Please wait."
		log.WithField("userID", userID).WithField("dbProofSetID", proofSet.ID).Info(errMsg) // Info level, as this is expected during creation
		updateStatus(UploadProgress{
			Status:  "error", // Use 'error' status to stop the job progress UI
			Error:   errMsg,
			Message: "The proof set is being initialized. Upload will be available shortly.",
			CID:     cid,
		})
		return
	}

	log.WithField("userID", userID).WithField("proofSetID", proofSet.ProofSetID).Info("Found ready proof set for user")

	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    fmt.Sprintf("Adding root to proof set %s", proofSet.ProofSetID),
		CID:        cid,
		ProofSetID: proofSet.ProofSetID,
	})

	// Now add the root to the proof set
	addRootsArgs := []string{
		"add-roots",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--proof-set-id", proofSet.ProofSetID,
		"--root", cid,
	}
	addRootCmd := exec.Command(pdptoolPath, addRootsArgs...)

	log.WithField("command", pdptoolPath).
		WithField("args", strings.Join(addRootsArgs, " ")).
		Info("Executing add-roots command")

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
			Status:  "error",
			Error:   "Failed to add root to proof set",
			Message: stderrStr, // Use stderr for more specific error from the tool
			CID:     cid,
		})
		return
	}

	log.WithField("proofSetID", proofSet.ProofSetID).
		WithField("cid", cid).
		WithField("stdout", addRootOutput.String()).
		Info("Root added to proof set successfully")

	currentProgress = 98

	updateStatus(UploadProgress{
		Status:     "finalizing",
		Progress:   98,
		Message:    "Root added to proof set successfully",
		CID:        cid,
		ProofSetID: proofSet.ProofSetID,
	})

	piece := &models.Piece{
		UserID:      userID,
		CID:         cid,
		Filename:    file.Filename,
		Size:        file.Size,
		ServiceName: serviceName,
		ServiceURL:  serviceURL,
		ProofSetID:  &proofSet.ID, // Link piece to the DB ID of the proof set
	}

	if result := db.Create(piece); result.Error != nil {
		log.WithField("error", result.Error.Error()).Error("Failed to save piece information")
		updateStatus(UploadProgress{
			Status:  "error",
			Error:   "Failed to save piece information",
			Message: result.Error.Error(),
		})
		return
	}

	log.WithField("pieceId", piece.ID).Info("Piece information saved successfully")

	currentProgress = 100

	// Final completion update
	updateStatus(UploadProgress{
		Status:     "complete",
		Progress:   currentProgress,
		Message:    "Upload completed successfully",
		CID:        cid,
		Filename:   file.Filename,
		ProofSetID: proofSet.ProofSetID,
	})

	// Keep the job status for 1 hour then clean it up
	go func() {
		time.Sleep(1 * time.Hour)
		uploadJobsLock.Lock()
		delete(uploadJobs, jobID)
		uploadJobsLock.Unlock()
	}()
}

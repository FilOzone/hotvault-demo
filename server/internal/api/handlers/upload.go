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
	// Expecting format: baga...CID1:baga...CID2
	cidRegex := regexp.MustCompile(`^(baga[a-zA-Z0-9]+)(?::(baga[a-zA-Z0-9]+))?$`) // Regex to capture base and optionally subroot CID
	var compoundCID string
	var baseCID string
	var subrootCID string // Might be the same as baseCID

	// Check all output lines for a CID, starting from the last line
	for i := len(outputLines) - 1; i >= 0; i-- {
		trimmedLine := strings.TrimSpace(outputLines[i])
		if cidRegex.MatchString(trimmedLine) {
			matches := cidRegex.FindStringSubmatch(trimmedLine)
			if len(matches) > 1 {
				compoundCID = matches[0] // Full matched string
				baseCID = matches[1]     // First capturing group
				if len(matches) > 2 && matches[2] != "" {
					subrootCID = matches[2] // Second optional capturing group
				} else {
					subrootCID = baseCID // If no subroot CID, it's the same as base
				}
				log.WithField("compoundCID", compoundCID).WithField("baseCID", baseCID).WithField("subrootCID", subrootCID).Info("Found and parsed CID in output lines")
				break
			}
		}
	}

	// If no CID found via regex, use fallback (less reliable)
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
			// Attempt to parse base CID from fallback
			if idx := strings.Index(compoundCID, ":"); idx != -1 {
				baseCID = compoundCID[:idx]
			} else {
				baseCID = compoundCID // Assume it's just the base CID
			}
			subrootCID = baseCID // Fallback assumption
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

	// --- Log Extracted CIDs BEFORE Add Root ---
	log.WithField("uploadOutputCID", compoundCID).
		WithField("parsedBaseCID", baseCID).
		WithField("parsedSubrootCID", subrootCID).
		Info("CIDs extracted from upload-file output, before calling add-roots")
	// ----------------------------------------

	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service_name", serviceName).
		WithField("service_url", serviceURL).
		WithField("compoundCID", compoundCID).
		Info("File uploaded successfully, proceeding to add root")

	// --- Add Root to Proof Set ---
	currentProgress = 95 // Update progress before starting add-root
	currentStage = "adding_root"
	updateStatus(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Locating user proof set...",
		CID:      compoundCID, // Show the full CID in status
	})

	// --- Introduce Delay --- // Increase delay for service consistency
	preAddRootDelay := 5 * time.Second
	log.Info(fmt.Sprintf("Waiting %v before adding root to allow service registration...", preAddRootDelay))
	time.Sleep(preAddRootDelay)
	// ---------------------

	// 1. Get the user's existing proof set from the database
	var proofSet models.ProofSet
	if err := db.Where("user_id = ?", userID).First(&proofSet).Error; err != nil {
		errMsg := "Failed to query proof set for user."
		if err == gorm.ErrRecordNotFound {
			// This should ideally not happen if auth flow ensures proof set exists
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

	// Ensure the Service's ProofSetID string is populated
	if proofSet.ProofSetID == "" {
		// This might happen if the background creation is still polling
		errMsg := "Proof set creation is still pending. Please wait."
		log.WithField("userID", userID).WithField("dbProofSetID", proofSet.ID).Warning(errMsg) // Warn level
		updateStatus(UploadProgress{
			Status:     "pending", // Use a non-error status like 'pending' or 'waiting'
			Error:      errMsg,    // Keep the error message for info
			Message:    "The proof set is being initialized. Please try uploading again shortly.",
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID, // May be empty
		})
		return // Don't proceed until proof set ID is available
	}

	log.WithField("userID", userID).WithField("serviceProofSetID", proofSet.ProofSetID).Info("Found ready proof set for user, proceeding to add root")

	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    fmt.Sprintf("Adding root to proof set %s...", proofSet.ProofSetID),
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID, // Service's string ID
	})

	// 2. Add the root using the SERVICE's ProofSetID string and the COMPOUND CID
	rootArgument := compoundCID // Use the full compound CID from upload-file output
	addRootsArgs := []string{
		"add-roots",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		"--proof-set-id", proofSet.ProofSetID, // Use the SERVICE's string ID
		"--root", rootArgument,
	}
	addRootCmd := exec.Command(pdptoolPath, addRootsArgs...)

	// --- Diagnostics Start ---
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
	// --- Diagnostics End ---

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
			Message:    stderrStr, // Use stderr for more specific error from the tool
			CID:        compoundCID,
			ProofSetID: proofSet.ProofSetID,
		})
		return
	}

	// Log stderr even on success, in case of warnings
	addRootStderrStrOnSuccess := addRootError.String()
	if addRootStderrStrOnSuccess != "" {
		log.WithField("stderr", addRootStderrStrOnSuccess).Warning("add-roots command succeeded but produced output on stderr")
	}

	addRootStdoutStr := addRootOutput.String()
	log.WithField("proofSetID", proofSet.ProofSetID).
		WithField("rootUsed", rootArgument).
		WithField("stdout", addRootStdoutStr).
		Info("add-roots command completed successfully")

	// --- Find the Integer Root ID assigned by the service (with Polling) --- //
	currentProgress = 96 // Allocate some progress for getting the ID
	currentStage = "finalizing"
	updateStatus(UploadProgress{
		Status:     currentStage,
		Progress:   currentProgress,
		Message:    "Confirming Root ID assignment via polling...",
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	var extractedIntegerRootID string // Will store the integer ID string if found
	pollInterval := 3 * time.Second
	maxPollAttempts := 100 // Increased to 100 attempts (~ 5 minutes timeout)
	pollAttempt := 0
	foundRootInPoll := false

	for pollAttempt < maxPollAttempts {
		pollAttempt++
		log.Info(fmt.Sprintf("Polling get-proof-set attempt %d/%d...", pollAttempt, maxPollAttempts))

		// 3. Call get-proof-set to find the integer ID for the added root
		getProofSetArgs := []string{
			"get-proof-set",
			"--service-url", serviceURL,
			"--service-name", serviceName,
			proofSet.ProofSetID, // Use the Service's ID string as the last argument
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
			time.Sleep(pollInterval) // Wait before retrying command
			continue                 // Go to next poll attempt
		}

		// Parse the output to find the integer Root ID associated with the BASE CID
		getProofSetOutput := getProofSetStdout.String()
		log.WithField("output", getProofSetOutput).Debug(fmt.Sprintf("get-proof-set poll attempt %d output received", pollAttempt))

		lines := strings.Split(getProofSetOutput, "\n")
		var lastSeenRootID string // Store the most recently encountered integer Root ID line
		foundMatchThisAttempt := false

		for _, line := range lines {
			trimmedLine := strings.TrimSpace(line)
			if trimmedLine == "" {
				continue // Skip empty lines
			}

			// --- Flexible Root ID Parsing ---
			if idx := strings.Index(trimmedLine, "Root ID:"); idx != -1 {
				// Extract text after "Root ID:"
				potentialIDValue := strings.TrimSpace(trimmedLine[idx+len("Root ID:"):])
				log.Debug(fmt.Sprintf("[Parsing] Found line containing 'Root ID:', potential value: '%s'", potentialIDValue))
				// Check if it's an integer
				if _, err := strconv.Atoi(potentialIDValue); err == nil {
					lastSeenRootID = potentialIDValue
					log.Debug(fmt.Sprintf("[Parsing] Captured integer Root ID: %s", lastSeenRootID))
				} else {
					// Reset if value after colon wasn't an integer
					lastSeenRootID = ""
					log.Debug(fmt.Sprintf("[Parsing] Found 'Root ID:' but value '%s' is not integer, resetting lastSeenRootID", potentialIDValue))
				}
				// Don't 'continue' here, process the same line for CID check below just in case
			}

			// --- Flexible Root CID Parsing ---
			if idx := strings.Index(trimmedLine, "Root CID:"); idx != -1 {
				// Extract text after "Root CID:"
				outputCID := strings.TrimSpace(trimmedLine[idx+len("Root CID:"):])
				log.Debug(fmt.Sprintf("[Parsing] Found line containing 'Root CID:', value: '%s'", outputCID))
				// Check if it matches the target base CID
				if outputCID == baseCID {
					log.Debug(fmt.Sprintf("[Parsing] CID '%s' matches baseCID '%s'. Checking lastSeenRootID ('%s')...", outputCID, baseCID, lastSeenRootID))
					// If it matches, check if we captured a Root ID just before
					if lastSeenRootID != "" {
						extractedIntegerRootID = lastSeenRootID
						log.WithField("integerRootID", extractedIntegerRootID).WithField("matchedBaseCID", baseCID).Info(fmt.Sprintf("Successfully matched base CID and found associated integer Root ID on poll attempt %d", pollAttempt))
						foundMatchThisAttempt = true
						break // Found the match, exit inner loop (over lines)
					} else {
						// Log if CID matches but we haven't seen a valid Root ID recently
						log.WithField("matchedBaseCID", baseCID).Warning(fmt.Sprintf("Matched base CID on poll attempt %d but no preceding integer Root ID was captured (lastSeenRootID was empty)", pollAttempt))
					}
				}
			}
		} // End inner loop (over lines)

		if foundMatchThisAttempt {
			foundRootInPoll = true
			break // Exit polling loop successfully
		}

		// If not found yet, wait before the next poll attempt
		log.Debug(fmt.Sprintf("Root CID %s not found in get-proof-set output on attempt %d. Waiting %v...", baseCID, pollAttempt, pollInterval))
		time.Sleep(pollInterval)
	} // End polling loop

	// Check if polling succeeded
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
		return // Stop processing
	}

	// --- Save Piece Info --- //
	currentProgress = 98                   // Progress before DB write
	rootIDToSave := extractedIntegerRootID // Use the parsed integer ID string

	updateStatus(UploadProgress{
		Status:     currentStage, // Still finalizing
		Progress:   currentProgress,
		Message:    "Saving piece information to database...",
		CID:        compoundCID,
		ProofSetID: proofSet.ProofSetID,
	})

	piece := &models.Piece{
		UserID:      userID,
		CID:         compoundCID, // Store the original full compound CID from upload
		Filename:    file.Filename,
		Size:        file.Size,
		ServiceName: serviceName,
		ServiceURL:  serviceURL,
		ProofSetID:  &proofSet.ID,  // Link to the local DB ProofSet record's uint ID
		RootID:      &rootIDToSave, // Store the extracted INTEGER Root ID string
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

	// Final completion update
	updateStatus(UploadProgress{
		Status:     "complete",
		Progress:   currentProgress,
		Message:    "Upload completed successfully",
		CID:        compoundCID,
		Filename:   file.Filename,
		ProofSetID: proofSet.ProofSetID, // Service's string ID
	})

	// Keep the job status for 1 hour then clean it up
	go func() {
		time.Sleep(1 * time.Hour)
		uploadJobsLock.Lock()
		delete(uploadJobs, jobID)
		uploadJobsLock.Unlock()
	}()
}

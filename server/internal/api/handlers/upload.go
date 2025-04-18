package handlers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/fws/backend/internal/models"
	"github.com/fws/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	log logger.Logger
	db  *gorm.DB
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
	Status    string `json:"status"`
	Progress  int    `json:"progress,omitempty"`
	Message   string `json:"message,omitempty"`
	CID       string `json:"cid,omitempty"`
	Error     string `json:"error,omitempty"`
	Filename  string `json:"filename,omitempty"`
	TotalSize int64  `json:"totalSize,omitempty"`
}

// @Summary Upload a file to PDP service with progress updates
// @Description Upload a file to the PDP service with piece preparation and real-time progress updates
// @Tags upload
// @Accept multipart/form-data
// @Param file formData file true "File to upload"
// @Produce text/event-stream
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

	// Set up SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")

	sendProgress := func(progress UploadProgress) {
		data, _ := json.Marshal(progress)
		c.SSEvent("progress", string(data))
		c.Writer.Flush()
	}

	serviceName := "pdp-artemis"
	serviceURL := "https://yablu.net"

	sendProgress(UploadProgress{
		Status:    "starting",
		Progress:  0,
		Message:   "Starting upload process",
		Filename:  file.Filename,
		TotalSize: file.Size,
	})

	// Create a ticker for regular progress updates during periods when we might not have other updates
	progressTicker := time.NewTicker(1 * time.Second)
	defer progressTicker.Stop()

	// Keep track of the current stage and progress
	currentStage := "starting"
	currentProgress := 0
	maxProgress := 100

	// Estimated progress weights for different stages
	prepareWeight := 20 // Preparation takes about 20% of the total time
	uploadWeight := 80  // Uploading takes about 80% of the total time

	if _, err := os.Stat("pdpservice.json"); os.IsNotExist(err) {
		currentStage = "preparing"
		sendProgress(UploadProgress{
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
			sendProgress(UploadProgress{
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
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to create temp directory",
			Message: err.Error(),
		})
		return
	}
	defer os.RemoveAll(tempDir)

	// Update progress for file save operation
	sendProgress(UploadProgress{
		Status:   currentStage,
		Progress: currentProgress,
		Message:  "Saving uploaded file",
	})

	tempFilePath := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFilePath); err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to save uploaded file",
			Message: err.Error(),
		})
		return
	}

	currentProgress += 5
	currentStage = "preparing"

	sendProgress(UploadProgress{
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
		// Simulate preparation progress updates
		prepareStartProgress := currentProgress
		for i := 0; i < prepareWeight; i++ {
			select {
			case <-prepareDone:
				return
			case <-time.After(100 * time.Millisecond):
				if currentProgress < prepareStartProgress+prepareWeight-1 {
					currentProgress++
					sendProgress(UploadProgress{
						Status:   currentStage,
						Progress: currentProgress,
						Message:  "Preparing piece data...",
					})
				}
			}
		}
	}()

	if err := prepareCmd.Run(); err != nil {
		close(prepareDone)
		sendProgress(UploadProgress{
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

	sendProgress(UploadProgress{
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
	uploadCmd.Dir = filepath.Dir(pdptoolPath)

	stdoutPipe, err := uploadCmd.StdoutPipe()
	if err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to create stdout pipe",
			Message: err.Error(),
		})
		return
	}

	stderrPipe, err := uploadCmd.StderrPipe()
	if err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to create stderr pipe",
			Message: err.Error(),
		})
		return
	}

	if err := uploadCmd.Start(); err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to start upload command",
			Message: err.Error(),
		})
		return
	}

	var outputLines []string
	var errorLines []string
	uploadStart := time.Now()
	progressRegex := regexp.MustCompile(`(\d+)%`)
	isUploading := true
	cidRegex := regexp.MustCompile(`^(baga[a-zA-Z0-9]+)(?::(baga[a-zA-Z0-9]+))?$`)

	// Start a goroutine to provide periodic progress updates if no actual data is coming
	go func() {
		uploadStartProgress := currentProgress
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		// Estimated total upload time
		estimatedTotalUploadTime := time.Duration(file.Size/1024/10) * time.Millisecond // rough estimate
		if estimatedTotalUploadTime < 5*time.Second {
			estimatedTotalUploadTime = 5 * time.Second
		}

		for {
			select {
			case <-ticker.C:
				if !isUploading {
					return
				}

				// Calculate progress based on elapsed time as a fallback
				elapsedRatio := float64(time.Since(uploadStart)) / float64(estimatedTotalUploadTime)
				if elapsedRatio > 1.0 {
					elapsedRatio = 0.95 // Cap at 95% if taking longer than expected
				}

				estimatedProgress := uploadStartProgress + int(float64(uploadWeight)*elapsedRatio)

				// Only update if this would increase progress and we're not at max already
				if estimatedProgress > currentProgress && currentProgress < maxProgress-5 {
					currentProgress = estimatedProgress
					sendProgress(UploadProgress{
						Status:   currentStage,
						Progress: currentProgress,
						Message:  "Uploading file...",
					})
				}
			}
		}
	}()

	// Create a channel to signal when we detect the CID
	cidDetected := make(chan string, 1)

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			outputLines = append(outputLines, line)

			// Check if this line contains a CID
			trimmedLine := strings.TrimSpace(line)
			if cidRegex.MatchString(trimmedLine) {
				// Found a CID! This indicates the upload is complete
				matches := cidRegex.FindStringSubmatch(trimmedLine)
				extractedCid := matches[0] // Use the full match by default
				log.WithField("cid", extractedCid).Info("Detected CID in output, upload likely complete")
				cidDetected <- extractedCid
			}

			// Try to extract progress percentage if present
			if matches := progressRegex.FindStringSubmatch(line); len(matches) > 1 {
				if percent, err := strconv.Atoi(matches[1]); err == nil {
					// Scale the actual upload progress to fit our remaining progress space
					scaledProgress := prepareWeight + 10 + (percent * uploadWeight / 100)
					if scaledProgress > currentProgress {
						currentProgress = scaledProgress
					}
				}
			}

			sendProgress(UploadProgress{
				Status:   currentStage,
				Progress: currentProgress,
				Message:  line,
			})
		}
		// Close the channel if scanner exits normally
		select {
		case <-cidDetected:
			// Already sent CID
		default:
			close(cidDetected)
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			errorLines = append(errorLines, line)
			sendProgress(UploadProgress{
				Status:   "warning",
				Progress: currentProgress,
				Message:  line,
			})
		}
	}()

	// Wait for the upload to finish or for a CID to be detected
	var cid string
	cidWaitCh := make(chan struct{})

	// Log the start of the upload command
	log.WithField("filename", file.Filename).
		WithField("size", file.Size).
		WithField("service", serviceName).
		Info("Started pdptool upload command")

	// Start a goroutine to wait for the command to finish
	go func() {
		err := uploadCmd.Wait()
		if err != nil {
			log.WithField("error", err.Error()).Error("Upload command failed")
		}
		close(cidWaitCh)
	}()

	// Wait for either a CID detection or command completion
	select {
	case detectedCid, ok := <-cidDetected:
		if ok && detectedCid != "" {
			cid = detectedCid
			log.WithField("cid", cid).Info("CID detected before command completion")
		}
	case <-cidWaitCh:
		log.Info("Command completed without detected CID in channel")
	}

	// Log all output lines for debugging
	if len(outputLines) > 0 {
		log.WithField("lineCount", len(outputLines)).
			WithField("firstLine", outputLines[0]).
			WithField("lastLine", outputLines[len(outputLines)-1]).
			Info("pdptool output summary")

		// Log each line for detailed debugging if needed
		for i, line := range outputLines {
			log.WithField("lineNum", i).
				WithField("content", line).
				Info("pdptool output line")
		}
	} else {
		log.Warning("No output lines captured from pdptool command")
	}

	// Log any error lines
	if len(errorLines) > 0 {
		log.WithField("errorCount", len(errorLines)).
			WithField("errors", strings.Join(errorLines, "\n")).
			Warning("pdptool produced error output")
	}

	// If the command finished but we didn't get a CID yet, try to extract it from the output
	if cid == "" && len(outputLines) > 0 {
		// Check all output lines for a CID, starting from the last line
		for i := len(outputLines) - 1; i >= 0; i-- {
			trimmedLine := strings.TrimSpace(outputLines[i])
			if cidRegex.MatchString(trimmedLine) {
				matches := cidRegex.FindStringSubmatch(trimmedLine)
				cid = matches[0] // Use the full match by default
				log.WithField("cid", cid).Info("Found CID in output lines after command completion")
				break
			}
		}

		// If still no CID, check for any line that might look like a CID
		if cid == "" && len(outputLines) > 0 {
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
			} else {
				log.Info("No suitable CID candidate found in output")
			}
		}
	}

	isUploading = false

	// Check if we actually have a valid CID before proceeding
	if cid == "" {
		sendProgress(UploadProgress{
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

	currentProgress = 95 // Almost done, just need to save to DB

	sendProgress(UploadProgress{
		Status:   "finalizing",
		Progress: 98,
		Message:  "Saving file information",
		CID:      cid,
	})

	piece := &models.Piece{
		UserID:      userID.(uint),
		CID:         cid,
		Filename:    file.Filename,
		Size:        file.Size,
		ServiceName: serviceName,
		ServiceURL:  serviceURL,
	}

	if result := db.Create(piece); result.Error != nil {
		log.WithField("error", result.Error.Error()).Error("Failed to save piece information")
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to save piece information",
			Message: result.Error.Error(),
		})
		return
	}

	log.WithField("pieceId", piece.ID).Info("Piece information saved successfully")

	currentProgress = 100

	// Send the final completion message
	completionMessage := UploadProgress{
		Status:   "complete",
		Progress: currentProgress,
		Message:  "Upload completed successfully",
		CID:      cid,
		Filename: file.Filename,
	}

	// Send it twice to ensure it's not missed or dropped
	sendProgress(completionMessage)
	time.Sleep(100 * time.Millisecond)
	sendProgress(completionMessage)

	// Keep the connection open briefly to ensure the client receives the final message
	time.Sleep(500 * time.Millisecond)
}

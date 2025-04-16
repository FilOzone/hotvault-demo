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
		Message:   "Starting upload process",
		Filename:  file.Filename,
		TotalSize: file.Size,
	})

	if _, err := os.Stat("pdpservice.json"); os.IsNotExist(err) {
		sendProgress(UploadProgress{
			Status:  "preparing",
			Message: "Creating service secret",
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

	tempFilePath := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFilePath); err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to save uploaded file",
			Message: err.Error(),
		})
		return
	}

	sendProgress(UploadProgress{
		Status:  "preparing",
		Message: "Preparing piece",
	})

	var prepareOutput bytes.Buffer
	var prepareError bytes.Buffer
	prepareCmd := exec.Command(pdptoolPath, "prepare-piece", tempFilePath)
	prepareCmd.Stdout = &prepareOutput
	prepareCmd.Stderr = &prepareError
	prepareCmd.Dir = filepath.Dir(pdptoolPath)

	if err := prepareCmd.Run(); err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to prepare piece",
			Message: prepareError.String(),
		})
		return
	}

	sendProgress(UploadProgress{
		Status:  "uploading",
		Message: "Starting file upload",
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

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			outputLines = append(outputLines, line)
			sendProgress(UploadProgress{
				Status:  "uploading",
				Message: line,
			})
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			errorLines = append(errorLines, line)
			sendProgress(UploadProgress{
				Status:  "warning",
				Message: line,
			})
		}
	}()

	if err := uploadCmd.Wait(); err != nil {
		sendProgress(UploadProgress{
			Status:  "error",
			Error:   "Failed to upload to PDP service",
			Message: strings.Join(errorLines, "\n"),
		})
		return
	}

	var cid string
	if len(outputLines) > 0 {
		cid = outputLines[len(outputLines)-1]
		log.WithField("filename", file.Filename).
			WithField("size", file.Size).
			WithField("service_name", serviceName).
			WithField("service_url", serviceURL).
			Info(fmt.Sprintf("File uploaded successfully with CID: %s", cid))

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

		sendProgress(UploadProgress{
			Status:   "complete",
			Message:  "Upload completed successfully",
			CID:      cid,
			Filename: file.Filename,
		})
	}

	time.Sleep(100 * time.Millisecond)
}

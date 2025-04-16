package handlers

import (
	"bufio"
	"bytes"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

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

// @Summary Upload a file to PDP service
// @Description Upload a file to the PDP service with piece preparation
// @Tags upload
// @Accept multipart/form-data
// @Param file formData file true "File to upload"
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/upload [post]
func UploadFile(c *gin.Context) {
	// Check if database is initialized
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

	serviceName := "pdp-artemis"
	serviceURL := "https://yablu.net"

	if _, err := os.Stat("pdpservice.json"); os.IsNotExist(err) {
		createSecretCmd := exec.Command(pdptoolPath, "create-service-secret")
		var createSecretOutput bytes.Buffer
		var createSecretError bytes.Buffer
		createSecretCmd.Stdout = &createSecretOutput
		createSecretCmd.Stderr = &createSecretError
		if err := createSecretCmd.Run(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Failed to create service secret",
				"details": err.Error(),
				"stdout":  createSecretOutput.String(),
				"stderr":  createSecretError.String(),
			})
			return
		}
	}

	tempDir, err := os.MkdirTemp("", "pdp-upload-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to create temp directory: %v", err),
		})
		return
	}
	defer os.RemoveAll(tempDir)

	tempFilePath := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to save uploaded file: %v", err),
		})
		return
	}

	var prepareOutput bytes.Buffer
	var prepareError bytes.Buffer
	prepareCmd := exec.Command(pdptoolPath, "prepare-piece", tempFilePath)
	prepareCmd.Stdout = &prepareOutput
	prepareCmd.Stderr = &prepareError
	prepareCmd.Dir = filepath.Dir(pdptoolPath)

	if err := prepareCmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to prepare piece",
			"details": err.Error(),
			"stdout":  prepareOutput.String(),
			"stderr":  prepareError.String(),
			"command": prepareCmd.String(),
		})
		return
	}

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
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to create stdout pipe",
			"details": err.Error(),
		})
		return
	}

	stderrPipe, err := uploadCmd.StderrPipe()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to create stderr pipe",
			"details": err.Error(),
		})
		return
	}

	if err := uploadCmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to start upload command",
			"details": err.Error(),
			"command": uploadCmd.String(),
		})
		return
	}

	var outputLines []string
	var errorLines []string

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			outputLines = append(outputLines, scanner.Text())
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			errorLines = append(errorLines, scanner.Text())
		}
	}()

	if err := uploadCmd.Wait(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":        "Failed to upload to PDP service",
			"details":      err.Error(),
			"stdout":       strings.Join(outputLines, "\n"),
			"stderr":       strings.Join(errorLines, "\n"),
			"command":      uploadCmd.String(),
			"service_url":  serviceURL,
			"service_name": serviceName,
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

		// Save piece information to database
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
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Failed to save piece information",
				"details": result.Error.Error(),
			})
			return
		}

		log.WithField("pieceId", piece.ID).Info("Piece information saved successfully")
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "File uploaded successfully to PDP service",
		"filename":        file.Filename,
		"size":            file.Size,
		"prepare_output":  prepareOutput.String(),
		"upload_output":   strings.Join(outputLines, "\n"),
		"upload_progress": outputLines,
		"cid":             cid,
		"service_url":     serviceURL,
		"service_name":    serviceName,
	})
}

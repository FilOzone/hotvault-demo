package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// UploadFile handles file uploads
// @Summary Upload a file to PDP service
// @Description Upload a file to the PDP service with piece preparation
// @Tags upload
// @Accept multipart/form-data
// @Param file formData file true "File to upload"
// @Param service_name formData string true "Service name"
// @Param service_url formData string true "Service URL"
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/upload [post]
func UploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No file received",
		})
		return
	}
	serviceName := "pdp-service"
	// serviceName := c.PostForm("service_name")
	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "service_name is required",
		})
		return
	}

	serviceURL := c.PostForm("service_url")
	if serviceURL == "" {
		serviceURL = "http://localhost:7001" // default URL
	}

	// Create temp directory for file processing
	tempDir, err := os.MkdirTemp("", "pdp-upload-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to create temp directory: %v", err),
		})
		return
	}
	defer os.RemoveAll(tempDir)

	// Save uploaded file to temp directory
	tempFilePath := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to save uploaded file: %v", err),
		})
		return
	}

	// Prepare piece
	var prepareOutput bytes.Buffer
	var prepareError bytes.Buffer
	prepareCmd := exec.Command("pdptool", "prepare-piece", tempFilePath)
	prepareCmd.Stdout = &prepareOutput
	prepareCmd.Stderr = &prepareError

	if err := prepareCmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to prepare piece",
			"details": err.Error(),
			"stdout":  prepareOutput.String(),
			"stderr":  prepareError.String(),
		})
		return
	}

	// Upload to PDP service
	var uploadOutput bytes.Buffer
	var uploadError bytes.Buffer
	uploadCmd := exec.Command(
		"pdptool",
		"upload-file",
		"--service-url", serviceURL,
		"--service-name", serviceName,
		tempFilePath,
	)
	uploadCmd.Stdout = &uploadOutput
	uploadCmd.Stderr = &uploadError

	if err := uploadCmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to upload to PDP service",
			"details": err.Error(),
			"stdout":  uploadOutput.String(),
			"stderr":  uploadError.String(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "File uploaded successfully to PDP service",
		"filename":       file.Filename,
		"size":           file.Size,
		"prepare_output": prepareOutput.String(),
		"upload_output":  uploadOutput.String(),
	})
}

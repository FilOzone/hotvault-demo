package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/hotvault/backend/internal/models"
)

// @Summary Download a file from PDP service
// @Description Download a file from the PDP service using its CID
// @Tags download
// @Accept json
// @Param cid path string true "CID of the file to download"
// @Produce octet-stream
// @Success 200 {file} binary "File content"
// @Router /api/v1/download/{cid} [get]
func DownloadFile(c *gin.Context) {
	if db == nil {
		log.Error("Database connection not initialized")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error: database not initialized",
		})
		return
	}

	cid := c.Param("cid")
	if cid == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "CID is required",
		})
		return
	}

	var piece models.Piece
	if err := db.Where("c_id = ?", cid).First(&piece).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Piece not found",
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
		})
		return
	}

	// Change working directory to pdptool directory
	pdptoolDir := getPdptoolParentDir(pdptoolPath)
	if err := os.Chdir(pdptoolDir); err != nil {
		log.Error(fmt.Sprintf("Failed to change working directory to pdptool directory: %v", err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to set working directory",
		})
		return
	}
	log.WithField("pdptoolDir", pdptoolDir).Info("Changed working directory to pdptool directory")

	log.WithField("path", pdptoolPath).Info("Using pdptool at path")

	processCid := cid
	if parts := strings.Split(cid, ":"); len(parts) > 0 {
		processCid = parts[0]
	}

	tempDir, err := os.MkdirTemp("", "pdp-download-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to create temp directory: %v", err),
		})
		return
	}
	defer os.RemoveAll(tempDir)

	chunkFile := filepath.Join(tempDir, "chunks.txt")
	if err := os.WriteFile(chunkFile, []byte(processCid), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to create chunk file: %v", err),
		})
		return
	}

	outputFile := filepath.Join(tempDir, piece.Filename)
	downloadCmd := exec.Command(
		pdptoolPath,
		"download-file",
		"--service-url", piece.ServiceURL,
		"--chunk-file", chunkFile,
		"--output-file", outputFile,
	)

	log.WithField("command", "download-file").
		WithField("serviceURL", piece.ServiceURL).
		WithField("chunkFile", chunkFile).
		WithField("outputFile", outputFile).
		WithField("cid", cid).
		WithField("processCid", processCid).
		WithField("filename", piece.Filename).
		Info("Executing download-file command")

	var errOutput bytes.Buffer
	downloadCmd.Stderr = &errOutput

	if err := downloadCmd.Run(); err != nil {
		errorMsg := fmt.Sprintf("Failed to download file: %v", err)
		log.WithField("error", err.Error()).WithField("stderr", errOutput.String()).Error(errorMsg)

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   errorMsg,
			"details": err.Error(),
			"stderr":  errOutput.String(),
		})
		return
	}

	file, err := os.Open(outputFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to open downloaded file: %v", err),
		})
		return
	}
	defer file.Close()

	fileInfo, err := file.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get file info: %v", err),
		})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))
	encodedFilename := strings.ReplaceAll(piece.Filename, `"`, `\"`)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, encodedFilename))
	c.Header("Cache-Control", "private, no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")

	if _, err := io.Copy(c.Writer, file); err != nil {
		log.WithField("error", err.Error()).Error("Failed to stream file to response")
		return
	}
}

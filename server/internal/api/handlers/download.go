package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/fws/backend/internal/models"
	"github.com/gin-gonic/gin"
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

	pdptoolPath := "/Users/art3mis/Developer/opensource/protocol/curio/pdptool"
	if _, err := os.Stat(pdptoolPath); os.IsNotExist(err) {
		log.WithField("path", pdptoolPath).Error("pdptool not found")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pdptool not found",
			"path":  pdptoolPath,
		})
		return
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
	if err := os.WriteFile(chunkFile, []byte(cid), 0644); err != nil {
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
	downloadCmd.Dir = filepath.Dir(pdptoolPath)

	var errOutput bytes.Buffer
	downloadCmd.Stderr = &errOutput

	if err := downloadCmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to download file",
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
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", piece.Filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))

	if _, err := io.Copy(c.Writer, file); err != nil {
		log.WithField("error", err.Error()).Error("Failed to stream file to response")
		return
	}
}

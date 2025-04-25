package handlers

import (
	"fmt"
	"io"
	"io/ioutil"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ChunkedUploadInfo struct {
	ID             string       `json:"id"`
	UserID         uint         `json:"userId"`
	Filename       string       `json:"filename"`
	ChunkSize      int64        `json:"chunkSize"`
	TotalSize      int64        `json:"totalSize"`
	TotalChunks    int          `json:"totalChunks"`
	UploadedChunks int          `json:"uploadedChunks"`
	ChunksReceived map[int]bool `json:"-"`
	TempDir        string       `json:"-"`
	Status         string       `json:"status"`
	CreatedAt      time.Time    `json:"createdAt"`
	UpdatedAt      time.Time    `json:"updatedAt"`
	FileType       string       `json:"fileType"`
}

var (
	chunkedUploads      = make(map[string]*ChunkedUploadInfo)
	chunkedUploadsMutex sync.RWMutex
)

func init() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupOldChunkedUploads()
		}
	}()
}

func cleanupOldChunkedUploads() {
	threshold := time.Now().Add(-24 * time.Hour)

	chunkedUploadsMutex.Lock()
	defer chunkedUploadsMutex.Unlock()

	for id, info := range chunkedUploads {
		if info.UpdatedAt.Before(threshold) {
			if info.TempDir != "" {
				os.RemoveAll(info.TempDir)
			}
			delete(chunkedUploads, id)
			log.WithField("uploadId", id).Info("Cleaned up expired chunked upload")
		}
	}
}

func InitChunkedUpload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var request struct {
		Filename    string `json:"filename" binding:"required"`
		TotalSize   int64  `json:"totalSize" binding:"required"`
		ChunkSize   int64  `json:"chunkSize" binding:"required"`
		TotalChunks int    `json:"totalChunks" binding:"required"`
		FileType    string `json:"fileType" binding:"required"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request parameters: " + err.Error(),
		})
		return
	}

	uploadID := uuid.New().String()
	tempDir := filepath.Join(os.TempDir(), "chunked_uploads", uploadID)

	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create temp directory: " + err.Error(),
		})
		return
	}

	now := time.Now()
	uploadInfo := &ChunkedUploadInfo{
		ID:             uploadID,
		UserID:         userID.(uint),
		Filename:       request.Filename,
		ChunkSize:      request.ChunkSize,
		TotalSize:      request.TotalSize,
		TotalChunks:    request.TotalChunks,
		UploadedChunks: 0,
		ChunksReceived: make(map[int]bool),
		TempDir:        tempDir,
		Status:         "initialized",
		CreatedAt:      now,
		UpdatedAt:      now,
		FileType:       request.FileType,
	}

	chunkedUploadsMutex.Lock()
	chunkedUploads[uploadID] = uploadInfo
	chunkedUploadsMutex.Unlock()

	log.WithField("uploadId", uploadID).
		WithField("filename", request.Filename).
		WithField("totalSize", formatFileSize(request.TotalSize)).
		WithField("totalChunks", request.TotalChunks).
		Info("Initialized chunked upload")

	c.JSON(http.StatusOK, gin.H{
		"uploadId":    uploadID,
		"message":     "Chunked upload initialized successfully",
		"totalChunks": request.TotalChunks,
	})
}

func UploadChunk(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	uploadID := c.Query("uploadId")
	if uploadID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing uploadId parameter",
		})
		return
	}

	chunkIndexStr := c.Query("chunkIndex")
	if chunkIndexStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing chunkIndex parameter",
		})
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid chunkIndex parameter",
		})
		return
	}

	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[uploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	if uploadInfo.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You don't have permission to access this upload",
		})
		return
	}

	if chunkIndex < 0 || chunkIndex >= uploadInfo.TotalChunks {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Invalid chunk index. Must be between 0 and %d", uploadInfo.TotalChunks-1),
		})
		return
	}

	chunkedUploadsMutex.RLock()
	_, chunkExists := uploadInfo.ChunksReceived[chunkIndex]
	chunkedUploadsMutex.RUnlock()

	if chunkExists {
		c.JSON(http.StatusOK, gin.H{
			"message":        fmt.Sprintf("Chunk %d already received", chunkIndex),
			"uploadId":       uploadID,
			"chunkIndex":     chunkIndex,
			"uploadedChunks": uploadInfo.UploadedChunks,
			"totalChunks":    uploadInfo.TotalChunks,
		})
		return
	}

	file, err := c.FormFile("chunk")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to get chunk data: " + err.Error(),
		})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to open uploaded chunk: " + err.Error(),
		})
		return
	}
	defer src.Close()

	chunkPath := filepath.Join(uploadInfo.TempDir, fmt.Sprintf("chunk_%d", chunkIndex))
	dst, err := os.Create(chunkPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create chunk file: " + err.Error(),
		})
		return
	}
	defer dst.Close()

	if _, err = io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save chunk data: " + err.Error(),
		})
		return
	}

	chunkedUploadsMutex.Lock()
	uploadInfo.ChunksReceived[chunkIndex] = true
	uploadInfo.UploadedChunks++
	uploadInfo.UpdatedAt = time.Now()
	if uploadInfo.UploadedChunks == uploadInfo.TotalChunks {
		uploadInfo.Status = "allChunksReceived"
	} else {
		uploadInfo.Status = "inProgress"
	}
	chunkedUploadsMutex.Unlock()

	log.WithField("uploadId", uploadID).
		WithField("chunkIndex", chunkIndex).
		WithField("uploadedChunks", uploadInfo.UploadedChunks).
		WithField("totalChunks", uploadInfo.TotalChunks).
		Info("Received chunk")

	c.JSON(http.StatusOK, gin.H{
		"message":           fmt.Sprintf("Chunk %d received successfully", chunkIndex),
		"uploadId":          uploadID,
		"chunkIndex":        chunkIndex,
		"uploadedChunks":    uploadInfo.UploadedChunks,
		"totalChunks":       uploadInfo.TotalChunks,
		"allChunksReceived": uploadInfo.UploadedChunks == uploadInfo.TotalChunks,
	})
}

func CompleteChunkedUpload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	var request struct {
		UploadID string `json:"uploadId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request parameters: " + err.Error(),
		})
		return
	}

	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[request.UploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	if uploadInfo.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You don't have permission to access this upload",
		})
		return
	}

	if uploadInfo.UploadedChunks != uploadInfo.TotalChunks {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Not all chunks received. Got %d of %d chunks",
				uploadInfo.UploadedChunks, uploadInfo.TotalChunks),
			"uploadedChunks": uploadInfo.UploadedChunks,
			"totalChunks":    uploadInfo.TotalChunks,
		})
		return
	}

	chunkedUploadsMutex.Lock()
	uploadInfo.Status = "assembling"
	chunkedUploadsMutex.Unlock()

	jobID := uuid.New().String()

	go assembleAndProcessFile(uploadInfo, jobID, userID.(uint))

	c.JSON(http.StatusOK, gin.H{
		"message":  "Finalizing chunked upload",
		"uploadId": request.UploadID,
		"jobId":    jobID,
		"status":   "processing",
	})
}

func GetChunkedUploadStatus(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	uploadID := c.Param("uploadId")
	if uploadID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing uploadId parameter",
		})
		return
	}

	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[uploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	if uploadInfo.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You don't have permission to access this upload",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"uploadId":       uploadID,
		"status":         uploadInfo.Status,
		"uploadedChunks": uploadInfo.UploadedChunks,
		"totalChunks":    uploadInfo.TotalChunks,
		"filename":       uploadInfo.Filename,
		"totalSize":      uploadInfo.TotalSize,
		"progress":       float64(uploadInfo.UploadedChunks) / float64(uploadInfo.TotalChunks) * 100,
	})
}

func assembleAndProcessFile(uploadInfo *ChunkedUploadInfo, jobID string, userID uint) {
	uploadJobsLock.Lock()
	uploadJobs[jobID] = UploadProgress{
		Status:    "assembling",
		Progress:  0,
		Message:   "Assembling file chunks",
		Filename:  uploadInfo.Filename,
		TotalSize: uploadInfo.TotalSize,
		JobID:     jobID,
	}
	uploadJobsLock.Unlock()

	chunkedUploadsMutex.Lock()
	uploadInfo.Status = "assembling"
	chunkedUploadsMutex.Unlock()

	if _, err := os.Stat(uploadInfo.TempDir); os.IsNotExist(err) {
		log.WithField("tempDir", uploadInfo.TempDir).Error("Temp directory doesn't exist")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to locate temporary directory",
			Message: fmt.Sprintf("Directory %s doesn't exist", uploadInfo.TempDir),
		})
		return
	}

	finalFilePath := filepath.Join(uploadInfo.TempDir, uploadInfo.Filename)

	if _, err := os.Stat(finalFilePath); err == nil {
		log.WithField("finalFilePath", finalFilePath).Info("Final file already exists, removing it")
		if err := os.Remove(finalFilePath); err != nil {
			log.WithField("error", err.Error()).Error("Failed to remove existing final file")
			updateJobStatus(jobID, UploadProgress{
				Status:  "error",
				Error:   "Failed to prepare final file",
				Message: fmt.Sprintf("Failed to remove existing file: %s", err.Error()),
			})
			return
		}
	}

	finalFile, err := os.Create(finalFilePath)
	if err != nil {
		log.WithField("error", err.Error()).
			WithField("finalFilePath", finalFilePath).
			Error("Failed to create final file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to create final file",
			Message: err.Error(),
		})
		return
	}

	defer func() {
		if finalFile != nil {
			finalFile.Close()
		}
	}()

	totalBytesWritten := int64(0)
	missingChunks := false

	for i := 0; i < uploadInfo.TotalChunks; i++ {
		updateJobStatus(jobID, UploadProgress{
			Status:    "assembling",
			Progress:  int(float64(i) / float64(uploadInfo.TotalChunks) * 30), // Assembly = 0-30%
			Message:   fmt.Sprintf("Assembling chunks: %d/%d", i+1, uploadInfo.TotalChunks),
			Filename:  uploadInfo.Filename,
			TotalSize: uploadInfo.TotalSize,
		})

		chunkPath := filepath.Join(uploadInfo.TempDir, fmt.Sprintf("chunk_%d", i))

		if _, err := os.Stat(chunkPath); os.IsNotExist(err) {
			log.WithField("chunkPath", chunkPath).Error("Chunk file doesn't exist")
			missingChunks = true
			updateJobStatus(jobID, UploadProgress{
				Status:  "error",
				Error:   fmt.Sprintf("Missing chunk %d", i),
				Message: fmt.Sprintf("Chunk file %s doesn't exist", chunkPath),
			})
			return
		}

		chunkData, err := ioutil.ReadFile(chunkPath)
		if err != nil {
			log.WithField("error", err.Error()).
				WithField("chunkPath", chunkPath).
				Error("Failed to read chunk")
			updateJobStatus(jobID, UploadProgress{
				Status:  "error",
				Error:   fmt.Sprintf("Failed to read chunk %d", i),
				Message: err.Error(),
			})
			return
		}

		bytesWritten, err := finalFile.Write(chunkData)
		if err != nil {
			log.WithField("error", err.Error()).
				WithField("chunkPath", chunkPath).
				Error("Failed to write chunk to final file")
			updateJobStatus(jobID, UploadProgress{
				Status:  "error",
				Error:   fmt.Sprintf("Failed to write chunk %d to final file", i),
				Message: err.Error(),
			})
			return
		}

		totalBytesWritten += int64(bytesWritten)
	}

	if missingChunks {
		log.Error("Some chunks were missing, cannot assemble file")
		return
	}

	if totalBytesWritten != uploadInfo.TotalSize {
		log.WithField("expectedSize", uploadInfo.TotalSize).
			WithField("actualSize", totalBytesWritten).
			Error("Assembled file size mismatch")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Assembled file size mismatch",
			Message: fmt.Sprintf("Expected %d bytes but wrote %d bytes", uploadInfo.TotalSize, totalBytesWritten),
		})
		return
	}

	if err := finalFile.Sync(); err != nil {
		log.WithField("error", err.Error()).Error("Failed to sync final file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to sync final file",
			Message: err.Error(),
		})
		return
	}

	if err := finalFile.Close(); err != nil {
		log.WithField("error", err.Error()).Error("Failed to close final file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to close final file",
			Message: err.Error(),
		})
		return
	}

	finalFile = nil

	fileInfo, err := os.Stat(finalFilePath)
	if err != nil {
		log.WithField("error", err.Error()).
			WithField("finalFilePath", finalFilePath).
			Error("Failed to stat assembled file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to verify assembled file",
			Message: fmt.Sprintf("Error: %s", err.Error()),
		})
		return
	}

	if fileInfo.Size() != uploadInfo.TotalSize {
		log.WithField("expectedSize", uploadInfo.TotalSize).
			WithField("actualSize", fileInfo.Size()).
			Error("Final file size mismatch after stat")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Final file size mismatch",
			Message: fmt.Sprintf("Expected %d bytes but got %d bytes", uploadInfo.TotalSize, fileInfo.Size()),
		})
		return
	}

	updateJobStatus(jobID, UploadProgress{
		Status:    "processing",
		Progress:  30,
		Message:   "File assembled, starting processing",
		Filename:  uploadInfo.Filename,
		TotalSize: uploadInfo.TotalSize,
	})

	chunkedUploadsMutex.Lock()
	uploadInfo.Status = "processing"
	chunkedUploadsMutex.Unlock()

	log.WithField("finalFilePath", finalFilePath).
		WithField("fileSize", fileInfo.Size()).
		Info("File successfully assembled, proceeding to processing")

	fileHeader := &multipart.FileHeader{
		Filename: uploadInfo.Filename,
		Size:     uploadInfo.TotalSize,
		Header:   make(map[string][]string),
	}

	uploadPathsLock.Lock()
	filePaths[jobID] = finalFilePath
	log.WithField("jobID", jobID).
		WithField("finalFilePath", finalFilePath).
		Info("Storing file path for processing")
	uploadPathsLock.Unlock()

	uploadPathsLock.RLock()
	storedPath, pathExists := filePaths[jobID]
	uploadPathsLock.RUnlock()

	if !pathExists || storedPath != finalFilePath {
		log.WithField("jobID", jobID).
			WithField("expectedPath", finalFilePath).
			WithField("storedPath", storedPath).
			WithField("pathExists", pathExists).
			Error("File path was not stored correctly")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Internal error: file path not stored correctly",
			Message: "Please try again or contact support",
		})
		return
	}

	processUpload(jobID, fileHeader, userID, cfg.PdptoolPath)

	go func() {
		time.Sleep(5 * time.Second)

		uploadJobsLock.RLock()
		progress, exists := uploadJobs[jobID]
		uploadJobsLock.RUnlock()

		if exists && (progress.Status == "complete" || progress.Status == "error") {
			log.WithField("tempDir", uploadInfo.TempDir).Info("Cleaning up temp directory after completion")
			os.RemoveAll(uploadInfo.TempDir)

			uploadPathsLock.Lock()
			delete(filePaths, jobID)
			uploadPathsLock.Unlock()

			chunkedUploadsMutex.Lock()
			delete(chunkedUploads, uploadInfo.ID)
			chunkedUploadsMutex.Unlock()

			log.WithField("uploadId", uploadInfo.ID).
				WithField("jobId", jobID).
				Info("Cleaned up completed chunked upload")
		} else {
			log.WithField("uploadId", uploadInfo.ID).
				WithField("jobId", jobID).
				WithField("status", progress.Status).
				Info("Upload still in progress, will clean up later")

			go func() {
				cleanupTicker := time.NewTicker(10 * time.Second)
				defer cleanupTicker.Stop()

				for range cleanupTicker.C {
					uploadJobsLock.RLock()
					progress, exists := uploadJobs[jobID]
					uploadJobsLock.RUnlock()

					if !exists || progress.Status == "complete" || progress.Status == "error" {
						log.WithField("uploadId", uploadInfo.ID).
							WithField("jobId", jobID).
							Info("Cleaning up chunked upload in delayed cleanup")

						os.RemoveAll(uploadInfo.TempDir)

						uploadPathsLock.Lock()
						delete(filePaths, jobID)
						uploadPathsLock.Unlock()

						chunkedUploadsMutex.Lock()
						delete(chunkedUploads, uploadInfo.ID)
						chunkedUploadsMutex.Unlock()

						return
					}
				}
			}()
		}
	}()
}

var (
	filePaths       = make(map[string]string)
	uploadPathsLock sync.RWMutex
)

func updateJobStatus(jobID string, progress UploadProgress) {
	progress.JobID = jobID
	uploadJobsLock.Lock()
	uploadJobs[jobID] = progress
	uploadJobsLock.Unlock()
}

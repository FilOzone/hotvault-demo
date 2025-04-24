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

// ChunkedUploadInfo stores information about an ongoing chunked upload
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

// Chunked upload in-memory storage
var (
	chunkedUploads      = make(map[string]*ChunkedUploadInfo)
	chunkedUploadsMutex sync.RWMutex
)

// Cleanup old uploads periodically
func init() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupOldChunkedUploads()
		}
	}()
}

// cleanupOldChunkedUploads removes uploads older than 24 hours
func cleanupOldChunkedUploads() {
	threshold := time.Now().Add(-24 * time.Hour)

	chunkedUploadsMutex.Lock()
	defer chunkedUploadsMutex.Unlock()

	for id, info := range chunkedUploads {
		if info.UpdatedAt.Before(threshold) {
			// Remove temp directory
			if info.TempDir != "" {
				os.RemoveAll(info.TempDir)
			}
			// Remove from map
			delete(chunkedUploads, id)
			log.WithField("uploadId", id).Info("Cleaned up expired chunked upload")
		}
	}
}

// InitChunkedUpload initializes a new chunked upload
func InitChunkedUpload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	// Parse upload details
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

	// Create temp directory for chunks
	uploadID := uuid.New().String()
	tempDir := filepath.Join(os.TempDir(), "chunked_uploads", uploadID)

	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create temp directory: " + err.Error(),
		})
		return
	}

	// Create upload info
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

	// Store upload info
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

// UploadChunk handles a single chunk of a chunked upload
func UploadChunk(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User ID not found in token",
		})
		return
	}

	// Get upload ID from query params
	uploadID := c.Query("uploadId")
	if uploadID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing uploadId parameter",
		})
		return
	}

	// Get chunk index from query params
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

	// Retrieve upload info
	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[uploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	// Verify user owns this upload
	if uploadInfo.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You don't have permission to access this upload",
		})
		return
	}

	// Verify chunk index is valid
	if chunkIndex < 0 || chunkIndex >= uploadInfo.TotalChunks {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Invalid chunk index. Must be between 0 and %d", uploadInfo.TotalChunks-1),
		})
		return
	}

	// Check if chunk already received
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

	// Get the chunk data from multipart form
	file, err := c.FormFile("chunk")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to get chunk data: " + err.Error(),
		})
		return
	}

	// Open the uploaded chunk
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to open uploaded chunk: " + err.Error(),
		})
		return
	}
	defer src.Close()

	// Create the destination file for this chunk
	chunkPath := filepath.Join(uploadInfo.TempDir, fmt.Sprintf("chunk_%d", chunkIndex))
	dst, err := os.Create(chunkPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create chunk file: " + err.Error(),
		})
		return
	}
	defer dst.Close()

	// Copy the chunk data
	if _, err = io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save chunk data: " + err.Error(),
		})
		return
	}

	// Update upload info
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

// CompleteChunkedUpload finalizes a chunked upload
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

	// Retrieve upload info
	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[request.UploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	// Verify user owns this upload
	if uploadInfo.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You don't have permission to access this upload",
		})
		return
	}

	// Verify all chunks are received
	if uploadInfo.UploadedChunks != uploadInfo.TotalChunks {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Not all chunks received. Got %d of %d chunks",
				uploadInfo.UploadedChunks, uploadInfo.TotalChunks),
			"uploadedChunks": uploadInfo.UploadedChunks,
			"totalChunks":    uploadInfo.TotalChunks,
		})
		return
	}

	// Update status
	chunkedUploadsMutex.Lock()
	uploadInfo.Status = "assembling"
	chunkedUploadsMutex.Unlock()

	// Create a job ID for tracking the assembly and processing
	jobID := uuid.New().String()

	// Start a goroutine to assemble and process the file
	go assembleAndProcessFile(uploadInfo, jobID, userID.(uint))

	c.JSON(http.StatusOK, gin.H{
		"message":  "Finalizing chunked upload",
		"uploadId": request.UploadID,
		"jobId":    jobID,
		"status":   "processing",
	})
}

// GetChunkedUploadStatus returns the status of a chunked upload
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

	// Retrieve upload info
	chunkedUploadsMutex.RLock()
	uploadInfo, exists := chunkedUploads[uploadID]
	chunkedUploadsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload ID not found",
		})
		return
	}

	// Verify user owns this upload
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

// assembleAndProcessFile combines all chunks into a single file and processes it
func assembleAndProcessFile(uploadInfo *ChunkedUploadInfo, jobID string, userID uint) {
	// Create initial job status
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

	// Update chunked upload status
	chunkedUploadsMutex.Lock()
	uploadInfo.Status = "assembling"
	chunkedUploadsMutex.Unlock()

	// Ensure the temp directory exists
	if _, err := os.Stat(uploadInfo.TempDir); os.IsNotExist(err) {
		log.WithField("tempDir", uploadInfo.TempDir).Error("Temp directory doesn't exist")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to locate temporary directory",
			Message: fmt.Sprintf("Directory %s doesn't exist", uploadInfo.TempDir),
		})
		return
	}

	// Create the final file
	finalFilePath := filepath.Join(uploadInfo.TempDir, uploadInfo.Filename)

	// Check if the final file already exists and remove it if it does
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

	// Close finalFile at the end
	defer func() {
		// Only try to close if the file is not nil
		if finalFile != nil {
			finalFile.Close()
		}
	}()

	// Assemble chunks in order
	totalBytesWritten := int64(0)
	missingChunks := false

	for i := 0; i < uploadInfo.TotalChunks; i++ {
		// Update assembly progress
		updateJobStatus(jobID, UploadProgress{
			Status:    "assembling",
			Progress:  int(float64(i) / float64(uploadInfo.TotalChunks) * 30), // Assembly = 0-30%
			Message:   fmt.Sprintf("Assembling chunks: %d/%d", i+1, uploadInfo.TotalChunks),
			Filename:  uploadInfo.Filename,
			TotalSize: uploadInfo.TotalSize,
		})

		chunkPath := filepath.Join(uploadInfo.TempDir, fmt.Sprintf("chunk_%d", i))

		// Check if the chunk file exists
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

	// Verify file size
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

	// Ensure all data is written to disk
	if err := finalFile.Sync(); err != nil {
		log.WithField("error", err.Error()).Error("Failed to sync final file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to sync final file",
			Message: err.Error(),
		})
		return
	}

	// Close the file explicitly before proceeding
	if err := finalFile.Close(); err != nil {
		log.WithField("error", err.Error()).Error("Failed to close final file")
		updateJobStatus(jobID, UploadProgress{
			Status:  "error",
			Error:   "Failed to close final file",
			Message: err.Error(),
		})
		return
	}

	// Set finalFile to nil so the defer doesn't try to close it again
	finalFile = nil

	// Verify the file exists and is accessible before proceeding
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

	// Double-check file size
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

	// Update status to processing
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

	// Now create a wrapper to make the file compatible with processUpload's expectations
	fileHeader := &multipart.FileHeader{
		Filename: uploadInfo.Filename,
		Size:     uploadInfo.TotalSize,
		Header:   make(map[string][]string),
	}

	// Store the path for custom handling in processUpload
	uploadPathsLock.Lock()
	filePaths[jobID] = finalFilePath
	log.WithField("jobID", jobID).
		WithField("finalFilePath", finalFilePath).
		Info("Storing file path for processing")
	uploadPathsLock.Unlock()

	// Verify the path is stored correctly
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

	// Process the file using the existing upload pipeline
	processUpload(jobID, fileHeader, userID, cfg.PdptoolPath)

	// Clean up temp files after processing completes or fails
	// This is done in a separate goroutine to not delay the response
	go func() {
		// Wait a bit to ensure processing has started
		time.Sleep(5 * time.Second)

		// Check if uploading already finished
		uploadJobsLock.RLock()
		progress, exists := uploadJobs[jobID]
		uploadJobsLock.RUnlock()

		if exists && (progress.Status == "complete" || progress.Status == "error") {
			// Clean up temp directory
			log.WithField("tempDir", uploadInfo.TempDir).Info("Cleaning up temp directory after completion")
			os.RemoveAll(uploadInfo.TempDir)

			// Remove the path mapping
			uploadPathsLock.Lock()
			delete(filePaths, jobID)
			uploadPathsLock.Unlock()

			// Remove the upload info from memory
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

			// Start a periodic check to clean up when done
			go func() {
				cleanupTicker := time.NewTicker(30 * time.Second)
				defer cleanupTicker.Stop()

				for range cleanupTicker.C {
					uploadJobsLock.RLock()
					progress, exists := uploadJobs[jobID]
					uploadJobsLock.RUnlock()

					if !exists || progress.Status == "complete" || progress.Status == "error" {
						log.WithField("uploadId", uploadInfo.ID).
							WithField("jobId", jobID).
							Info("Cleaning up chunked upload in delayed cleanup")

						// Clean up temp directory
						os.RemoveAll(uploadInfo.TempDir)

						// Remove the path mapping
						uploadPathsLock.Lock()
						delete(filePaths, jobID)
						uploadPathsLock.Unlock()

						// Remove the upload info from memory
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

// Storage for file paths by job ID
var (
	filePaths       = make(map[string]string)
	uploadPathsLock sync.RWMutex
)

// Helper function to update job status
func updateJobStatus(jobID string, progress UploadProgress) {
	progress.JobID = jobID
	uploadJobsLock.Lock()
	uploadJobs[jobID] = progress
	uploadJobsLock.Unlock()
}

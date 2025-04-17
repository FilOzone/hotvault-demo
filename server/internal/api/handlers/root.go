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

type RemoveRootRequest struct {
	ProofSetID  int    `json:"proofSetId" binding:"required"`
	ServiceURL  string `json:"serviceUrl" binding:"required"`
	ServiceName string `json:"serviceName" binding:"required"`
	RootID      string `json:"rootId" binding:"required"`
}

// @Summary Remove roots using pdptool
// @Description Remove a specific root from the PDP service
// @Tags roots
// @Accept json
// @Produce json
// @Param request body RemoveRootRequest true "Remove root request data"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/roots/remove [post]
func RemoveRoot(c *gin.Context) {
	if db == nil {
		log.Error("Database connection not initialized")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error: database not initialized",
		})
		return
	}

	var request RemoveRootRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request: " + err.Error(),
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

	removeCmd := exec.Command(
		pdptoolPath,
		"remove-roots",
		"--service-url", request.ServiceURL,
		"--proof-set-id", fmt.Sprintf("%d", request.ProofSetID),
		"--service-name", request.ServiceName,
		"--root-id", request.RootID,
	)
	removeCmd.Dir = filepath.Dir(pdptoolPath)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	removeCmd.Stdout = &stdout
	removeCmd.Stderr = &stderr

	if err := removeCmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to remove root",
			"details": err.Error(),
			"stderr":  stderr.String(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Root removal scheduled successfully",
		"output":  stdout.String(),
	})
}

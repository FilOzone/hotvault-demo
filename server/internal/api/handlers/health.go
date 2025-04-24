package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type HealthResponse struct {
	Status string `json:"status" example:"ok"`
}

// HealthCheck godoc
// @Summary Health Check
// @Description Returns the health status of the API
// @Tags Health
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, HealthResponse{
		Status: "ok",
	})
}

// NotFound godoc
// @Summary Not Found
// @Description Returns 404 Not Found error
// @Tags Error
// @Produce json
// @Success 404 {object} ErrorResponse
// @Router /404 [get]
func NotFound(c *gin.Context) {
	c.JSON(http.StatusNotFound, ErrorResponse{
		Error: "Resource not found",
	})
}

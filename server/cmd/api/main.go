package main

import (
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/hotvault/backend/config"
	"github.com/hotvault/backend/internal/api/routes"
	"github.com/hotvault/backend/internal/database"
	"github.com/hotvault/backend/pkg/logger"
	"github.com/joho/godotenv"
)

func main() {

	log := logger.NewLogger()

	if err := godotenv.Load(); err != nil {
		log.Warning("No .env file found, using environment variables")
	}

	log.Info("Loading configuration...")
	cfg := config.LoadConfig()

	loggingConfig := logger.GetLoggingConfig()

	if loggingConfig.DisableGINLogging || loggingConfig.ProductionMode {
		gin.SetMode(gin.ReleaseMode)
	} else if ginMode := os.Getenv("GIN_MODE"); ginMode != "" {
		gin.SetMode(ginMode)
	}

	log.Info("Attempting to connect to database...")
	db, err := database.NewPostgresConnection(cfg.Database)
	if err != nil {
		log.Fatal(fmt.Sprintf("Failed to connect to database: %v", err))
	}
	log.Info("Successfully connected to database.")

	log.Info("Attempting to run database migrations...")
	if err := database.MigrateDB(db); err != nil {
		log.Fatal(fmt.Sprintf("Failed to migrate database: %v", err))
	}
	log.Info("Database migrations completed successfully.")

	router := gin.Default()

	routes.SetupRoutes(router, db, cfg)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	serverAddr := fmt.Sprintf(":%s", port)
	log.Info("Server starting on " + serverAddr)
	if err := router.Run(serverAddr); err != nil {
		log.Fatal(fmt.Sprintf("Failed to start server: %v", err))
	}
}

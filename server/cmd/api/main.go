package main

import (
	"fmt"
	"os"

	"github.com/fws/backend/config"
	"github.com/fws/backend/internal/api/routes"
	"github.com/fws/backend/internal/database"
	"github.com/fws/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {

	log := logger.NewLogger()

	if err := godotenv.Load(); err != nil {
		log.Warning("No .env file found, using environment variables")
	}

	log.Info("Loading configuration...")
	cfg := config.LoadConfig()

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

	env := os.Getenv("ENV")
	if env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

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

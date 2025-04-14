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

	env := os.Getenv("ENV")
	if env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	cfg := config.LoadConfig()

	db, err := database.NewPostgresConnection(cfg.Database)
	if err != nil {
		log.Fatal("Failed to connect to database: " + err.Error())
	}

	if err := database.MigrateDB(db); err != nil {
		log.Fatal("Failed to migrate database: " + err.Error())
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
		log.Fatal("Failed to start server: " + err.Error())
	}
}

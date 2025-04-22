package database

import (
	"fmt"

	"github.com/fws/backend/config"
	applogger "github.com/fws/backend/pkg/logger"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// NewPostgresConnection creates a new connection to a PostgreSQL database
func NewPostgresConnection(cfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	// Get logging configuration
	loggingConfig := applogger.GetLoggingConfig()

	// Determine the appropriate log level based on configuration
	logLevel := gormlogger.Info
	if loggingConfig.DisableGORMLogging {
		logLevel = gormlogger.Silent // Disable GORM logging completely
	} else if loggingConfig.ProductionMode {
		logLevel = gormlogger.Error // Only log errors in production
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, err
	}

	return db, nil
}

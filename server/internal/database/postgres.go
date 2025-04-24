package database

import (
	"fmt"

	"github.com/hotvault/backend/config"
	applogger "github.com/hotvault/backend/pkg/logger"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func NewPostgresConnection(cfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	loggingConfig := applogger.GetLoggingConfig()

	logLevel := gormlogger.Info
	if loggingConfig.DisableGORMLogging {
		logLevel = gormlogger.Silent
	} else if loggingConfig.ProductionMode {
		logLevel = gormlogger.Error
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, err
	}

	return db, nil
}

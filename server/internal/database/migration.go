package database

import (
	"github.com/hotvault/backend/internal/models"
	"gorm.io/gorm"
)

func MigrateDB(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.Wallet{},
		&models.Transaction{},
		&models.ProofSet{},
		&models.Piece{},
	)
}

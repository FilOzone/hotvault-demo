package models

import (
	"time"

	"gorm.io/gorm"
)

type Wallet struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"not null" json:"userId"`
	Address   string         `gorm:"not null" json:"address"`
	Name      string         `json:"name"`
	IsPrimary bool           `gorm:"default:false" json:"isPrimary"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

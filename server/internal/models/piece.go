package models

import (
	"time"

	"gorm.io/gorm"
)

type Piece struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"index;not null" json:"userId"`
	CID            string         `gorm:"uniqueIndex;not null" json:"cid"`
	Filename       string         `gorm:"not null" json:"filename"`
	Size           int64          `json:"size"`
	ServiceName    string         `gorm:"not null" json:"serviceName"`
	ServiceURL     string         `gorm:"not null" json:"serviceUrl"`
	PendingRemoval bool           `gorm:"default:false" json:"pendingRemoval"`
	RemovalDate    *time.Time     `json:"removalDate"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	User           User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

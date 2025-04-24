package models

import (
	"time"

	"gorm.io/gorm"
)

type ProofSet struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	UserID          uint           `gorm:"index;not null" json:"userId"`
	ProofSetID      string         `gorm:"not null" json:"proofSetId"`
	TransactionHash string         `gorm:"not null" json:"transactionHash"`
	ServiceName     string         `gorm:"not null" json:"serviceName"`
	ServiceURL      string         `gorm:"not null" json:"serviceUrl"`
	Pieces          []Piece        `gorm:"foreignKey:ProofSetID" json:"pieces,omitempty"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	User            User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

package models

import (
	"time"

	"gorm.io/gorm"
)

type Transaction struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"not null" json:"userId"`
	TxHash        string         `gorm:"uniqueIndex;not null" json:"txHash"`
	Method        string         `gorm:"not null" json:"method"`
	Status        string         `gorm:"not null" json:"status"`
	Value         string         `json:"value"`
	BlockHash     string         `json:"blockHash"`
	BlockNumber   uint64         `json:"blockNumber"`
	WalletAddress string         `gorm:"not null" json:"walletAddress"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

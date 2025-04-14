package models

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type User struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	WalletAddress string         `gorm:"uniqueIndex;not null" json:"walletAddress"`
	Nonce         string         `gorm:"not null" json:"nonce"`
	Username      string         `json:"username"`
	Email         string         `json:"email"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	Wallets       []Wallet       `gorm:"foreignKey:UserID" json:"wallets,omitempty"`
	Transactions  []Transaction  `gorm:"foreignKey:UserID" json:"transactions,omitempty"`
}

type JWTClaims struct {
	UserID        uint   `json:"userId"`
	WalletAddress string `json:"walletAddress"`
	jwt.RegisteredClaims
}

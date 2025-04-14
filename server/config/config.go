package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Ethereum EthereumConfig
}

type ServerConfig struct {
	Port string
	Env  string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

type EthereumConfig struct {
	RPCURL          string
	ChainID         int64
	ContractAddress string
}

func LoadConfig() *Config {
	expirationStr := os.Getenv("JWT_EXPIRATION")
	expiration, err := time.ParseDuration(expirationStr)
	if err != nil {
		expiration = 24 * time.Hour
	}

	chainID, err := strconv.ParseInt(os.Getenv("ETH_CHAIN_ID"), 10, 64)
	if err != nil {
		chainID = 1
	}

	return &Config{
		Server: ServerConfig{
			Port: os.Getenv("PORT"),
			Env:  os.Getenv("ENV"),
		},
		Database: DatabaseConfig{
			Host:     os.Getenv("DB_HOST"),
			Port:     os.Getenv("DB_PORT"),
			User:     os.Getenv("DB_USER"),
			Password: os.Getenv("DB_PASSWORD"),
			DBName:   os.Getenv("DB_NAME"),
			SSLMode:  os.Getenv("DB_SSLMODE"),
		},
		JWT: JWTConfig{
			Secret:     os.Getenv("JWT_SECRET"),
			Expiration: expiration,
		},
		Ethereum: EthereumConfig{
			RPCURL:          os.Getenv("ETH_RPC_URL"),
			ChainID:         chainID,
			ContractAddress: os.Getenv("CONTRACT_ADDRESS"),
		},
	}
}

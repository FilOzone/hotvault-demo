package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server       ServerConfig
	Database     DatabaseConfig
	JWT          JWTConfig
	Ethereum     EthereumConfig
	PdptoolPath  string
	ServiceName  string
	ServiceURL   string
	RecordKeeper string
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

// LoadConfig loads configuration from environment variables.
// It returns a pointer to the Config struct.
func LoadConfig() *Config {
	expirationStr := os.Getenv("JWT_EXPIRATION")
	expiration, err := time.ParseDuration(expirationStr)
	if err != nil {
		expiration = 24 * time.Hour // Default expiration if parsing fails or env var is missing
	}

	chainIDStr := os.Getenv("CHAIN_ID")
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		chainID = 1 // Default Chain ID if parsing fails or env var is missing
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
			SSLMode:  os.Getenv("DB_SSL_MODE"),
		},
		JWT: JWTConfig{
			Secret:     os.Getenv("JWT_SECRET"),
			Expiration: expiration,
		},
		Ethereum: EthereumConfig{
			RPCURL:          os.Getenv("RPC_URL"),
			ChainID:         chainID,
			ContractAddress: os.Getenv("CONTRACT_ADDRESS"),
		},
		PdptoolPath:  os.Getenv("PDPTOOL_PATH"),
		ServiceName:  os.Getenv("SERVICE_NAME"),
		ServiceURL:   os.Getenv("SERVICE_URL"),
		RecordKeeper: os.Getenv("RECORD_KEEPER"),
	}
}

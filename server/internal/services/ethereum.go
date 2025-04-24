package services

import (
	"errors"
	"strconv"
	"strings"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/hotvault/backend/config"
	"github.com/hotvault/backend/pkg/logger"
)

type EthereumService struct {
	config config.EthereumConfig
	client *ethclient.Client
	logger logger.Logger
}

func NewEthereumService(config config.EthereumConfig) *EthereumService {
	logger := logger.NewLogger()
	client, err := ethclient.Dial(config.RPCURL)
	if err != nil {
		logger.Error("Failed to connect to Ethereum client: " + err.Error())
		return nil
	}

	return &EthereumService{
		config: config,
		client: client,
		logger: logger,
	}
}

func (s *EthereumService) VerifySignature(address, message, signature string) (bool, error) {
	prefix := "\x19Ethereum Signed Message:\n"
	prefixedMessage := prefix + strconv.Itoa(len(message)) + message

	messageHash := crypto.Keccak256Hash([]byte(prefixedMessage))

	signatureBytes, err := hexutil.Decode(signature)
	if err != nil {
		return false, errors.New("invalid signature format")
	}

	if signatureBytes[64] > 1 {
		signatureBytes[64] -= 27
	}

	publicKeyBytes, err := crypto.Ecrecover(messageHash.Bytes(), signatureBytes)
	if err != nil {
		return false, errors.New("failed to recover public key")
	}
	publicKey, err := crypto.UnmarshalPubkey(publicKeyBytes)
	if err != nil {
		return false, errors.New("failed to unmarshal public key")
	}

	recoveredAddress := crypto.PubkeyToAddress(*publicKey).Hex()

	return strings.EqualFold(recoveredAddress, address), nil
}

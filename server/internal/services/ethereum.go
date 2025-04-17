package services

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/fws/backend/config"
	"github.com/fws/backend/pkg/logger"
)

// EthereumService handles interactions with Ethereum blockchain
type EthereumService struct {
	config config.EthereumConfig
	client *ethclient.Client
	logger logger.Logger
	abi    abi.ABI
}

// NewEthereumService creates a new Ethereum service
func NewEthereumService(config config.EthereumConfig) *EthereumService {
	logger := logger.NewLogger()
	client, err := ethclient.Dial(config.RPCURL)
	if err != nil {
		logger.Error("Failed to connect to Ethereum client: " + err.Error())
		return nil
	}

	// Parse contract ABI - this should be loaded from a file or environment variable
	// For now, we'll use a simple ERC20 ABI as an example
	contractABI := `[{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"}]`
	parsedABI, err := abi.JSON(strings.NewReader(contractABI))
	if err != nil {
		logger.Error("Failed to parse contract ABI: " + err.Error())
		return nil
	}

	return &EthereumService{
		config: config,
		client: client,
		logger: logger,
		abi:    parsedABI,
	}
}

func (s *EthereumService) VerifySignature(address, nonce, signature string) (bool, error) {
	message := fmt.Sprintf("Sign this message to authenticate: %s", nonce)
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

func (s *EthereumService) GetTokenBalance(walletAddress string) (string, string, error) {
	data, err := s.abi.Pack("balanceOf", common.HexToAddress(walletAddress))
	if err != nil {
		return "", "", errors.New("failed to pack ABI call: " + err.Error())
	}

	contractAddr := common.HexToAddress(s.config.ContractAddress)
	msg := ethereum.CallMsg{
		To:   &contractAddr,
		Data: data,
	}

	result, err := s.client.CallContract(context.Background(), msg, nil)
	if err != nil {
		return "", "", errors.New("failed to call contract: " + err.Error())
	}

	var balance *big.Int
	err = s.abi.UnpackIntoInterface(&balance, "balanceOf", result)
	if err != nil {
		return "", "", errors.New("failed to unpack result: " + err.Error())
	}

	symbolData, err := s.abi.Pack("symbol")
	if err != nil {
		return balance.String(), "", errors.New("failed to pack symbol call: " + err.Error())
	}

	contractAddr = common.HexToAddress(s.config.ContractAddress)
	symbolMsg := ethereum.CallMsg{
		To:   &contractAddr,
		Data: symbolData,
	}

	symbolResult, err := s.client.CallContract(context.Background(), symbolMsg, nil)
	if err != nil {
		return balance.String(), "", errors.New("failed to call contract for symbol: " + err.Error())
	}

	var symbol string
	err = s.abi.UnpackIntoInterface(&symbol, "symbol", symbolResult)
	if err != nil {
		return balance.String(), "", errors.New("failed to unpack symbol: " + err.Error())
	}

	return balance.String(), symbol, nil
}

func (s *EthereumService) InteractWithContract(
	from, method string,
	params []interface{},
	value string,
	gasLimit uint64,
	gasPrice string,
	signature string,
) (string, error) {
	data, err := s.abi.Pack(method, params...)
	if err != nil {
		return "", errors.New("failed to pack method call: " + err.Error())
	}

	nonce, err := s.client.PendingNonceAt(context.Background(), common.HexToAddress(from))
	if err != nil {
		return "", errors.New("failed to get nonce: " + err.Error())
	}

	valueInt := big.NewInt(0)
	if value != "" {
		var success bool
		valueInt, success = valueInt.SetString(value, 10)
		if !success || !valueInt.IsInt64() {
			return "", errors.New("invalid value")
		}
	}

	gasPriceBig := big.NewInt(0)
	if gasPrice != "" {
		var success bool
		gasPriceBig, success = gasPriceBig.SetString(gasPrice, 10)
		if !success || !gasPriceBig.IsInt64() {
			return "", errors.New("invalid gas price")
		}
	} else {
		gasPriceBig, err = s.client.SuggestGasPrice(context.Background())
		if err != nil {
			return "", errors.New("failed to suggest gas price: " + err.Error())
		}
	}

	// Create transaction
	tx := types.NewTransaction(
		nonce,
		common.HexToAddress(s.config.ContractAddress),
		valueInt,
		gasLimit,
		gasPriceBig,
		data,
	)

	chainID := big.NewInt(s.config.ChainID)

	privateKey, err := getPrivateKeyFromSignature(signature)
	if err != nil {
		return "", errors.New("failed to get private key: " + err.Error())
	}

	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
	if err != nil {
		return "", errors.New("failed to sign transaction: " + err.Error())
	}

	err = s.client.SendTransaction(context.Background(), signedTx)
	if err != nil {
		return "", errors.New("failed to send transaction: " + err.Error())
	}

	return signedTx.Hash().Hex(), nil
}

func getPrivateKeyFromSignature(signature string) (*ecdsa.PrivateKey, error) {
	privateKey, err := crypto.GenerateKey()
	if err != nil {
		return nil, err
	}

	return privateKey, nil
}

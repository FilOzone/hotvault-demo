# Hot Vault Backend

A scalable Go backend for a DApp with MetaMask integration and smart contract invocations.

## Features

- RESTful API with Gin framework
- PostgreSQL database with GORM ORM
- MetaMask authentication
- Ethereum smart contract interactions
- JWT authentication

## Requirements

- Go 1.21 or later
- PostgreSQL
- Ethereum node access (Infura, Alchemy, etc.)

## Project Structure

```
.
├── cmd
│   └── api             # Application entrypoint
├── config              # Configuration
├── internal
│   ├── api             # API implementation
│   │   ├── handlers    # Request handlers
│   │   ├── middleware  # HTTP middleware
│   │   └── routes      # Route definitions
│   ├── database        # Database connection
│   ├── models          # Data models
│   ├── repositories    # Data access layer
│   ├── services        # Business logic
│   └── utils           # Utility functions
└── pkg
    ├── ethereum        # Ethereum utilities
    └── logger          # Logging utilities
```

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and update the values
3. Start PostgreSQL:

```bash
make postgres-start
```

4. Run the application:

```bash
go run cmd/api/main.go
```

## API Documentation

This is a minimal starting point with only the essential endpoints:

- Health check: `GET /api/v1/health`
- Authentication:
  - Generate nonce: `POST /api/v1/auth/nonce`
  - Verify signature: `POST /api/v1/auth/verify`

More endpoints can be added as needed for your specific use case.

## Authentication Flow

1. Client requests a nonce for a specific wallet address (`/api/v1/auth/nonce`)
2. Client signs the nonce using MetaMask
3. Client sends the signature to verify (`/api/v1/auth/verify`)
4. Server verifies the signature and issues a JWT token
5. JWT token is used for subsequent authenticated requests

## Smart Contract Interaction

The backend includes the infrastructure for interacting with Ethereum smart contracts. You can extend it by:

1. Updating the contract ABI in `internal/services/ethereum.go`
2. Adding methods to the `EthereumService` to interact with your specific contracts
3. Creating handlers to expose the functionality via the API

## Development

### Adding a New API Endpoint

1. Create a new handler function in the appropriate file in `internal/api/handlers/`
2. Add the route in `internal/api/routes/routes.go`
3. Create any necessary models in `internal/models/`

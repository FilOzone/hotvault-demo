# FWS Demo Application

A full-stack decentralized application (DApp) demonstrating Filecoin Web Services (FWS) integration for data storage and verification. This application showcases how to use FWS's Proof of Data Possession (PDP) tool for secure data management.

## Key Features

### Data Management & Verification
- **File Upload System**
  - Support for large file uploads with progress tracking
  - Automatic file chunking for efficient storage
  - File metadata management and tracking
  - Support for multiple file formats

- **PDP Integration**
  - Generate proof sets for uploaded files
  - Verify data possession using PDP tool
  - Track proof generation and verification status
  - Manage proof expiration and renewal

- **Storage Management**
  - Track storage usage and limits
  - Monitor file status and health
  - Manage storage costs and billing
  - Handle file retrieval and downloads

### Smart Contract Integration
- **Payment Management**
  - Support for WFIL and USDC tokens
  - Automated billing and payments
  - Transaction history tracking
  - Balance management

- **Record Keeping**
  - On-chain proof registration
  - Storage deal tracking
  - Payment verification
  - Event logging and monitoring

## Project Structure

```
.
├── server/                 # Go backend server
│   ├── cmd/               # Application entrypoints
│   ├── config/            # Configuration files
│   ├── internal/          # Core implementation
│   │   ├── pdp/          # PDP tool integration
│   │   ├── storage/      # Storage management
│   │   └── blockchain/   # Smart contract interaction
│   └── pkg/              # Shared packages
└── client/               # Next.js frontend
    ├── src/              # Source code
    │   ├── components/   # React components
    │   ├── pages/        # Next.js pages
    │   └── hooks/        # Custom React hooks
    └── public/           # Static assets
```

## Technical Implementation

### Server (Backend)

#### PDP Tool Integration
```bash
# Example PDP proof generation
./pdptool create-proof-set \
  --service-url https://yablu.net \
  --service-name pdp-service \
  --recordkeeper 0x6170dE2b09b404776197485F3dc6c968Ef948505
```

Key components:
- File preprocessing for PDP
- Proof set generation and management
- Verification request handling
- Proof status tracking

#### Storage Management
- Chunked file upload handling
- Storage space allocation
- File retrieval system
- Garbage collection

#### Smart Contract Integration
- Record keeper contract interaction
- Payment processing
- Deal management
- Event monitoring

### Client (Frontend)

Built with Next.js 15.3 and modern React practices, featuring:

#### User Interface
- Modern, responsive design using Tailwind CSS
- Dark/light theme support
- Interactive file upload with drag-and-drop
- Real-time progress tracking
- Transaction status notifications

#### Blockchain Integration
- MetaMask wallet connection
- Transaction management
- Balance tracking
- Network switching support

#### File Management
- Multi-file upload support
- Upload progress visualization
- File status tracking
- Proof set management interface

## Setup Instructions

### Server Setup

1. Configure environment:
```bash
cd server
cp .env.example .env
# Configure:
# - Database credentials
# - PDP tool path and settings
# - Blockchain RPC endpoints
```

2. Start the server:
```bash
make postgres-start
go run cmd/api/main.go
```

### Client Setup

1. Configure environment:
```bash
cd client
cp .env.example .env
# Configure:
# - Network settings
# - Contract addresses
# - Token configurations
```

2. Install dependencies and start:
```bash
yarn install
yarn dev
```

## API Documentation

### Storage Endpoints
- `POST /api/v1/storage/upload` - Initiate file upload
- `POST /api/v1/storage/generate-proof` - Generate PDP proof
- `GET /api/v1/storage/verify-proof` - Verify PDP proof
- `GET /api/v1/storage/status/:fileId` - Check file status

### Blockchain Endpoints
- `POST /api/v1/blockchain/register-proof` - Register proof on-chain
- `GET /api/v1/blockchain/deal/:dealId` - Get deal information

Full API documentation available at `/swagger/index.html` when running the server.

## Development Workflow

1. **File Upload Process**
   - Client chunks and uploads file
   - Server processes and stores file
   - PDP proof generation initiated
   - Proof registered on-chain

2. **Verification Process**
   - Client requests verification
   - Server retrieves proof set
   - PDP tool verifies data
   - Results recorded on-chain


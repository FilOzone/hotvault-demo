# Hot Vault

## Prerequisites

Before setting up Hot Vault, ensure you have the following installed and configured:

### Required Software

- Docker Desktop
- Go 1.21 or later
- Node.js 18.x or later
- npm 9.x or later
- MetaMask browser extension
- PDP Tool (must be installed and configured)

### Required Tokens

- USDFC tokens in your MetaMask wallet for Filecoin Calibration Net
  - Contract Address: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`

## Setup Guide

**Important:** The server and client applications must be run simultaneously in separate terminal instances.

1. **Clone the Repository**

   ```bash
   git clone https://github.com/FilOzone/fws-demo-app.git
   cd fws-demo-app
   ```

2. **Server Setup**

   ```bash
   # Navigate to server directory
   cd server

   # Install Go dependencies
   go mod tidy
   ```

   Create a `.env` file in the server directory:

   ```env
   PORT=8080
   ENV=development
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=fws_db
   DB_SSL_MODE=disable
   JWT_SECRET=fws_secret_key_change_in_production
   JWT_EXPIRATION=24h
   PDPTOOL_PATH=/absolute/path/to/pdptool  # Update this with your pdptool path
   SERVICE_NAME=pdp-service-name
   SERVICE_URL=https://yablu.net
   RECORD_KEEPER=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1
   ```

   Start the database and server:

   ```bash
   # Start PostgreSQL in Docker
   make postgres-start

   # Wait for about 10 seconds for PostgreSQL to fully start

   # Start the server
   make run
   ```

3. **Client Setup**

   ```bash
   # Open a new terminal
   cd client

   # Install dependencies
   npm install --legacy-peer-deps
   ```

   Create a `.env.local` file in the client directory:

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
   NEXT_PUBLIC_USDFC_TOKEN_ADDRESS=0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
   NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS=0x0E690D3e60B0576D01352AB03b258115eb84A047
   NEXT_PUBLIC_PDP_SERVICE_ADDRESS=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1
   ```

   Start the frontend:

   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000) in your browser**

For additional help or to report issues, please open a GitHub issue.

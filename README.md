# Hot Vault

This project demonstrates a prototype for a data storage drive application that leverages Filecoin’s verifiable storage, powered by Proof of Data Possession (PDP), payable with FIL-backed Stablecoin.

More details on PDP [here]([url](https://github.com/FilOzone/pdp)).

## Prerequisites

Before setting up Hot Vault, ensure you have the following installed and configured:

### Required Software

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Go 1.21 or later](https://golang.org/dl/)
- [Node.js 18.x or later](https://nodejs.org/)
- [npm 9.x or later](https://www.npmjs.com/get-npm)
- [MetaMask browser extension](https://metamask.io/download.html)
- [PDP Tool](https://github.com/filecoin-project/curio/tree/feat/pdp) - Must be installed and configured

### Browser Requirements

- **Use Google Chrome** (we are working on supporting more browsers in the near future)
- **Disable all wallet extensions except MetaMask** (other wallets may cause conflicts)

### Required Tokens

- USDFC tokens in your MetaMask wallet for Filecoin Calibration Net
  - Contract Address: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`

## Setup Guide

**Important:** The server and client applications must be run simultaneously in separate terminal instances.

1. **Clone the Repository**

   ```bash
   git clone https://github.com/FilOzone/hotvault-demo.git
   cd hotvault-demo
   ```

2. **Server Setup**

   ```bash
   # Navigate to server directory
   cd server

   # Install Go dependencies
   go mod tidy
   ```

   Create a `.env` file in the server directory:

   ```bash
   # Create the .env file
   touch .env
   ```

   Add the following content to the `.env` file (note that several values are specific to Calibnet):

   ```env
   PORT=8080
   ENV=development
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=fws_db
   DB_SSL_MODE=disable
   JWT_SECRET=secret_key
   JWT_EXPIRATION=24h
   PDPTOOL_PATH=/absolute/path/to/pdptool  # Update this with your pdptool path

   # The following values are specific to Calibnet PDP Service Provider
   SERVICE_NAME=pdp-service-name           # Service Should be registered in the PDP Tool with the provider
   SERVICE_URL=https://yablu.net           # Service URL where the service is registered
   RECORD_KEEPER=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1  # Calibnet-specific PDP service provider Address
   ```

   Start the database and server:

   ```bash
   # Start PostgreSQL in Docker
   make postgres-start

   # Wait for about 10 seconds for PostgreSQL to fully start

   # Start the server
   make run
   ```

   **Note:** This will start a long-running process. Leave this terminal window open and running.

3. **Client Setup**

   ```bash
   # Open a new terminal window
   # Navigate back to the project root directory
   cd /path/to/fws-demo-app

   # Then navigate to client directory
   cd client

   # Install dependencies
   npm install --legacy-peer-deps
   ```

   Create a `.env.local` file in the client directory:

   ```bash
   # Create the .env.local file
   touch .env.local
   ```

   Add the following content to the `.env.local` file:

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080

   # The following addresses are specific to Filecoin Calibration Network (Calibnet)
   # For mainnet addresses, please refer to the official documentation
   NEXT_PUBLIC_USDFC_TOKEN_ADDRESS=0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
   NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS=0x0E690D3e60B0576D01352AB03b258115eb84A047
   NEXT_PUBLIC_PDP_SERVICE_ADDRESS=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1
   ```

   Start the frontend:

   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000) in Google Chrome**

   Remember to ensure that:

   - You are using Google Chrome
   - Only the MetaMask extension is enabled (disable other wallet extensions)
   - Your MetaMask is connected to Filecoin Calibration Network
   - You have minimum 10 USDFC and tFIL tokens in your wallet

## Troubleshooting

- If you encounter issues with MetaMask, try refreshing the page or reconnecting your wallet
- Ensure your PDP Tool is properly configured and accessible at the path specified in your `.env` file
- Check that your MetaMask is connected to the correct network (Filecoin Calibration)

For additional help or to report issues, please open a GitHub issue.

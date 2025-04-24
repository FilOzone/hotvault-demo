# Hot Vault

## Prerequisites

- Docker must be pre-configured and running
- Go installed
- Node.js and npm installed

**Important:** The server and client applications must be run simultaneously in separate terminal instances.

## Setup Steps

1. **Server Setup**

   ```bash
   cd server
   go mod tidy
   ```

   Create .env file with these settings:

   ```
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
   PDPTOOL_PATH=/path/to/pdptool
   SERVICE_NAME=pdp-service-name
   SERVICE_URL=https://yablu.net
   RECORD_KEEPER=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1
   ```

   Start PostgreSQL:

   ```bash
   make postgres-start
   ```

   Start the server:

   ```bash
   make run
   ```

2. **Client Setup**

   ```bash
   cd client
   npm install --legacy-peer-deps
   ```

   Create .env file with these settings:

   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
   NEXT_PUBLIC_USDFC_TOKEN_ADDRESS=0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
   NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS=0x0E690D3e60B0576D01352AB03b258115eb84A047
   NEXT_PUBLIC_PDP_SERVICE_ADDRESS=0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1
   ```

   Start the frontend:

   ```bash
   npm run dev
   ```

   **Note:** Both the server and client should be running simultaneously in separate terminal instances.

3. **Access the Application**

   - Open your browser to http://localhost:3000

4. **Wallet Requirements**
   - Ensure your connected wallet has USDFC tokens for transactions
   - USDFC contract address: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`

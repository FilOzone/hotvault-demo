// API endpoints
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

// Contract addresses (Calibnet)
export const USDFC_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_USDFC_TOKEN_ADDRESS ||
  "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0";
export const PAYMENT_PROXY_ADDRESS =
  process.env.NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS ||
  "0x0E690D3e60B0576D01352AB03b258115eb84A047";
export const PDP_SERVICE_ADDRESS =
  process.env.NEXT_PUBLIC_PDP_SERVICE_ADDRESS ||
  "0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1";

// Payment constants
export const MINIMUM_USDFC_BALANCE = "10"; // Minimum required balance in USDFC
export const PROOF_SET_FEE = "0.1";

// API endpoints
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

// Contract addresses (Calibnet)
export const USDFC_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_USDFC_TOKEN_ADDRESS ||
  "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0";
export const PAYMENT_PROXY_ADDRESS =
  process.env.NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS ||
  "0xE7E33b2b2c9B8e802bdF30D67B40E3797431EC7b";
export const PDP_SERVICE_ADDRESS =
  process.env.NEXT_PUBLIC_PDP_SERVICE_ADDRESS ||
  "0x209D7289B412FCeC2d934a8023B354862A4E9194";

// Payment constants
export const MINIMUM_USDFC_BALANCE = "10"; // Minimum required balance in USDFC
export const PROOF_SET_FEE = "0.1";

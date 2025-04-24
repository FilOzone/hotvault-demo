export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8008";

export const USDFC_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_USDFC_TOKEN_ADDRESS ||
  "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0";
export const PAYMENT_PROXY_ADDRESS =
  process.env.NEXT_PUBLIC_PAYMENT_PROXY_ADDRESS ||
  "0x0E690D3e60B0576D01352AB03b258115eb84A047";
export const PDP_SERVICE_ADDRESS =
  process.env.NEXT_PUBLIC_PDP_SERVICE_ADDRESS ||
  "0xdbE4bEF3F313dAC36257b0621e4a3BC8Dc9679a1";

export const MINIMUM_USDFC_BALANCE = "10";
export const PROOF_SET_FEE = "0.1";
export const STORAGE_RATE_PER_GB = 2; // 2 USDFC per GB per month
export const LOCK_PERIOD_DAYS = 10; // 10 days lock period

export const statusColors = {
  uploading: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
} as const;

export const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    uploading: "Uploading...",
    processing: "Processing...",
    complete: "Upload Complete",
    error: "Upload Failed",
    cancelled: "Upload Cancelled",
  };
  return statusMap[status] || status;
};

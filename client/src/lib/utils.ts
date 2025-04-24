import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const getFilePreviewType = (
  filename: string
):
  | "image"
  | "document"
  | "spreadsheet"
  | "code"
  | "archive"
  | "video"
  | "audio"
  | "generic" => {
  const extension = filename.split(".").pop()?.toLowerCase() || "";

  // Images
  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(extension)) {
    return "image";
  }

  // Documents
  if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(extension)) {
    return "document";
  }

  // Spreadsheets
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return "spreadsheet";
  }

  // Code files
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "java",
      "py",
      "c",
      "cpp",
      "rb",
      "php",
    ].includes(extension)
  ) {
    return "code";
  }

  // Archives
  if (["zip", "rar", "tar", "gz", "7z"].includes(extension)) {
    return "archive";
  }

  // Video files
  if (["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm"].includes(extension)) {
    return "video";
  }

  // Audio files
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(extension)) {
    return "audio";
  }

  // Default/generic
  return "generic";
};

/**
 * Gets the appropriate block explorer URL for a transaction hash based on the current network
 * @param txHash - Transaction hash
 * @returns Full URL to the transaction on the block explorer
 */
export function getExplorerUrl(txHash: string): string {
  // Get network from environment or default to Calibration
  const network = process.env.NEXT_PUBLIC_NETWORK || "calibration";

  switch (network.toLowerCase()) {
    case "mainnet":
      return `https://filfox.info/en/message/${txHash}`;
    case "calibration":
    default:
      return `https://calibration.filfox.info/en/message/${txHash}`;
  }
}

/**
 * Formats a currency amount with configurable decimal places
 * @param amount - Amount as a string or number
 * @param decimals - Number of decimal places (default: 2)
 * @param trimZeros - Whether to trim trailing zeros (default: true)
 * @returns Formatted string
 */
export const formatCurrency = (
  amount: string | number,
  decimals: number = 2,
  trimZeros: boolean = true
): string => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  // For very large or very small numbers, use scientific notation
  if (
    Math.abs(numAmount) >= 1e15 ||
    (Math.abs(numAmount) > 0 && Math.abs(numAmount) < 0.001)
  ) {
    return numAmount.toExponential(4);
  }

  // Format with the specified number of decimal places
  const formatted = numAmount.toFixed(decimals);

  // Optionally trim trailing zeros after the decimal point
  return trimZeros ? formatted.replace(/\.?0+$/, "") : formatted;
};

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

  if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(extension)) {
    return "image";
  }

  if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(extension)) {
    return "document";
  }

  if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return "spreadsheet";
  }

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
      "go",
      "swift",
      "kotlin",
      "scala",
      "rust",
      "haskell",
      "erlang",
      "elixir",
      "dart",
      "typescript",
      "javascript",
      "ruby",
      "python",
      "csharp",
    ].includes(extension)
  ) {
    return "code";
  }

  if (["zip", "rar", "tar", "gz", "7z"].includes(extension)) {
    return "archive";
  }

  if (["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm"].includes(extension)) {
    return "video";
  }

  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(extension)) {
    return "audio";
  }

  return "generic";
};

/**
 * Gets the appropriate block explorer URL for a transaction hash based on the current network
 * @param txHash - Transaction hash
 * @returns Full URL to the transaction on the block explorer
 */
export function getExplorerUrl(txHash: string): string {
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

  if (
    Math.abs(numAmount) >= 1e15 ||
    (Math.abs(numAmount) > 0 && Math.abs(numAmount) < 0.001)
  ) {
    return numAmount.toExponential(4);
  }

  const formatted = numAmount.toFixed(decimals);

  return trimZeros ? formatted.replace(/\.?0+$/, "") : formatted;
};

/**
 * Formats a currency amount showing full precision with no rounding
 * @param amount - Amount as a string or number
 * @param maxDecimals - Maximum number of decimal places to display (default: 18)
 * @returns Formatted string with full precision
 */
export const formatCurrencyPrecise = (
  amount: string | number,
  maxDecimals: number = 18
): string => {
  const strAmount = typeof amount === "string" ? amount : amount.toString();

  const numAmount = parseFloat(strAmount);

  let formatted = numAmount.toFixed(maxDecimals);

  formatted = formatted.replace(/\.?0+$/, "");

  if (!formatted.includes(".")) {
    formatted = `${formatted}.0`;
  }

  return formatted;
};

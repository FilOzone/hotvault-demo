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
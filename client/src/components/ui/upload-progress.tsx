"use client";

import { UploadProgress as UploadProgressType } from "@/store/upload-store";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./button";

interface UploadProgressProps {
  uploadProgress: UploadProgressType | null;
  onCancel: () => void;
  hasActiveAbortController: boolean; // Keeping this for API compatibility even if unused
}

export const UploadProgress = ({
  uploadProgress,
  onCancel,
}: UploadProgressProps) => {
  if (!uploadProgress) return null;

  // Common status color mapping
  const statusColors = {
    error: "text-red-500 bg-red-50 border-red-200",
    warning: "text-amber-500 bg-amber-50 border-amber-200",
    complete: "text-green-500 bg-green-50 border-green-200",
    uploading: "text-blue-500 bg-blue-50 border-blue-200",
    preparing: "text-indigo-500 bg-indigo-50 border-indigo-200",
    starting: "text-gray-500 bg-gray-50 border-gray-200",
    cancelled: "text-gray-500 bg-gray-50 border-gray-200",
    finalizing: "text-emerald-500 bg-emerald-50 border-emerald-200",
    adding_root: "text-purple-500 bg-purple-50 border-purple-200",
  };

  const statusColor =
    statusColors[uploadProgress.status as keyof typeof statusColors] ||
    statusColors.uploading;

  const getStatusText = () => {
    switch (uploadProgress.status) {
      case "starting":
        return "Starting upload...";
      case "preparing":
        return "Preparing file...";
      case "uploading":
        return "Uploading...";
      case "finalizing":
        return "Finalizing...";
      case "adding_root":
        return "Adding to proof set...";
      case "complete":
        return "Upload complete!";
      case "error":
        return "Upload failed";
      case "warning":
        return "Warning";
      case "cancelled":
        return "Upload cancelled";
      default:
        return uploadProgress.status;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 right-4 z-50 w-80 shadow-lg rounded-lg overflow-hidden"
      >
        <div className={`p-4 ${statusColor}`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                {uploadProgress.isStalled && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>{getStatusText()}</span>
              </div>
              {uploadProgress.message && (
                <div className="text-sm mt-1 opacity-80 line-clamp-2">
                  {uploadProgress.message}
                </div>
              )}
              {uploadProgress.isStalled && (
                <div className="text-amber-600 text-sm mt-1">
                  No updates received for a while.
                </div>
              )}
              {uploadProgress.error && (
                <div className="text-red-500 text-sm mt-1 line-clamp-2">
                  Error: {uploadProgress.error}
                </div>
              )}
              {uploadProgress.filename && (
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {uploadProgress.filename}
                </div>
              )}
              {uploadProgress.serviceProofSetId && (
                <div className="text-xs mt-2 flex items-center">
                  <span className="mr-2">Proof Set ID:</span>
                  <a
                    href={` http://explore-pdp.xyz:5173/proofsets/${uploadProgress.serviceProofSetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline flex items-center"
                  >
                    {uploadProgress.serviceProofSetId}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {uploadProgress.progress !== undefined && (
                <div className="text-sm font-medium">
                  {Math.min(uploadProgress.progress, 100)}%
                </div>
              )}
              {uploadProgress.status !== "complete" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onCancel}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {uploadProgress.progress !== undefined && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
              <div
                className={`h-2.5 rounded-full ${
                  uploadProgress.status === "error"
                    ? "bg-red-500"
                    : uploadProgress.status === "complete"
                    ? "bg-green-500"
                    : uploadProgress.isStalled
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(uploadProgress.progress, 100)}%` }}
              ></div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

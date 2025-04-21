"use client";

import { useUploadStore } from "@/store/upload-store";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

// Define status colors for different upload states
const statusColors = {
  uploading: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  complete: "bg-green-100 text-green-800",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
};

// Convert status to human-readable text
const getStatusText = (status: string): string => {
  switch (status) {
    case "uploading":
      return "Uploading...";
    case "processing":
      return "Processing...";
    case "complete":
      return "Upload Complete";
    case "success":
      return "Upload Successful";
    case "error":
      return "Upload Failed";
    default:
      return "Upload in Progress";
  }
};

export const GlobalUploadProgress = () => {
  const { uploadProgress, clearUploadProgress } = useUploadStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Check authentication status
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem("jwt_token");
      setIsAuthenticated(!!token);
    };

    // Check initially
    checkAuth();

    // Set up event listener for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "jwt_token") {
        checkAuth();
        // If token is removed, clear any ongoing upload progress
        if (!e.newValue) {
          clearUploadProgress();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Custom event listener for logout
    const handleLogout = () => {
      setIsAuthenticated(false);
      clearUploadProgress();
    };
    window.addEventListener("logout", handleLogout);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("logout", handleLogout);
    };
  }, [clearUploadProgress]);

  // Auto-dismiss logic for completed/error states
  useEffect(() => {
    if (!uploadProgress) return;

    // Clear progress if status is complete/error or if backend processing is done
    if (
      uploadProgress.status === "complete" ||
      uploadProgress.status === "error" ||
      uploadProgress.status === "success"
    ) {
      const timer = setTimeout(() => {
        clearUploadProgress();
      }, 5000); // Dismiss after 5 seconds

      return () => clearTimeout(timer);
    }

    // Handle stalled uploads
    if (
      uploadProgress.status === "uploading" ||
      uploadProgress.status === "processing"
    ) {
      const lastUpdate = uploadProgress.lastUpdated;
      const currentTime = Date.now();

      // If no update for 30 seconds, consider it stalled
      if (lastUpdate && currentTime - lastUpdate > 30000) {
        clearUploadProgress();
      }
    }
  }, [uploadProgress, clearUploadProgress]);

  // Add duplicate handling
  useEffect(() => {
    if (uploadProgress?.error?.includes("duplicate key value")) {
      setIsDuplicate(true);
      // Auto-clear after showing duplicate message
      const timer = setTimeout(() => {
        clearUploadProgress();
        setIsDuplicate(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [uploadProgress?.error, clearUploadProgress]);

  // Don't show anything if not authenticated or no upload progress
  if (!isAuthenticated || !uploadProgress) return null;

  const statusColor =
    statusColors[uploadProgress.status as keyof typeof statusColors] ||
    statusColors.uploading;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 right-4 z-50 w-80 shadow-lg rounded-lg overflow-hidden"
      >
        <div
          className={`p-4 ${isDuplicate ? statusColors.warning : statusColor}`}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                {uploadProgress.isStalled && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>
                  {isDuplicate
                    ? "Duplicate File Detected"
                    : getStatusText(uploadProgress.status)}
                </span>
                {(uploadProgress.status === "uploading" ||
                  uploadProgress.status === "processing") && (
                  <Button
                    onClick={clearUploadProgress}
                    variant="ghost"
                    size="sm"
                    className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                  >
                    Cancel
                  </Button>
                )}
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
                    href={`https://calibration.pdp-explorer.eng.filoz.org/proofsets/${uploadProgress.serviceProofSetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline flex items-center"
                  >
                    {uploadProgress.serviceProofSetId}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              )}
              {isDuplicate && (
                <div className="text-amber-600 text-sm mt-1">
                  This file has already been uploaded. Please check your
                  existing files.
                </div>
              )}
            </div>
            {uploadProgress.progress !== undefined && (
              <div className="text-sm font-medium ml-2">
                {uploadProgress.progress}%
              </div>
            )}
          </div>

          {uploadProgress.progress !== undefined && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress.progress || 0}%` }}
                transition={{ duration: 0.3 }}
                className={`h-2.5 rounded-full ${
                  uploadProgress.status === "error"
                    ? "bg-red-500"
                    : uploadProgress.status === "complete"
                    ? "bg-green-500"
                    : uploadProgress.isStalled
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
              />
            </div>
          )}

          {/* Display completed upload info with links */}
          {uploadProgress.status === "complete" && uploadProgress.cid && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <div className="flex flex-col gap-2">
                {uploadProgress.serviceProofSetId && (
                  <a
                    href={`https://calibration.pdp-explorer.eng.filoz.org/proofsets/${uploadProgress.serviceProofSetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm flex items-center justify-between bg-green-100 text-green-800 p-2 rounded hover:bg-green-200 transition-colors"
                  >
                    <span className="flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-2"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                      View Proof Set
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

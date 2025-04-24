"use client";

import { useUploadStore } from "@/store/upload-store";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./button";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";

// Poll interval for checking status (milliseconds)
const STATUS_POLL_INTERVAL = 5000; // 5 seconds

// Define status colors for different upload states
const statusColors = {
  uploading: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  complete: "bg-green-100 text-green-800",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  retry: "bg-amber-100 text-amber-800",
  adding_root: "bg-blue-100 text-blue-800",
  pending: "bg-blue-100 text-blue-800",
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
    case "retry":
      return "Retrying...";
    case "adding_root":
      return "Adding to Chain...";
    case "pending":
      return "Initializing Proof Set...";
    default:
      return "Upload in Progress";
  }
};

// Helper function to get more detailed message based on status and existing message
const getDetailedMessage = (status: string, message?: string): string => {
  if (!message) return "";

  // Special case for "Locating user proof set..."
  if (message.includes("Locating user proof set")) {
    return "Finding or creating a proof set for your file...";
  }

  // If message contains "Adding root to proof set" but doesn't have attempt info
  if (
    message.includes("Adding root to proof set") &&
    !message.includes("attempt")
  ) {
    return "Storing file on the Filecoin network...";
  }

  // If message has "proof set creation is still pending"
  if (
    message.includes("proof set creation is still pending") ||
    message.includes("proof set is being initialized")
  ) {
    return "Waiting for confirmation of your proof set...";
  }

  return message;
};

// Custom event for notifying upload completion
export const UPLOAD_COMPLETED_EVENT = "upload:completed";

export const GlobalUploadProgress = () => {
  const { uploadProgress, clearUploadProgress, setUploadProgress } =
    useUploadStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [hasStalled, setHasStalled] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Polling for status updates when in certain states
  useEffect(() => {
    // Clear any existing poll timer on state change
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!uploadProgress || !uploadProgress.jobId) return;

    // Set up polling for these states
    if (
      uploadProgress.status === "adding_root" ||
      uploadProgress.status === "pending" ||
      (uploadProgress.isStalled &&
        (uploadProgress.message?.includes("proof set") ||
          uploadProgress.message?.includes("Proof set")))
    ) {
      console.log("[GlobalUploadProgress] Starting status polling");

      // Set up regular polling
      pollTimerRef.current = setInterval(() => {
        const token = localStorage.getItem("jwt_token");
        if (!token || !uploadProgress.jobId) return;

        console.log("[GlobalUploadProgress] Polling for status update");

        fetch(`/api/v1/upload/status/${uploadProgress.jobId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => {
            if (!response.ok) {
              // Specifically handle 404 Not Found
              if (response.status === 404) {
                throw new Error(
                  `Upload status not found (Job ID: ${uploadProgress.jobId}). The job may have expired or the server restarted.`
                );
              }
              throw new Error(`Failed to get status (${response.status})`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("[GlobalUploadProgress] Poll response:", data);

            // Only update if there's actual change
            if (
              data &&
              (data.status !== uploadProgress.status ||
                data.message !== uploadProgress.message ||
                data.progress !== uploadProgress.progress)
            ) {
              setUploadProgress({
                ...data,
                lastUpdated: Date.now(),
                isStalled: false,
              });

              if (data.status === "complete" || data.status === "success") {
                // Dispatch event to refresh file list
                window.dispatchEvent(
                  new CustomEvent(UPLOAD_COMPLETED_EVENT, {
                    detail: {
                      cid: data.cid,
                      filename: data.filename,
                      serviceProofSetId: data.serviceProofSetId,
                    },
                  })
                );

                if (pollTimerRef.current) {
                  clearInterval(pollTimerRef.current);
                  pollTimerRef.current = null;
                }
              }
            }
          })
          .catch((error) => {
            console.error("[GlobalUploadProgress] Poll error:", error);
            // Stop polling if the job is not found (404) or on other critical errors
            if (
              error.message.includes("Upload status not found") ||
              error.message.includes("Failed to get status")
            ) {
              setUploadProgress({
                status: "error",
                error: error.message,
                lastUpdated: Date.now(),
                jobId: uploadProgress?.jobId, // Keep jobId if available
                filename: uploadProgress?.filename, // Keep filename if available
              });
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
            }
            // For other errors, we might want to let polling continue or handle differently
          });
      }, STATUS_POLL_INTERVAL);

      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }
  }, [uploadProgress, setUploadProgress]);

  // Auto-dismiss logic for completed/error states and trigger file list refresh
  useEffect(() => {
    if (!uploadProgress) {
      setHasStalled(false);
      return;
    }

    // Immediately clear progress if progress is 100%
    if (uploadProgress.progress === 100 || uploadProgress.progress === 100.0) {
      console.log(
        "[GlobalUploadProgress] Progress reached 100%, forcing immediate dismissal"
      );
      // Dispatch the completion event immediately
      try {
        window.dispatchEvent(
          new CustomEvent(UPLOAD_COMPLETED_EVENT, {
            detail: {
              cid: uploadProgress.cid,
              filename: uploadProgress.filename,
              serviceProofSetId: uploadProgress.serviceProofSetId,
            },
          })
        );
      } catch (err) {
        console.error("[GlobalUploadProgress] Error dispatching event:", err);
      }

      // Force clear immediately - no delay
      clearUploadProgress();
      setHasStalled(false);
      return;
    }

    // If upload is complete/successful, dispatch event to refresh file list
    if (
      uploadProgress.status === "complete" ||
      uploadProgress.status === "success"
    ) {
      console.log(
        "[GlobalUploadProgress] Upload complete, dispatching event immediately"
      );

      // Dispatch the event IMMEDIATELY to refresh the file list
      try {
        window.dispatchEvent(
          new CustomEvent(UPLOAD_COMPLETED_EVENT, {
            detail: {
              cid: uploadProgress.cid,
              filename: uploadProgress.filename,
              serviceProofSetId: uploadProgress.serviceProofSetId,
            },
          })
        );
      } catch (err) {
        console.error("[GlobalUploadProgress] Error dispatching event:", err);
      }

      // Set timer to clear the progress notification - use a SHORTER timeout
      const timer = setTimeout(() => {
        console.log("[GlobalUploadProgress] Clearing upload progress");
        clearUploadProgress();
        setHasStalled(false);
      }, 500); // Reduced from 1500 to 500 (0.5 seconds) - much faster dismissal

      return () => clearTimeout(timer);
    }

    // Handle error state
    if (uploadProgress.status === "error") {
      const timer = setTimeout(() => {
        console.log("[GlobalUploadProgress] Clearing error state");
        clearUploadProgress();
        setHasStalled(false);
      }, 5000); // Dismiss after 5 seconds

      return () => clearTimeout(timer);
    }

    // Handle stalled uploads
    if (
      uploadProgress.status === "uploading" ||
      uploadProgress.status === "processing" ||
      uploadProgress.status === "adding_root" ||
      uploadProgress.status === "retry" ||
      uploadProgress.status === "pending"
    ) {
      const lastUpdate = uploadProgress.lastUpdated;
      const currentTime = Date.now();

      // If no update for 30 seconds, consider it stalled
      if (lastUpdate && currentTime - lastUpdate > 30000) {
        setHasStalled(true);
      }
    }
  }, [uploadProgress, clearUploadProgress, setHasStalled]);

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

  // Handle manual refresh of stalled uploads
  const handleManualRetry = () => {
    if (!uploadProgress) return;

    // Only allow retry for certain states
    if (
      uploadProgress.status === "adding_root" ||
      uploadProgress.status === "processing" ||
      uploadProgress.status === "retry" ||
      uploadProgress.status === "pending" ||
      uploadProgress.isStalled
    ) {
      // Set the stalled flag to false
      setHasStalled(false);

      // Force a status update with new timestamp to reset the stalled timer
      setUploadProgress({
        ...uploadProgress,
        lastUpdated: Date.now(),
        message: uploadProgress.message?.includes("attempt")
          ? uploadProgress.message
          : `${uploadProgress.message} (manually refreshed)`,
        isStalled: false,
      });

      toast.info("Refreshing upload status...");

      // If we have a jobId, try to refresh the status from server
      if (uploadProgress.jobId) {
        fetch(`/api/v1/upload/status/${uploadProgress.jobId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("jwt_token")}`,
          },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Failed to refresh status");
            }
            return response.json();
          })
          .then((data) => {
            console.log(
              "[GlobalUploadProgress] Manual refresh response:",
              data
            );
            if (data) {
              // If the status shows the same state for too long, we might need to clear and retry
              if (
                data.status === uploadProgress.status &&
                data.message === uploadProgress.message &&
                uploadProgress.isStalled
              ) {
                toast.warning(
                  "Process appears to be stuck. You may want to cancel and try again."
                );
              } else {
                setUploadProgress({
                  ...data,
                  lastUpdated: Date.now(),
                  isStalled: false,
                });
                toast.success("Status refreshed");
              }
            }
          })
          .catch((error) => {
            console.error("Error refreshing status:", error);
            toast.error("Failed to refresh status. Please try again.");
          });
      }
    }
  };

  // Don't show anything if not authenticated or no upload progress
  if (!isAuthenticated || !uploadProgress) return null;

  const statusColor =
    statusColors[uploadProgress.status as keyof typeof statusColors] ||
    statusColors.uploading;

  // Determine if we're in a retry state
  const isRetrying = uploadProgress.status === "retry";
  // Determine if we're in a state where manual retry is allowed
  const canManuallyRetry =
    hasStalled &&
    (uploadProgress.status === "adding_root" ||
      uploadProgress.status === "processing" ||
      uploadProgress.status === "retry" ||
      uploadProgress.status === "pending");

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
                {isRetrying && (
                  <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />
                )}
                <span>
                  {isDuplicate
                    ? "Duplicate File Detected"
                    : getStatusText(uploadProgress.status)}
                </span>
              </div>
              {uploadProgress.message && (
                <div className="text-sm mt-1 opacity-80 line-clamp-2">
                  {getDetailedMessage(
                    uploadProgress.status,
                    uploadProgress.message
                  )}
                </div>
              )}
              {uploadProgress.isStalled && (
                <div className="text-amber-600 text-sm mt-1">
                  No updates received for a while.
                </div>
              )}
              {/* Easter egg for when files are being uploaded */}
              {(uploadProgress.status === "uploading" ||
                uploadProgress.status === "processing") &&
                !uploadProgress.isStalled && (
                  <div className="text-gray-500 text-xs mt-1 italic">
                    <a
                      href="https://www.youtube.com/watch?v=OsU0CGZoV8E"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      <span>
                        Watch this important Video while we get your data on
                        Filecoin
                      </span>
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                )}
              {canManuallyRetry && (
                <div className="mt-2">
                  <Button
                    onClick={handleManualRetry}
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center gap-2 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Manual Refresh</span>
                  </Button>
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
              {isDuplicate && (
                <div className="text-amber-600 text-sm mt-1">
                  This file has already been uploaded. Please check your
                  existing files.
                </div>
              )}
            </div>
            {uploadProgress.progress !== undefined && (
              <div className="text-sm font-medium ml-2">
                {Math.min(uploadProgress.progress, 100)}%
              </div>
            )}
          </div>

          {uploadProgress.progress !== undefined && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(uploadProgress.progress || 0, 100)}%`,
                }}
                transition={{ duration: 0.3 }}
                className={`h-2.5 rounded-full ${
                  uploadProgress.status === "error"
                    ? "bg-red-500"
                    : uploadProgress.status === "complete" ||
                      uploadProgress.status === "success"
                    ? "bg-green-500"
                    : uploadProgress.status === "retry"
                    ? "bg-amber-500"
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
                    href={` http://explore-pdp.xyz:5173/proofsets/${uploadProgress.serviceProofSetId}`}
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

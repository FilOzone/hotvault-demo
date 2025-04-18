"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Download,
  Trash2,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Piece {
  id: number;
  cid: string;
  filename: string;
  size: number;
  serviceName: string;
  serviceUrl: string;
  createdAt: string;
  updatedAt: string;
  pendingRemoval?: boolean;
  removalDate?: string;
  proofSetId?: string;
  rootId?: string;
}

interface FilesTabProps {
  isLoading: boolean;
}

// Define an error type that includes options
interface DownloadError extends Error {
  options?: string[];
}

// Add animation variants for reuse
const fadeInUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15 } },
};

const tableRowVariants = {
  hidden: { opacity: 0, x: -5 },
  visible: (custom: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: custom * 0.05, duration: 0.2 },
  }),
};

export const FilesTab: React.FC<FilesTabProps> = ({
  isLoading: initialLoading,
}) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [authError, setAuthError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    status: string;
    progress?: number;
    message?: string;
    cid?: string;
    error?: string;
    lastUpdated?: number; // timestamp of last update
    isStalled?: boolean;
    filename?: string; // store original filename for polling
    jobId?: string; // store job ID for polling
    proofSetId?: string; // store proof set ID
  } | null>(null);
  // Add state for tracking downloads in progress
  const [downloadsInProgress, setDownloadsInProgress] = useState<{
    [cid: string]: boolean;
  }>({});

  // Add new state for proof dialog
  const [isProofDialogOpen, setIsProofDialogOpen] = useState(false);
  const [selectedProof, setSelectedProof] = useState<{
    pieceId: number;
    pieceFilename: string;
    proofSetId: string;
    cid: string;
    rootId?: string; // Add rootId property
  } | null>(null);

  // Add state to track if proofs are being loaded
  const [loadingProofs, setLoadingProofs] = useState(false);

  // Refs for upload state management
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);

  // Add new state for root removal dialog
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [pieceToRemove, setPieceToRemove] = useState<Piece | null>(null);

  // Clean up all timeouts when component unmounts
  useEffect(() => {
    return () => {
      // Capture current ref values to avoid stale refs in cleanup
      const currentUploadTimeout = uploadTimeoutRef.current;
      const currentPollInterval = pollIntervalRef.current;

      if (currentUploadTimeout) {
        clearTimeout(currentUploadTimeout);
      }
      if (currentPollInterval) {
        clearInterval(currentPollInterval);
      }
    };
  }, []);

  const fetchPieces = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        setAuthError("Authentication required. Please login again.");
        return [];
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/pieces`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        setAuthError("Your session has expired. Please login again.");
        return [];
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch pieces: ${response.statusText}`);
      }

      const data = await response.json();
      setPieces(data);
      return data;
    } catch (error) {
      console.error(
        "[FilesTab.tsx:fetchPieces] ❌ Error fetching pieces:",
        error
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add new function to fetch proofs
  const fetchProofs = async () => {
    try {
      setLoadingProofs(true);
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        setAuthError("Authentication required. Please login again.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/pieces/proofs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        setAuthError("Your session has expired. Please login again.");
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch proofs: ${response.statusText}`);
      }

      const data = await response.json();

      // Update the pieces with proof data
      setPieces((prevPieces) =>
        prevPieces.map((piece) => {
          // Find the matching piece with proof data
          const pieceWithProof = data.find((p: Piece) => p.id === piece.id);
          if (pieceWithProof && pieceWithProof.proofSetId) {
            // Update with proof data
            return {
              ...piece,
              proofSetId: pieceWithProof.proofSetId,
              rootId: pieceWithProof.rootId,
            };
          }
          return piece;
        })
      );

      console.log("[FilesTab.tsx:fetchProofs] ✅ Proofs loaded:", data);
    } catch (error) {
      console.error(
        "[FilesTab.tsx:fetchProofs] ❌ Error fetching proofs:",
        error
      );
      toast.error(
        `Failed to fetch proof data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoadingProofs(false);
    }
  };

  // Add this useEffect to check token on component mount and set up periodic token check
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        setAuthError("Authentication required. Please login again.");
      } else {
        // Only clear auth error if it was previously set
        if (authError) setAuthError(null);
      }
    };

    // Check on mount
    checkToken();

    // Check token periodically
    const tokenInterval = setInterval(checkToken, 60000); // Check every minute

    return () => {
      clearInterval(tokenInterval);
    };
  }, [authError]);

  useEffect(() => {
    // Create a flag to track if the component is still mounted
    let isMounted = true;

    const loadData = async () => {
      try {
        if (isMounted) {
          const data = await fetchPieces();
          // Only proceed if we're still mounted and have data
          if (isMounted && data) {
            await fetchProofs();
          }
        }
      } catch (error: unknown) {
        if (isMounted && !authError) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          toast.error(`Error loading files: ${errorMessage}`);
        }
      }
    };

    loadData();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [authError, fetchPieces]);

  // Poll for upload status updates
  const startPollingUploadStatus = useCallback(
    (jobId: string, initialDelay = 0) => {
      // Clear any existing poll interval
      const currentPollInterval = pollIntervalRef.current;
      if (currentPollInterval) {
        clearInterval(currentPollInterval);
        pollIntervalRef.current = null;
      }

      // Initial delay before starting to poll (useful for letting the server start processing)
      setTimeout(() => {
        // Function to poll for status
        const pollStatus = async () => {
          try {
            const token = localStorage.getItem("jwt_token");
            if (!token) {
              throw new Error("Authentication required");
            }

            const response = await fetch(
              `${API_BASE_URL}/api/v1/upload/status/${jobId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (!response.ok) {
              throw new Error(
                `Failed to get upload status: ${response.statusText}`
              );
            }

            const data = await response.json();
            console.log("[FilesTab.tsx:pollStatus] Got status update:", data);

            // Update the progress state
            setUploadProgress((prev) => ({
              ...data,
              lastUpdated: Date.now(),
              isStalled: false,
              // Keep the filename if it wasn't returned
              filename: data.filename || prev?.filename,
            }));

            // If upload is complete or failed, stop polling and handle completion
            if (data.status === "complete" || data.status === "error") {
              const currentInterval = pollIntervalRef.current;
              if (currentInterval) {
                clearInterval(currentInterval);
                pollIntervalRef.current = null;
              }

              if (data.status === "complete") {
                console.log("[FilesTab.tsx:pollStatus] ✅ Upload complete!");

                // Clean up after successful upload
                setSelectedImage(null);
                setPreviewUrl(null);

                // Refresh the pieces list
                fetchPieces();

                // Keep the success message for a few seconds then clear it
                setTimeout(() => {
                  setUploadProgress(null);
                }, 3000);
              }
            }
          } catch (error) {
            console.error(
              "[FilesTab.tsx:pollStatus] Error polling for status:",
              error
            );
            // Don't stop polling on error - the server might be temporarily unavailable
          }
        };

        // Poll immediately once
        pollStatus();

        // Then set up the interval (every 2 seconds)
        pollIntervalRef.current = setInterval(pollStatus, 2000);
      }, initialDelay);
    },
    [fetchPieces]
  );

  // Add a new helper function to determine if we can provide special preview for specific non-image file types
  const getFilePreviewType = (
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
    if (
      ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(extension)
    ) {
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
    if (
      ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm"].includes(extension)
    ) {
      return "video";
    }

    // Audio files
    if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(extension)) {
      return "audio";
    }

    // Default/generic
    return "generic";
  };

  // Modify the onDrop function to handle all file types, not just images
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedImage(file);

      // Only create a preview URL for image files
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        // For non-image files, we won't set a preview URL
        setPreviewUrl(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
  });

  const handleCancelUpload = () => {
    const currentAbortController = abortControllerRef.current;
    const currentPollInterval = pollIntervalRef.current;

    if (currentAbortController) {
      currentAbortController.abort();
      abortControllerRef.current = null;
    }

    // Clear any polling interval
    if (currentPollInterval) {
      clearInterval(currentPollInterval);
      pollIntervalRef.current = null;
    }

    uploadStartTimeRef.current = null;

    setUploadProgress({
      status: "cancelled",
      message: "Upload cancelled by user",
      error: "Upload cancelled",
      progress: 0,
    });

    setTimeout(() => {
      setUploadProgress(null);
      setSelectedImage(null);
      setPreviewUrl(null);
    }, 2000);
  };

  const handleSubmitImage = async () => {
    if (!selectedImage) return;

    const formData = new FormData();
    formData.append("file", selectedImage);

    try {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      // Create a new abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Record upload start time
      uploadStartTimeRef.current = Date.now();

      setUploadProgress({
        status: "starting",
        progress: 0,
        message: "Initiating upload...",
        lastUpdated: Date.now(),
        isStalled: false,
        filename: selectedImage.name,
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Upload failed (${response.status})`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // Error is already logged if parsing fails
          console.error(
            "[FilesTab.tsx:handleSubmitImage] Raw error response:",
            errorText
          );
        }
        throw new Error(errorMessage);
      }

      // Parse the initial response which should contain the job ID
      const data = await response.json();
      console.log("[FilesTab.tsx:handleSubmitImage] Upload initiated:", data);

      if (data.jobId) {
        // Update the upload progress with the job ID and start polling
        setUploadProgress((prev) => ({
          ...prev,
          ...data,
          lastUpdated: Date.now(),
          isStalled: false,
        }));

        // Start polling for status updates (with a small initial delay)
        startPollingUploadStatus(data.jobId, 1000);
      } else {
        throw new Error("No job ID received from server");
      }
    } catch (error) {
      // Clear the abort controller reference on error
      abortControllerRef.current = null;
      uploadStartTimeRef.current = null;

      // Handle AbortError specially
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log(
          "[FilesTab.tsx:handleSubmitImage] Upload was cancelled by user"
        );
        return;
      }

      console.error(
        "[FilesTab.tsx:handleSubmitImage] ❌ Error in handleSubmitImage:",
        error
      );
      setUploadProgress({
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
        lastUpdated: Date.now(),
      });
    }
  };

  // Render progress indicator with enhanced UI
  const renderUploadProgress = () => {
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

    // Create a floating status indicator that's always visible
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 shadow-lg rounded-lg overflow-hidden">
        <div className={`p-4 ${statusColor}`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                {uploadProgress.isStalled && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>{getStatusText()}</span>
                {uploadProgress.status !== "complete" &&
                  uploadProgress.status !== "error" &&
                  uploadProgress.status !== "cancelled" &&
                  abortControllerRef.current && (
                    <button
                      onClick={handleCancelUpload}
                      className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                    >
                      Cancel
                    </button>
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
              {uploadProgress.proofSetId && (
                <div className="text-xs mt-2 flex items-center">
                  <span className="mr-2">Proof Set ID:</span>
                  <a
                    href={`https://pdp-explorer.eng.filoz.org/proofsets/${uploadProgress.proofSetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline flex items-center"
                  >
                    {uploadProgress.proofSetId}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
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
                style={{ width: `${uploadProgress.progress}%` }}
              ></div>
            </div>
          )}

          {/* Display completed upload info with links */}
          {uploadProgress.status === "complete" && uploadProgress.cid && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <div className="flex flex-col gap-2">
                {uploadProgress.proofSetId && (
                  <a
                    href={`https://pdp-explorer.eng.filoz.org/proofsets/${uploadProgress.proofSetId}`}
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
      </div>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Add download function
  const handleDownload = (piece: Piece) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login to download files");
      return;
    }

    // Set this piece as downloading
    setDownloadsInProgress((prev) => ({
      ...prev,
      [piece.cid]: true,
    }));

    toast.info(`Preparing ${piece.filename} for download...`);

    // First try normal download
    downloadWithMethod(piece, false)
      .catch((error) => {
        console.error(
          "[FilesTab.tsx:handleDownload] Error with direct download:",
          error
        );

        // If direct download fails, try gateway download
        if (
          error.message &&
          (error.message.includes("pdptool not found") ||
            error.message.includes("Failed to download file"))
        ) {
          toast.info("Direct download failed. Trying IPFS gateway...");
          return downloadWithMethod(piece, true);
        }
        throw error; // Re-throw if it's not a pdptool error
      })
      .catch((error) => {
        console.error(
          "[FilesTab.tsx:handleDownload] Error with gateway download:",
          error
        );
        handleDownloadError(piece, error);
      });
  };

  // Helper function to download with either direct or gateway method
  const downloadWithMethod = (piece: Piece, useGateway: boolean) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      return Promise.reject(new Error("Authentication required"));
    }

    // Build URL with gateway parameter if needed
    const url = useGateway
      ? `${API_BASE_URL}/api/v1/download/${piece.cid}?gateway=true`
      : `${API_BASE_URL}/api/v1/download/${piece.cid}`;

    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          // Try to get detailed error message from response
          let errorMessage = `Download failed: ${response.statusText}`;
          let errorOptions: string[] = [];

          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = errorData.error;
              if (errorData.options) {
                errorOptions = errorData.options;
              }
              console.error(
                "[FilesTab.tsx:downloadWithMethod] Error details:",
                errorData
              );
            }
          } catch (e) {
            console.error(
              "[FilesTab.tsx:downloadWithMethod] Failed to parse error as JSON:",
              e
            );
            try {
              const errorText = await response.text();
              if (errorText) {
                errorMessage += ` - ${errorText}`;
              }
            } catch (textError) {
              console.error(
                "[FilesTab.tsx:downloadWithMethod] Failed to parse error:",
                textError
              );
            }
          }

          const error = new Error(errorMessage) as DownloadError;
          error.options = errorOptions;
          throw error;
        }

        // If it's a redirect (gateway method), follow the redirect
        if (response.redirected) {
          window.open(response.url, "_blank");

          // Remove from downloads in progress
          setDownloadsInProgress((prev) => {
            const newState = { ...prev };
            delete newState[piece.cid];
            return newState;
          });

          toast.success(
            `${piece.filename} opened in new tab from IPFS gateway`
          );
          return null; // Indicate that we handled it via redirect
        }

        return response.blob();
      })
      .then((blob) => {
        if (!blob) return; // Already handled by redirect case

        // Create a blob URL for the downloaded file
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", piece.filename);
        document.body.appendChild(link);
        link.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);

        toast.success(`${piece.filename} downloaded successfully`);

        // Remove from downloads in progress
        setDownloadsInProgress((prev) => {
          const newState = { ...prev };
          delete newState[piece.cid];
          return newState;
        });
      });
  };

  // Helper to handle download errors with options
  const handleDownloadError = (piece: Piece, error: DownloadError) => {
    const options = error.options || [];

    if (options.length > 0) {
      // Show error with options
      toast.error(
        <div className="flex flex-col gap-2">
          <div>Download failed: {error.message}</div>
          <div className="mt-2">
            <p className="text-sm font-semibold mb-1">Options:</p>
            <div className="flex flex-col gap-1">
              {options.map((option: string, index: number) => (
                <div key={index} className="text-sm">
                  {option}
                </div>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="flex items-center gap-2 mt-1"
            onClick={() => {
              // Try to download directly from IPFS gateway
              const cid = piece.cid.split(":")[0]; // Get the first part of the CID
              const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
              window.open(gatewayUrl, "_blank");

              // Remove from downloads in progress
              setDownloadsInProgress((prev) => {
                const newState = { ...prev };
                delete newState[piece.cid];
                return newState;
              });
            }}
          >
            <ExternalLink className="h-4 w-4" />
            Open in IPFS Gateway
          </Button>
        </div>,
        { duration: 10000 }
      );
    } else {
      // Show simple error
      toast.error(error.message || "Download failed");
    }

    // Remove from downloads in progress
    setDownloadsInProgress((prev) => {
      const newState = { ...prev };
      delete newState[piece.cid];
      return newState;
    });
  };

  // Add remove root function
  const handleRemoveRoot = (piece: Piece) => {
    setPieceToRemove(piece);
    setIsRemoveDialogOpen(true);
  };

  // Submit remove root request
  const submitRemoveRoot = async () => {
    if (!pieceToRemove) return;

    try {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/roots/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pieceId: pieceToRemove.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove root");
      }

      const result = await response.json();
      console.log("[FilesTab.tsx:submitRemoveRoot] Success:", result);

      toast.success("Root removal scheduled - will be removed in 24 hours");

      // Update the local state to mark the piece as pending removal
      setPieces(
        pieces.map((p) =>
          p.id === pieceToRemove.id
            ? {
                ...p,
                pendingRemoval: true,
                removalDate: new Date(
                  Date.now() + 24 * 60 * 60 * 1000
                ).toISOString(),
              }
            : p
        )
      );

      // Close dialog
      setIsRemoveDialogOpen(false);
      setPieceToRemove(null);
    } catch (error) {
      console.error("[FilesTab.tsx:submitRemoveRoot] Error:", error);
      toast.error(error instanceof Error ? error.message : "Unknown error");
    }
  };

  // Add a function to open the proof details dialog
  const openProofDetails = (piece: Piece) => {
    if (piece.proofSetId === undefined) return;

    setSelectedProof({
      pieceId: piece.id,
      pieceFilename: piece.filename,
      proofSetId: piece.proofSetId,
      cid: piece.cid,
      rootId: piece.rootId, // Include rootId when available
    });
    setIsProofDialogOpen(true);
  };

  // Add a helper function to determine file icon based on extension
  const getFileIcon = (filename: string) => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";

    // Images
    if (
      ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"].includes(extension)
    ) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-blue-400"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      );
    }

    // Documents
    if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(extension)) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-red-400"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      );
    }

    // Spreadsheets
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-green-500"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      );
    }

    // Archives
    if (["zip", "rar", "tar", "gz", "7z"].includes(extension)) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-amber-500"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      );
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
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-purple-500"
        >
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      );
    }

    // Video files
    if (
      ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm"].includes(extension)
    ) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-blue-600"
        >
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="10" y1="8" x2="10" y2="16"></line>
          <line x1="14" y1="8" x2="14" y2="16"></line>
        </svg>
      );
    }

    // Audio files
    if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(extension)) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-green-600"
        >
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
      );
    }

    // Default (fallback)
    return (
      <svg
        className="h-6 w-6 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    );
  };

  // Modify the renderPieceRow function to include animations
  const renderPieceRow = (piece: Piece, index: number) => {
    const isPendingRemoval = piece.pendingRemoval;
    const isDownloading = downloadsInProgress[piece.cid];
    const hasProof = piece.proofSetId !== undefined;
    const rowClasses = isPendingRemoval
      ? "hover:bg-gray-50 bg-red-50"
      : "hover:bg-gray-50";

    return (
      <motion.tr
        key={piece.id}
        className={rowClasses}
        variants={tableRowVariants}
        initial="hidden"
        animate="visible"
        custom={index}
        whileHover={{
          backgroundColor: isPendingRemoval
            ? "rgba(254, 226, 226, 0.9)"
            : "rgba(249, 250, 251, 0.9)",
          transition: { duration: 0.15 },
        }}
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            <motion.div
              className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center"
              whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
            >
              {getFileIcon(piece.filename)}
            </motion.div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900">
                {piece.filename}
              </div>
              <div className="text-sm text-gray-500 flex items-center flex-wrap gap-1">
                <span title={piece.cid} className="font-mono">
                  CID: {piece.cid.substring(0, 8)}...
                </span>
                {isPendingRemoval && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                    <svg
                      className="w-3 h-3 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Removal pending
                  </span>
                )}
                {isDownloading && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    <svg
                      className="w-3 h-3 mr-1 animate-spin"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Downloading
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatFileSize(piece.size)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDistanceToNow(new Date(piece.createdAt), {
            addSuffix: true,
          })}
          {isPendingRemoval && piece.removalDate && (
            <div className="text-red-600 text-xs mt-1 flex items-center">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Will be removed{" "}
              {formatDistanceToNow(new Date(piece.removalDate), {
                addSuffix: true,
              })}
            </div>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {hasProof ? (
            <div className="flex items-center flex-wrap gap-2">
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 mr-1"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                Set #{piece.proofSetId}
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={`https://pdp-explorer.eng.filoz.org/proofsets/${piece.proofSetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 flex items-center"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  <span className="text-xs">Explorer</span>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 py-1 text-xs"
                  onClick={() => openProofDetails(piece)}
                >
                  Details
                </Button>
              </div>
            </div>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Not available
            </span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          {isDownloading ? (
            <div className="flex items-center justify-end gap-2 text-blue-600">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
              <span>Downloading...</span>
            </div>
          ) : (
            <div className="flex items-center justify-end space-x-2">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(piece)}
                  disabled={isDownloading}
                  className="h-8 flex items-center transition-all duration-200 hover:text-blue-600"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </motion.div>
              <DropdownMenu>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-8 p-0 transition-all duration-200"
                    >
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </motion.div>
                <DropdownMenuContent
                  align="end"
                  sideOffset={5}
                  className="animate-in fade-in-50 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
                >
                  {piece.proofSetId !== undefined && (
                    <DropdownMenuItem
                      onClick={() => openProofDetails(piece)}
                      className="cursor-pointer"
                    >
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
                      View Proof
                    </DropdownMenuItem>
                  )}
                  {!isPendingRemoval && (
                    <DropdownMenuItem
                      onClick={() => handleRemoveRoot(piece)}
                      className="cursor-pointer text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Root
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </td>
      </motion.tr>
    );
  };

  return (
    <motion.div
      key="files"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      {/* Auth Error Banner */}
      <AnimatePresence>
        {authError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md shadow-sm"
          >
            <div className="flex items-center">
              <svg
                className="h-5 w-5 text-red-500 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-medium">Auth Error:</span>
              <span className="ml-2">{authError}</span>
            </div>
            <Button
              className="mt-3 bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
              size="sm"
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              Login Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Section */}
      <motion.div
        className="mb-8 bg-white rounded-xl shadow-sm p-6 overflow-hidden"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <Typography variant="h2" className="text-xl font-mono">
              My Files
            </Typography>
            <Typography variant="small" className="text-gray-500 mt-1">
              Upload, manage and share your files
            </Typography>
          </div>
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => fetchProofs()}
                disabled={loadingProofs}
                variant="outline"
                className="flex items-center gap-2"
              >
                {loadingProofs ? (
                  <div className="animate-spin h-4 w-4 border-2 border-current rounded-full border-t-transparent mr-1"></div>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 mr-1"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                )}
                {loadingProofs ? "Loading Proofs..." : "Refresh Proofs"}
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSubmitImage}
                disabled={!selectedImage}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedImage ? "Upload Selected File" : "Upload File"}
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Improved Dropzone with enhanced animations */}
        <div
          {...getRootProps()}
          className={`text-center p-8 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer mb-6 ${
            isDragActive
              ? "border-blue-500 bg-blue-50 scale-[1.01]"
              : selectedImage
              ? "border-green-500 bg-green-50"
              : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          }`}
        >
          <input {...getInputProps()} />
          <AnimatePresence mode="wait">
            {selectedImage ? (
              <motion.div
                key="preview"
                className="relative mx-auto flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-2 text-base font-medium text-gray-700">
                  Preview
                </div>
                <div className="relative max-w-md overflow-hidden">
                  {previewUrl ? (
                    // If we have a preview URL, it's an image
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      className="block max-h-48 w-auto h-auto rounded-md shadow-sm object-contain bg-white"
                      width={0}
                      height={0}
                      sizes="100vw"
                    />
                  ) : (
                    // Enhanced non-image file preview with specific styles per file type
                    <div className="block w-72 h-48 rounded-md shadow-sm bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
                      <div className="flex flex-col items-center justify-center p-6">
                        {(() => {
                          const fileType = getFilePreviewType(
                            selectedImage.name
                          );
                          const extension = selectedImage.name
                            .split(".")
                            .pop()
                            ?.toUpperCase();

                          // Different styling based on file type
                          switch (fileType) {
                            case "document":
                              return (
                                <>
                                  <div className="bg-red-50 p-5 rounded-lg mb-3 border border-red-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-red-500 rounded-full">
                                      {extension} DOCUMENT
                                    </div>
                                  </div>
                                </>
                              );

                            case "spreadsheet":
                              return (
                                <>
                                  <div className="bg-green-50 p-5 rounded-lg mb-3 border border-green-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-green-500 rounded-full">
                                      {extension} SPREADSHEET
                                    </div>
                                  </div>
                                </>
                              );

                            case "code":
                              return (
                                <>
                                  <div className="bg-purple-50 p-5 rounded-lg mb-3 border border-purple-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-purple-500 rounded-full">
                                      {extension} CODE
                                    </div>
                                  </div>
                                </>
                              );

                            case "archive":
                              return (
                                <>
                                  <div className="bg-amber-50 p-5 rounded-lg mb-3 border border-amber-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-amber-500 rounded-full">
                                      {extension} ARCHIVE
                                    </div>
                                  </div>
                                </>
                              );

                            case "video":
                              return (
                                <>
                                  <div className="bg-blue-50 p-5 rounded-lg mb-3 border border-blue-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-blue-600 rounded-full">
                                      {extension} VIDEO
                                    </div>
                                  </div>
                                </>
                              );

                            case "audio":
                              return (
                                <>
                                  <div className="bg-green-50 p-5 rounded-lg mb-3 border border-green-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-white px-3 py-1 bg-green-600 rounded-full">
                                      {extension} AUDIO
                                    </div>
                                  </div>
                                </>
                              );

                            default:
                              return (
                                <>
                                  <div className="bg-gray-50 p-5 rounded-lg mb-3 border border-gray-100 shadow-sm">
                                    {getFileIcon(selectedImage.name)}
                                  </div>
                                  <div className="text-center">
                                    <div className="font-medium text-gray-700 mb-1 max-w-[220px] truncate">
                                      {selectedImage.name}
                                    </div>
                                    <div className="text-xs text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                                      {extension}
                                    </div>
                                  </div>
                                </>
                              );
                          }
                        })()}
                      </div>
                    </div>
                  )}
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(null);
                      setPreviewUrl(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors leading-none shadow-sm"
                    aria-label="Remove file"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </motion.button>
                </div>
                <div className="mt-4 text-sm text-gray-600 max-w-md truncate">
                  {formatFileSize(selectedImage.size || 0)}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="upload-prompt"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="py-8 px-4 flex flex-col items-center"
              >
                <motion.div
                  className={`w-16 h-16 mb-4 rounded-full ${
                    isDragActive ? "bg-blue-100" : "bg-gray-50"
                  } flex items-center justify-center transition-colors duration-300 border-2 ${
                    isDragActive ? "border-blue-300" : "border-gray-200"
                  }`}
                  animate={{
                    scale: isDragActive ? 1.05 : 1,
                    rotate: isDragActive ? [0, -5, 5, -5, 5, 0] : 0,
                  }}
                  transition={{
                    duration: 0.3,
                    rotate: { duration: 0.5, ease: "easeInOut" },
                  }}
                >
                  <svg
                    className={`w-7 h-7 ${
                      isDragActive ? "text-blue-600" : "text-gray-500"
                    } transition-all duration-300`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </motion.div>
                <Typography
                  variant="body"
                  className={`${
                    isDragActive ? "text-blue-600 font-medium" : "text-gray-700"
                  } transition-colors duration-300 mb-1`}
                >
                  {isDragActive
                    ? "Drop to upload"
                    : "Drag and drop any file here, or click to select"}
                </Typography>
                <Typography variant="small" className="text-gray-400">
                  Accepts any file type
                </Typography>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {renderUploadProgress()}
      </motion.div>

      {/* Files List */}
      <motion.div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        variants={scaleIn}
        initial="hidden"
        animate="visible"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proof
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <AnimatePresence>
                {isLoading ? (
                  Array(3)
                    .fill(0)
                    .map((_, index) => (
                      <motion.tr
                        key={`skeleton-${index}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <td colSpan={6} className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-lg bg-gray-200 animate-pulse"></div>
                            <div className="ml-4 space-y-2">
                              <div className="h-4 bg-gray-200 rounded animate-pulse w-[180px]"></div>
                              <div className="h-3 bg-gray-200 rounded animate-pulse w-[120px]"></div>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                ) : pieces.length === 0 ? (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <motion.div
                        className="flex flex-col items-center"
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                      >
                        <svg
                          className="h-12 w-12 text-gray-300 mb-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                          />
                        </svg>
                        <Typography
                          variant="body"
                          className="text-gray-500 mb-2"
                        >
                          No files uploaded yet
                        </Typography>
                        <Typography variant="small" className="text-gray-400">
                          Use the upload section above to add your first file
                        </Typography>
                      </motion.div>
                    </td>
                  </motion.tr>
                ) : (
                  pieces.map((piece, index) => renderPieceRow(piece, index))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Remove Root Dialog */}
      <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Remove Root
            </DialogTitle>
            <DialogDescription>
              This will schedule the root for removal from the PDP service. The
              file will be removed in 24 hours. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pieceToRemove && (
            <div className="py-4 border-t border-b border-gray-100 my-4">
              <div className="flex items-center mb-4">
                <div className="text-sm font-medium text-gray-900 mr-2">
                  File:
                </div>
                <div className="text-sm text-gray-600">
                  {pieceToRemove.filename}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-gray-900 mb-1">
                  CID:
                </div>
                <div className="flex items-start">
                  <textarea
                    className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded-md w-full resize-none border border-gray-200"
                    value={pieceToRemove.cid}
                    readOnly
                    rows={2}
                    style={{ maxWidth: "400px" }}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pieceToRemove.cid);
                      toast.success("CID copied to clipboard");
                    }}
                    className="ml-2 p-1 text-gray-500 hover:text-gray-700"
                    title="Copy CID"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="feather feather-copy"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-700 p-3 rounded-md mt-2">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Warning</p>
                <p className="text-sm">
                  This file will be removed from the service and cannot be
                  restored.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRemoveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitRemoveRoot}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
            >
              Schedule Removal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Details Dialog */}
      <Dialog open={isProofDialogOpen} onOpenChange={setIsProofDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-green-600"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Proof Details
            </DialogTitle>
            <DialogDescription>
              View verification proof information for this file
            </DialogDescription>
          </DialogHeader>

          {selectedProof && (
            <div className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">
                    File
                  </h3>
                  <p className="text-sm font-medium break-all">
                    {selectedProof.pieceFilename}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">
                    Proof Set ID
                  </h3>
                  <p className="text-sm font-medium font-mono flex items-center gap-1">
                    {selectedProof.proofSetId}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedProof.proofSetId);
                        toast.success("Proof Set ID copied to clipboard");
                      }}
                      className="text-blue-500 hover:text-blue-700"
                      title="Copy Proof Set ID"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect
                          x="8"
                          y="2"
                          width="8"
                          height="4"
                          rx="1"
                          ry="1"
                        ></rect>
                      </svg>
                    </button>
                  </p>
                </div>

                {/* Add Root ID information */}
                {selectedProof.rootId && (
                  <div className="col-span-1 md:col-span-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 mr-1 text-purple-500"
                      >
                        <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path>
                        <line x1="2" y1="20" x2="2" y2="20"></line>
                      </svg>
                      Proof Set Root
                    </h3>
                    <div className="flex items-center gap-1 bg-white rounded p-3 text-sm font-mono break-all">
                      {selectedProof.rootId}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            selectedProof.rootId || ""
                          );
                          toast.success("Root ID copied to clipboard");
                        }}
                        className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0"
                        title="Copy Root ID"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                          <rect
                            x="8"
                            y="2"
                            width="8"
                            height="4"
                            rx="1"
                            ry="1"
                          ></rect>
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      The root is a cryptographic commitment that represents
                      this file in the PDP system.
                    </p>
                  </div>
                )}

                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">
                    Content ID (CID)
                  </h3>
                  <div className="flex items-center gap-1 bg-gray-50 rounded p-3 text-sm font-mono break-all">
                    {selectedProof.cid}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedProof.cid);
                        toast.success("CID copied to clipboard");
                      }}
                      className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0"
                      title="Copy CID"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect
                          x="8"
                          y="2"
                          width="8"
                          height="4"
                          rx="1"
                          ry="1"
                        ></rect>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 p-5 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-green-600"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  View Proof in PDP Explorer
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  The PDP Explorer provides detailed verification information
                  about your data&apos;s proof of storage.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    className="gap-2 justify-start bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white"
                    onClick={() =>
                      window.open(
                        `https://pdp-explorer.eng.filoz.org/proofsets/${selectedProof?.proofSetId}`,
                        "_blank"
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                    View Proof Set #{selectedProof?.proofSetId}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setIsProofDialogOpen(false)}
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

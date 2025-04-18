"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";
import Skeleton from "react-loading-skeleton";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";
import Image from "next/image";

interface Piece {
  id: number;
  cid: string;
  filename: string;
  size: number;
  serviceName: string;
  serviceUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface FilesTabProps {
  isLoading: boolean;
}

export const FilesTab: React.FC<FilesTabProps> = ({
  isLoading: initialLoading,
}) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isLoading] = useState(initialLoading);
  const [uploadProgress, setUploadProgress] = useState<{
    status: string;
    progress?: number;
    message?: string;
    cid?: string;
    error?: string;
    lastUpdated?: number; // timestamp of last update
    isStalled?: boolean;
    filename?: string; // store original filename for polling
  } | null>(null);

  // Refs for upload state management
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);

  // Clean up all timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
      if (longPollingTimeoutRef.current) {
        clearTimeout(longPollingTimeoutRef.current);
      }
    };
  }, []);

  // Long polling function to check if a file was uploaded when SSE fails
  const checkUploadCompletionWithPolling = useCallback(
    (filename: string) => {
      // Clear any existing polling timeout
      if (longPollingTimeoutRef.current) {
        clearTimeout(longPollingTimeoutRef.current);
      }

      // Only start polling if we've been waiting for at least 5 seconds
      const timeElapsed = uploadStartTimeRef.current
        ? Date.now() - uploadStartTimeRef.current
        : 0;
      if (timeElapsed < 5000) {
        longPollingTimeoutRef.current = setTimeout(() => {
          checkUploadCompletionWithPolling(filename);
        }, 5000 - timeElapsed);
        return;
      }

      // Only poll if upload is stalled or potentially incomplete
      if (
        !uploadProgress ||
        uploadProgress.status === "complete" ||
        uploadProgress.status === "error" ||
        uploadProgress.status === "cancelled"
      ) {
        return;
      }

      console.log(
        "[FilesTab.tsx:checkUploadCompletionWithPolling] Polling for upload completion:",
        filename
      );

      // Check if the file exists in the backend
      fetchPieces()
        .then(() => {
          // Look for the file in the pieces
          const uploadedPiece = pieces.find(
            (piece) => piece.filename.toLowerCase() === filename.toLowerCase()
          );

          if (uploadedPiece) {
            console.log(
              "[FilesTab.tsx:checkUploadCompletionWithPolling] ✅ Upload verified via polling! CID:",
              uploadedPiece.cid
            );

            // Update UI with completion status
            setUploadProgress({
              status: "complete",
              progress: 100,
              message: "Upload completed successfully (verified by poll)",
              cid: uploadedPiece.cid,
              filename: uploadedPiece.filename,
              lastUpdated: Date.now(),
              isStalled: false,
            });

            // Clean up after successful upload
            setSelectedImage(null);
            setPreviewUrl(null);

            // Clear the upload references
            abortControllerRef.current = null;
            uploadStartTimeRef.current = null;

            // Keep the success message for a moment then clear it
            setTimeout(() => {
              setUploadProgress(null);
            }, 3000);

            return; // Exit the polling loop
          }

          // If the current upload status is stalled, continue polling
          if (uploadProgress?.isStalled) {
            console.log(
              "[FilesTab.tsx:checkUploadCompletionWithPolling] Still checking for completion..."
            );

            // Continue polling every 5 seconds
            longPollingTimeoutRef.current = setTimeout(() => {
              checkUploadCompletionWithPolling(filename);
            }, 5000);
          }
        })
        .catch((error) => {
          console.error(
            "[FilesTab.tsx:checkUploadCompletionWithPolling] Error while polling:",
            error
          );

          // Continue polling on error as well
          longPollingTimeoutRef.current = setTimeout(() => {
            checkUploadCompletionWithPolling(filename);
          }, 5000);
        });
    },
    [pieces, uploadProgress]
  );

  // When upload becomes stalled, start long polling
  useEffect(() => {
    if (uploadProgress?.isStalled && uploadProgress.filename) {
      checkUploadCompletionWithPolling(uploadProgress.filename);
    }
  }, [
    uploadProgress?.isStalled,
    uploadProgress?.filename,
    checkUploadCompletionWithPolling,
  ]);

  // Check for stalled uploads
  useEffect(() => {
    if (
      uploadProgress &&
      uploadProgress.status !== "complete" &&
      uploadProgress.status !== "error"
    ) {
      // Clear any existing timeout
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }

      // Set a new timeout to check for stalled uploads
      uploadTimeoutRef.current = setTimeout(() => {
        setUploadProgress((prev) => {
          if (prev && prev.status !== "complete" && prev.status !== "error") {
            const timeSinceLastUpdate =
              Date.now() - (prev.lastUpdated || Date.now());
            // If no update for 10 seconds, mark as stalled
            if (timeSinceLastUpdate > 10000) {
              return { ...prev, isStalled: true };
            }
          }
          return prev;
        });
      }, 10000); // Check every 10 seconds
    }

    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
    };
  }, [uploadProgress]);

  const fetchPieces = async () => {
    try {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/pieces`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch pieces");
      }

      const data = await response.json();
      setPieces(data);
      return data; // Return the data for possible use by the caller
    } catch (error) {
      console.error(
        "[FilesTab.tsx:fetchPieces] ❌ Error fetching pieces:",
        error
      );
      throw error; // Rethrow so the caller can catch it
    }
  };

  useEffect(() => {
    fetchPieces();
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif"],
    },
    maxFiles: 1,
  });

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear any polling timeouts
    if (longPollingTimeoutRef.current) {
      clearTimeout(longPollingTimeoutRef.current);
      longPollingTimeoutRef.current = null;
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

      // Record upload start time for polling
      uploadStartTimeRef.current = Date.now();

      setUploadProgress({
        status: "uploading",
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

      // Check if the response is SSE
      const contentType = response.headers.get("content-type");
      if (
        contentType &&
        contentType.includes("text/event-stream") &&
        response.body
      ) {
        console.log(
          "[FilesTab.tsx:handleSubmitImage] SSE stream detected, processing..."
        );
        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(
              "[FilesTab.tsx:handleSubmitImage] SSE stream finished."
            );
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n"); // SSE messages end with \n\n
          buffer = lines.pop() || ""; // Keep the last partial line

          for (const line of lines) {
            if (line.startsWith("data:")) {
              const jsonData = line.substring(5).trim(); // Remove 'data:' prefix
              try {
                const progressData = JSON.parse(jsonData);
                console.log(
                  "[FilesTab.tsx:handleSubmitImage] Progress update:",
                  progressData
                );

                // Add timestamp to progress data for stall detection
                progressData.lastUpdated = Date.now();
                progressData.isStalled = false;

                // If this is a completion notification, handle it immediately
                if (progressData.status === "complete" || progressData.cid) {
                  console.log(
                    "[FilesTab.tsx:handleSubmitImage] ✅ Upload complete event received! CID:",
                    progressData.cid
                  );

                  // Update UI with completion status
                  setUploadProgress({
                    ...progressData,
                    status: "complete",
                    progress: 100,
                    message:
                      progressData.message || "Upload completed successfully",
                    lastUpdated: Date.now(),
                    isStalled: false,
                  });

                  // Clean up after successful upload
                  setSelectedImage(null);
                  setPreviewUrl(null);

                  // Clear the upload reference after a successful upload
                  abortControllerRef.current = null;
                  uploadStartTimeRef.current = null;

                  // Clear any polling timeouts
                  if (longPollingTimeoutRef.current) {
                    clearTimeout(longPollingTimeoutRef.current);
                    longPollingTimeoutRef.current = null;
                  }

                  // Keep the success message for a moment then clear it
                  setTimeout(() => {
                    setUploadProgress(null);
                  }, 3000);

                  fetchPieces(); // Refresh the pieces list
                  reader.cancel(); // Stop reading the stream
                  return; // Exit the function
                } else if (progressData.status === "error") {
                  console.error(
                    "[FilesTab.tsx:handleSubmitImage] ❌ Upload error event received:",
                    progressData.error
                  );

                  // Clear the upload reference after an error
                  abortControllerRef.current = null;
                  uploadStartTimeRef.current = null;

                  throw new Error(
                    progressData.error || "Upload failed during stream"
                  );
                } else {
                  // Update progress for other status updates
                  setUploadProgress({
                    ...progressData,
                    filename: selectedImage.name, // Ensure filename is always present for polling
                  });
                }
              } catch (parseError) {
                console.error(
                  "[FilesTab.tsx:handleSubmitImage] ❌ Failed to parse SSE data:",
                  jsonData,
                  parseError
                );
              }
            }
          }
        }
        // If loop finishes without 'complete' or 'error' status, consider it potentially incomplete
        if (uploadProgress?.status !== "complete") {
          console.warn(
            "[FilesTab.tsx:handleSubmitImage] SSE stream ended without a final 'complete' or 'error' status."
          );
          // Set a warning state and trigger polling
          setUploadProgress((prev) => {
            if (prev) {
              const updatedProgress = {
                ...prev,
                status: "warning",
                message:
                  "Upload stream ended without completion confirmation. Checking status...",
                isStalled: true,
              };

              // Start polling to check completion
              if (selectedImage?.name) {
                setTimeout(() => {
                  checkUploadCompletionWithPolling(selectedImage.name);
                }, 1000);
              }

              return updatedProgress;
            }
            return prev;
          });
        }
      } else {
        // Handle non-SSE responses if necessary (e.g., fallback or different endpoint)
        console.warn(
          "[FilesTab.tsx:handleSubmitImage] Received non-SSE response."
        );
        // Attempt to parse as JSON as a fallback, though the backend isn't designed for this
        try {
          const fallbackData = await response.json();
          console.log(
            "[FilesTab.tsx:handleSubmitImage] Fallback JSON response:",
            fallbackData
          );

          // If this is a JSON response with a CID, treat it as success
          if (fallbackData.cid) {
            setUploadProgress({
              status: "complete",
              progress: 100,
              message: "Upload completed successfully",
              cid: fallbackData.cid,
              filename: selectedImage.name,
              lastUpdated: Date.now(),
            });

            setSelectedImage(null);
            setPreviewUrl(null);
            abortControllerRef.current = null;
            uploadStartTimeRef.current = null;

            setTimeout(() => {
              setUploadProgress(null);
            }, 3000);

            fetchPieces();
          } else {
            // Start polling as fallback
            checkUploadCompletionWithPolling(selectedImage.name);
          }
        } catch {
          const fallbackText = await response.text(); // Read body again if json fails
          console.error(
            "[FilesTab.tsx:handleSubmitImage] Non-SSE response body:",
            fallbackText
          );

          // Start polling as fallback
          checkUploadCompletionWithPolling(selectedImage.name);
          throw new Error("Received unexpected response format from server.");
        }
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
      <div className={`mt-4 p-4 rounded-lg border ${statusColor}`}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium">
              {uploadProgress.isStalled && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span>{getStatusText()}</span>
              {uploadProgress.status === "uploading" &&
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
              <div className="text-sm mt-1 opacity-80">
                {uploadProgress.message}
              </div>
            )}
            {uploadProgress.isStalled && (
              <div className="text-amber-600 text-sm mt-1">
                No updates received for a while. The upload may be stalled.
              </div>
            )}
            {uploadProgress.error && (
              <div className="text-red-500 text-sm mt-1">
                Error: {uploadProgress.error}
              </div>
            )}
          </div>
          {uploadProgress.progress !== undefined && (
            <div className="text-sm font-medium">
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

  return (
    <motion.div
      key="files"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6"
    >
      {/* Upload Section */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <Typography variant="h2" className="text-xl font-mono">
              My Files
            </Typography>
            <Typography variant="body" className="text-gray-500 mt-1">
              Upload and manage your files on IPFS
            </Typography>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={handleSubmitImage}
              disabled={!selectedImage}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload File
            </Button>
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`text-center py-8 rounded-xl border-2 border-dashed ${
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200"
          } transition-colors duration-200 cursor-pointer mb-6`}
        >
          <input {...getInputProps()} />
          {previewUrl ? (
            <div className="relative">
              <Image
                src={previewUrl}
                alt="Preview"
                className="max-h-64 mx-auto rounded-lg shadow-sm"
                width={256}
                height={256}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <Typography variant="body" className="text-gray-500">
                {isDragActive
                  ? "Drop the image here"
                  : "Drag and drop an image here, or click to select"}
              </Typography>
              <Typography variant="small" className="text-gray-400 mt-2">
                Supports: JPG, PNG, GIF
              </Typography>
            </>
          )}
        </div>
        {renderUploadProgress()}
      </div>

      {/* Files List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
                  Service
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4">
                    <Skeleton count={3} />
                  </td>
                </tr>
              ) : pieces.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No files uploaded yet
                  </td>
                </tr>
              ) : (
                pieces.map((piece) => (
                  <tr key={piece.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
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
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {piece.filename}
                          </div>
                          <div className="text-sm text-gray-500">
                            CID: {piece.cid.substring(0, 8)}...
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {piece.serviceName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <a
                        href={piece.serviceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

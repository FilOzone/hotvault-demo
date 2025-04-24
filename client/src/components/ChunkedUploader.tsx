import React, { useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { formatFileSize } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, XCircle, CheckCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChunkedUploaderProps {
  onUploadSuccess: (jobId: string) => void;
  maxFileSize?: number; // Maximum file size in bytes
  chunkSize?: number; // Chunk size in bytes (default: 5MB)
  accept?: string; // File types to accept
  maxConcurrentChunks?: number; // Maximum number of chunks to upload concurrently
}

interface ChunkStatus {
  index: number;
  state: "pending" | "uploading" | "complete" | "error";
  progress: number;
  error?: string;
  retries: number;
}

interface UploadSession {
  uploadId: string;
  filename: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  chunkSize: number;
  chunks: ChunkStatus[];
  uploadedChunks: number;
  startTime: number;
  bytesUploaded: number;
  averageSpeed: number; // bytes per second
  status:
    | "initializing"
    | "uploading"
    | "paused"
    | "finalizing"
    | "complete"
    | "error";
  jobId?: string;
  errorMessage?: string;
}

// Calculate optimal chunk size based on file size
function getOptimalChunkSize(fileSize: number): number {
  // For very large files (>1GB), use larger chunks to reduce the number of requests
  if (fileSize > 1024 * 1024 * 1024) {
    return 20 * 1024 * 1024; // 20MB chunks for >1GB files
  } else if (fileSize > 500 * 1024 * 1024) {
    return 10 * 1024 * 1024; // 10MB chunks for >500MB files
  } else if (fileSize > 100 * 1024 * 1024) {
    return 5 * 1024 * 1024; // 5MB chunks for >100MB files
  } else {
    return 2 * 1024 * 1024; // 2MB chunks for smaller files
  }
}

const ChunkedUploader: React.FC<ChunkedUploaderProps> = ({
  onUploadSuccess,
  maxFileSize = 10 * 1024 * 1024 * 1024, // 10GB default limit
  chunkSize: propChunkSize,
  accept = "*",
  maxConcurrentChunks = 3,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(
    null
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeUploadsRef = useRef<number>(0);
  const pendingChunksRef = useRef<number[]>([]);

  const resetUpload = () => {
    // Cancel any ongoing uploads
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear interval
    if (uploadIntervalRef.current) {
      clearInterval(uploadIntervalRef.current);
      uploadIntervalRef.current = null;
    }

    setFile(null);
    setUploadSession(null);
    activeUploadsRef.current = 0;
    pendingChunksRef.current = [];
  };

  const handleFileSelect = (selectedFile: File) => {
    // Check file size
    if (selectedFile.size > maxFileSize) {
      toast.error(
        `File is too large. Maximum size is ${formatFileSize(
          maxFileSize
        )}. Selected file size: ${formatFileSize(selectedFile.size)}`
      );
      return;
    }

    setFile(selectedFile);

    // Determine optimal chunk size
    const optimalChunkSize =
      propChunkSize || getOptimalChunkSize(selectedFile.size);

    // Generate session details
    const totalChunks = Math.ceil(selectedFile.size / optimalChunkSize);
    const chunks: ChunkStatus[] = Array.from(
      { length: totalChunks },
      (_, index) => ({
        index,
        state: "pending",
        progress: 0,
        retries: 0,
      })
    );

    // Initialize pending chunks
    pendingChunksRef.current = Array.from({ length: totalChunks }, (_, i) => i);

    setUploadSession({
      uploadId: "",
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      totalChunks,
      chunkSize: optimalChunkSize,
      chunks,
      uploadedChunks: 0,
      startTime: Date.now(),
      bytesUploaded: 0,
      averageSpeed: 0,
      status: "initializing",
    });

    // Initialize upload session
    initializeUpload(selectedFile, totalChunks, optimalChunkSize);
  };

  const initializeUpload = async (
    selectedFile: File,
    totalChunks: number,
    chunkSize: number
  ) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login again.");
      resetUpload();
      return;
    }

    try {
      console.log(
        `[ChunkedUploader] Initializing upload with ${totalChunks} chunks of ${formatFileSize(
          chunkSize
        )} each`
      );

      const response = await fetch(
        `${API_BASE_URL}/api/v1/chunked-upload/init`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            filename: selectedFile.name,
            totalSize: selectedFile.size,
            chunkSize,
            totalChunks,
            fileType: selectedFile.type,
          }),
        }
      );

      if (!response.ok) {
        let errorMessage = "Failed to initialize upload";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }

        setUploadSession((prev) =>
          prev ? { ...prev, status: "error", errorMessage } : null
        );
        toast.error(`Upload initialization failed: ${errorMessage}`);
        return;
      }

      const data = (await response.json()) as {
        uploadId: string;
        totalChunks: number;
      };
      console.log("[ChunkedUploader] Upload initialized:", data);

      setUploadSession((prev) =>
        prev
          ? {
              ...prev,
              uploadId: data.uploadId,
              status: "uploading",
            }
          : null
      );

      // Start uploading chunks
      startChunkedUpload(selectedFile, data.uploadId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setUploadSession((prev) =>
        prev ? { ...prev, status: "error", errorMessage } : null
      );
      toast.error(`Upload initialization failed: ${errorMessage}`);
    }
  };

  const startChunkedUpload = (selectedFile: File, uploadId: string) => {
    if (!uploadSession) return;

    abortControllerRef.current = new AbortController();

    // Setup tracking interval
    uploadIntervalRef.current = setInterval(() => {
      setUploadSession((prev) => {
        if (!prev) return null;

        // Calculate speed based on data uploaded
        const elapsedTimeMs = Date.now() - prev.startTime;
        const elapsedTimeSec = elapsedTimeMs / 1000;
        const averageSpeed =
          elapsedTimeSec > 0 ? prev.bytesUploaded / elapsedTimeSec : 0;

        return {
          ...prev,
          averageSpeed,
        };
      });
    }, 1000);

    // Start uploading chunks
    activeUploadsRef.current = 0;

    const processNextChunk = () => {
      if (!uploadSession) return;

      // Check if we're done
      if (
        pendingChunksRef.current.length === 0 &&
        activeUploadsRef.current === 0
      ) {
        // All chunks have been uploaded
        if (uploadIntervalRef.current) {
          clearInterval(uploadIntervalRef.current);
          uploadIntervalRef.current = null;
        }

        console.log("[ChunkedUploader] All chunks uploaded, finalizing");
        finalizeUpload(uploadId);
        return;
      }

      // Start uploading chunks up to max concurrent
      while (
        activeUploadsRef.current < maxConcurrentChunks &&
        pendingChunksRef.current.length > 0
      ) {
        const nextChunkIndex = pendingChunksRef.current.shift();
        if (nextChunkIndex !== undefined) {
          activeUploadsRef.current++;
          uploadChunk(selectedFile, uploadId, nextChunkIndex)
            .then(() => {
              activeUploadsRef.current--;
              processNextChunk();
            })
            .catch((error) => {
              console.error(
                `[ChunkedUploader] Chunk ${nextChunkIndex} upload failed:`,
                error
              );
              activeUploadsRef.current--;

              // Check if the chunk was marked for retry or error
              const chunkState = uploadSession.chunks[nextChunkIndex].state;
              if (chunkState === "pending") {
                // Re-add to pending queue if it's marked for retry
                pendingChunksRef.current.push(nextChunkIndex);
              }

              processNextChunk();
            });
        }
      }
    };

    // Start processing chunks
    processNextChunk();
  };

  const uploadChunk = async (
    selectedFile: File,
    uploadId: string,
    chunkIndex: number
  ): Promise<void> => {
    if (!uploadSession || abortControllerRef.current?.signal.aborted) {
      return Promise.reject("Upload aborted");
    }

    // Update chunk status to uploading
    setUploadSession((prev) => {
      if (!prev) return null;

      const updatedChunks = [...prev.chunks];
      updatedChunks[chunkIndex] = {
        ...updatedChunks[chunkIndex],
        state: "uploading",
        progress: 0,
      };

      return {
        ...prev,
        chunks: updatedChunks,
      };
    });

    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login again.");
      resetUpload();
      return Promise.reject("Authentication required");
    }

    // Calculate chunk boundaries
    const start = chunkIndex * uploadSession.chunkSize;
    const end = Math.min(start + uploadSession.chunkSize, selectedFile.size);
    const chunk = selectedFile.slice(start, end);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append("chunk", chunk);

      // Use XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100
            );

            setUploadSession((prev) => {
              if (!prev) return null;

              const updatedChunks = [...prev.chunks];
              updatedChunks[chunkIndex] = {
                ...updatedChunks[chunkIndex],
                progress: percentComplete,
              };

              // Calculate total bytes uploaded so far
              const chunkBytesUploaded =
                (event.loaded / event.total) * (end - start);
              const totalBytesCompleted = prev.bytesUploaded;
              const bytesFromCurrentChunk =
                prev.chunks[chunkIndex].state === "complete"
                  ? 0
                  : chunkBytesUploaded;

              return {
                ...prev,
                bytesUploaded: totalBytesCompleted + bytesFromCurrentChunk,
                chunks: updatedChunks,
              };
            });
          }
        };

        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              // Parse response
              const responseData = JSON.parse(xhr.responseText) as {
                uploadId: string;
                chunkIndex: number;
                uploadedChunks: number;
                totalChunks: number;
                allChunksReceived: boolean;
              };

              // Mark chunk as complete
              setUploadSession((prev) => {
                if (!prev) return null;

                const updatedChunks = [...prev.chunks];
                updatedChunks[chunkIndex] = {
                  ...updatedChunks[chunkIndex],
                  state: "complete",
                  progress: 100,
                };

                // Update uploaded chunks count
                const chunkSize = end - start;

                return {
                  ...prev,
                  uploadedChunks: responseData.uploadedChunks,
                  bytesUploaded: prev.bytesUploaded + chunkSize,
                  chunks: updatedChunks,
                };
              });

              resolve();
            } catch (error) {
              console.error(
                "[ChunkedUploader] Error parsing chunk upload response:",
                error
              );
              reject(new Error("Invalid response from server"));
            }
          } else {
            // Handle error
            setUploadSession((prev) => {
              if (!prev) return null;

              const updatedChunks = [...prev.chunks];
              const currentChunk = updatedChunks[chunkIndex];

              // Increment retry count
              const newRetries = currentChunk.retries + 1;

              // If max retries exceeded, mark as error, otherwise mark as pending to retry
              if (newRetries >= 3) {
                updatedChunks[chunkIndex] = {
                  ...currentChunk,
                  state: "error",
                  error: `Failed with status ${xhr.status}`,
                  retries: newRetries,
                };
              } else {
                updatedChunks[chunkIndex] = {
                  ...currentChunk,
                  state: "pending",
                  error: `Retrying (${newRetries}/3)...`,
                  retries: newRetries,
                };
              }

              return {
                ...prev,
                chunks: updatedChunks,
              };
            });

            let errorMessage = `Chunk ${chunkIndex} upload failed with status ${xhr.status}`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorMessage;
            } catch {
              // If response is not JSON, use response text
              errorMessage = xhr.responseText || errorMessage;
            }

            reject(new Error(errorMessage));
          }
        };

        xhr.onerror = () => {
          // Mark as pending for retry
          setUploadSession((prev) => {
            if (!prev) return null;

            const updatedChunks = [...prev.chunks];
            const currentChunk = updatedChunks[chunkIndex];

            // Increment retry count
            const newRetries = currentChunk.retries + 1;

            // If max retries exceeded, mark as error, otherwise mark as pending to retry
            if (newRetries >= 3) {
              updatedChunks[chunkIndex] = {
                ...currentChunk,
                state: "error",
                error: "Network error",
                retries: newRetries,
              };
            } else {
              updatedChunks[chunkIndex] = {
                ...currentChunk,
                state: "pending",
                error: `Retrying (${newRetries}/3)...`,
                retries: newRetries,
              };
            }

            return {
              ...prev,
              chunks: updatedChunks,
            };
          });

          reject(new Error("Network error during chunk upload"));
        };

        xhr.onabort = () => {
          reject(new Error("Upload aborted"));
        };

        // Set a timeout to prevent hanging uploads
        xhr.timeout = 120000; // 2 minutes timeout per chunk
        xhr.ontimeout = () => {
          setUploadSession((prev) => {
            if (!prev) return null;

            const updatedChunks = [...prev.chunks];
            const currentChunk = updatedChunks[chunkIndex];

            // Increment retry count
            const newRetries = currentChunk.retries + 1;

            // If max retries exceeded, mark as error, otherwise mark as pending to retry
            if (newRetries >= 3) {
              updatedChunks[chunkIndex] = {
                ...currentChunk,
                state: "error",
                error: "Timeout error",
                retries: newRetries,
              };
            } else {
              updatedChunks[chunkIndex] = {
                ...currentChunk,
                state: "pending",
                error: `Timeout - Retrying (${newRetries}/3)...`,
                retries: newRetries,
              };
            }

            return {
              ...prev,
              chunks: updatedChunks,
            };
          });

          reject(new Error("Chunk upload timed out"));
        };

        // Send the chunk with query parameters
        xhr.open(
          "POST",
          `${API_BASE_URL}/api/v1/chunked-upload/chunk?uploadId=${uploadId}&chunkIndex=${chunkIndex}`
        );
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      });
    } catch (error) {
      // Handle error
      setUploadSession((prev) => {
        if (!prev) return null;

        const updatedChunks = [...prev.chunks];
        updatedChunks[chunkIndex] = {
          ...updatedChunks[chunkIndex],
          state: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };

        return {
          ...prev,
          chunks: updatedChunks,
        };
      });

      return Promise.reject(error);
    }
  };

  const finalizeUpload = async (uploadId: string) => {
    if (!uploadSession) return;

    try {
      setUploadSession((prev) =>
        prev ? { ...prev, status: "finalizing" } : null
      );

      const token = localStorage.getItem("jwt_token");
      if (!token) {
        toast.error("Authentication required. Please login again.");
        resetUpload();
        return;
      }

      console.log("[ChunkedUploader] Finalizing upload:", uploadId);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/chunked-upload/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uploadId,
          }),
        }
      );

      if (!response.ok) {
        let errorMessage = "Failed to finalize upload";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }

        setUploadSession((prev) =>
          prev ? { ...prev, status: "error", errorMessage } : null
        );
        toast.error(`Upload finalization failed: ${errorMessage}`);
        return;
      }

      const data = (await response.json()) as { jobId: string; status: string };
      console.log("[ChunkedUploader] Upload finalized, job ID:", data.jobId);

      setUploadSession((prev) =>
        prev
          ? {
              ...prev,
              status: "complete",
              jobId: data.jobId,
            }
          : null
      );

      toast.success(
        "File uploaded successfully! Processing will continue in the background."
      );
      onUploadSuccess(data.jobId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setUploadSession((prev) =>
        prev ? { ...prev, status: "error", errorMessage } : null
      );
      toast.error(`Upload finalization failed: ${errorMessage}`);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);

      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        handleFileSelect(event.dataTransfer.files[0]);
      }
    },
    [setIsDragActive]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
    },
    []
  );

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(1)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
  };

  const getEstimatedTimeRemaining = (): string => {
    if (!uploadSession || uploadSession.averageSpeed <= 0) {
      return "Calculating...";
    }

    const remainingBytes = uploadSession.fileSize - uploadSession.bytesUploaded;
    const remainingSeconds = remainingBytes / uploadSession.averageSpeed;

    if (remainingSeconds < 60) {
      return `${Math.ceil(remainingSeconds)} seconds`;
    } else if (remainingSeconds < 3600) {
      return `${Math.ceil(remainingSeconds / 60)} minutes`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.ceil((remainingSeconds % 3600) / 60);
      return `${hours} hour${hours > 1 ? "s" : ""} ${minutes} min`;
    }
  };

  const renderProgressBar = () => {
    if (!uploadSession) return null;

    const {
      status,
      uploadedChunks,
      totalChunks,
      bytesUploaded,
      fileSize,
      averageSpeed,
    } = uploadSession;

    const progressPercent = Math.round((bytesUploaded / fileSize) * 100);

    let statusText = "";
    let statusColor = "bg-blue-500";

    switch (status) {
      case "initializing":
        statusText = "Initializing upload...";
        break;
      case "uploading":
        statusText = `Uploading: ${uploadedChunks}/${totalChunks} chunks (${progressPercent}%)`;
        break;
      case "paused":
        statusText = "Upload paused";
        statusColor = "bg-amber-500";
        break;
      case "finalizing":
        statusText = "Finalizing upload...";
        break;
      case "complete":
        statusText = "Upload complete!";
        statusColor = "bg-green-500";
        break;
      case "error":
        statusText = `Error: ${uploadSession.errorMessage || "Unknown error"}`;
        statusColor = "bg-red-500";
        break;
    }

    return (
      <div className="w-full mt-4">
        <div className="flex justify-between mb-1 text-sm">
          <span>{statusText}</span>
          <span>
            {formatFileSize(bytesUploaded)} / {formatFileSize(fileSize)}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
          <div
            className={`h-2.5 rounded-full ${statusColor} transition-all duration-300`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {status === "uploading" && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Speed: {formatSpeed(averageSpeed)}</span>
            <span>Time remaining: {getEstimatedTimeRemaining()}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }
          ${uploadSession ? "bg-gray-50" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={accept}
        />

        {!file && !uploadSession ? (
          <>
            <Upload className="h-12 w-12 text-gray-400 mb-3" />
            <h3 className="text-lg font-medium mb-1">Upload Large Files</h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              Drag and drop files here or click to browse
            </p>
            <p className="text-xs text-gray-400">
              Supports files up to {formatFileSize(maxFileSize)} with chunked
              uploading
            </p>
          </>
        ) : (
          <div className="w-full">
            <div className="flex items-center mb-2">
              {uploadSession?.status === "error" ? (
                <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
              ) : uploadSession?.status === "complete" ? (
                <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
              ) : (
                <div className="h-6 w-6 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mr-2"></div>
              )}
              <h3 className="text-lg font-medium flex-1 truncate">
                {file?.name || "Unknown file"}
              </h3>
              {uploadSession?.status !== "complete" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetUpload();
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>

            <div className="text-sm text-gray-600 mb-2">
              {formatFileSize(file?.size || 0)}
            </div>

            {renderProgressBar()}
          </div>
        )}
      </div>

      {uploadSession && uploadSession.status === "uploading" && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Chunk Status</h4>
          <div className="grid grid-cols-10 gap-1">
            {uploadSession.chunks.map((chunk) => (
              <div
                key={chunk.index}
                className={`h-2 rounded-sm ${
                  chunk.state === "complete"
                    ? "bg-green-500"
                    : chunk.state === "uploading"
                    ? "bg-blue-500"
                    : chunk.state === "error"
                    ? "bg-red-500"
                    : "bg-gray-200"
                }`}
                title={`Chunk ${chunk.index + 1}: ${chunk.state}${
                  chunk.error ? ` (${chunk.error})` : ""
                }`}
              ></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChunkedUploader;

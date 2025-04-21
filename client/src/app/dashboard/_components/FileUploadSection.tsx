"use client";

import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Typography } from "@/components/ui/typography";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { FileIcon } from "./FileIcon";
import { useUploadStore } from "@/store/upload-store";

interface FileUploadProps {
  onUploadSuccess: () => void;
}

export const FileUploadSection: React.FC<FileUploadProps> = ({
  onUploadSuccess,
}) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { uploadProgress, setUploadProgress, clearUploadProgress } =
    useUploadStore();

  // Refs for upload state management
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);

  const handleCancelUpload = () => {
    // Cancel any in-progress fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear any poll intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Clear any timeouts
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }

    // Reset the upload state
    clearUploadProgress();
    toast.info("Upload canceled");
  };

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

    // Image files
    if (
      ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(
        extension
      )
    ) {
      return "image";
    }

    // Document files
    if (["pdf", "doc", "docx", "txt", "rtf", "odt", "md"].includes(extension)) {
      return "document";
    }

    // Spreadsheet files
    if (["xls", "xlsx", "csv", "ods", "numbers"].includes(extension)) {
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
        "scss",
        "json",
        "xml",
        "yaml",
        "yml",
        "py",
        "rb",
        "java",
        "c",
        "cpp",
        "go",
        "rs",
        "php",
      ].includes(extension)
    ) {
      return "code";
    }

    // Archive files
    if (
      ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(extension)
    ) {
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

    // Default (fallback)
    return "generic";
  };

  const handleSubmitImage = async () => {
    if (!selectedImage) return;

    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login again.");
      return;
    }

    // Create a new AbortController for this upload
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Set the start time for this upload
    uploadStartTimeRef.current = Date.now();

    const formData = new FormData();
    formData.append("file", selectedImage);

    try {
      setUploadProgress({
        status: "uploading",
        progress: 0,
        lastUpdated: Date.now(),
        isStalled: false,
        filename: selectedImage.name,
      });

      // Start the stall detection timer
      uploadTimeoutRef.current = setTimeout(() => {
        setUploadProgress((prev) => ({
          ...(prev || { status: "uploading", filename: selectedImage.name }),
          isStalled: true,
        }));
      }, 10000); // 10 seconds timeout

      console.log(
        `[FileUploadSection] 🚀 Uploading ${selectedImage.name} to ${API_BASE_URL}/api/v1/upload`
      );
      const response = await fetch(`${API_BASE_URL}/api/v1/upload`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      // Clear the stall detection timer
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      console.log(
        `[FileUploadSection] 📬 Upload response status: ${response.status}`
      );
      if (!response.ok) {
        let errorData = {
          message: `Upload failed with status ${response.status}`,
        };
        try {
          errorData = await response.json();
          console.error(
            "[FileUploadSection] ❌ Upload failed response body:",
            errorData
          );
        } catch (jsonError) {
          console.error(
            "[FileUploadSection] ❌ Failed to parse upload error response as JSON:",
            jsonError
          );
          const textResponse = await response.text();
          console.error(
            "[FileUploadSection] ❌ Upload failed response text:",
            textResponse
          );
          errorData.message = textResponse || errorData.message;
        }
        throw new Error(errorData.message || "Upload failed");
      }

      const data = await response.json();
      console.log(
        "[FileUploadSection] ✅ Upload successful response body:",
        data
      );

      setUploadProgress({
        status: "success",
        cid: data.cid,
        message: "File uploaded successfully!",
        lastUpdated: Date.now(),
        jobId: data.jobId, // Store job ID for polling
      });

      // Start polling for proof status if we have a job ID
      if (data.jobId) {
        setUploadProgress((prev) => ({
          ...(prev || { filename: selectedImage.name }),
          status: "processing",
        }));

        // Poll for proof generation status
        const pollStatus = async () => {
          try {
            console.log(
              `[FileUploadSection] ⏳ Polling status for job ${data.jobId}...`
            );
            const statusResponse = await fetch(
              `${API_BASE_URL}/api/v1/upload/status/${data.jobId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            console.log(
              `[FileUploadSection] 📬 Poll response status: ${statusResponse.status}`
            );
            if (!statusResponse.ok) {
              throw new Error("Failed to check proof status");
            }

            const statusData = await statusResponse.json();
            console.log(
              "[FileUploadSection] 📊 Polling status update:",
              statusData
            );

            if (statusData.status === "complete") {
              console.log("[FileUploadSection] ✅ Proof generation complete!");
              setUploadProgress((prev) => ({
                ...(prev || { filename: selectedImage.name }),
                status: "complete",
                message: "File uploaded and proof generated!",
                serviceProofSetId: statusData.serviceProofSetId,
              }));

              // Clear the polling interval
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }

              // Fetch updated pieces data
              onUploadSuccess();

              // Reset the upload state after a delay
              setTimeout(() => {
                setUploadProgress({
                  status: "complete",
                  message: "Upload complete",
                });
                setSelectedImage(null);
                setPreviewUrl(null);
              }, 5000);
            } else if (statusData.status === "failed") {
              console.error(
                "[FileUploadSection] ❌ Proof generation failed:",
                statusData
              );
              setUploadProgress((prev) => ({
                ...(prev || { filename: selectedImage.name }),
                status: "error",
                error: statusData.error || "Proof generation failed",
              }));

              // Clear the polling interval
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            } else {
              setUploadProgress((prev) => ({
                ...(prev || { filename: selectedImage.name }),
                status: "processing",
                progress: statusData.progress,
                lastUpdated: Date.now(),
                isStalled: false,
              }));
            }
          } catch (error) {
            console.error(
              "[FileUploadSection] ❌ Error polling status:",
              error
            );
          }
        };

        // Poll immediately and then set interval
        pollStatus();
        pollIntervalRef.current = setInterval(pollStatus, 3000);
      } else {
        // If no job ID, just consider it done and refresh the pieces
        onUploadSuccess();

        // Reset the upload state after a delay
        setTimeout(() => {
          setUploadProgress({
            status: "complete",
            message: "Upload complete",
          });
          setSelectedImage(null);
          setPreviewUrl(null);
        }, 5000);
      }
    } catch (error) {
      // Clear the stall detection timer
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      console.error("[FileUploadSection] 💥 Upload caught error:", error);
      if (error instanceof Error) {
        // Only show error if not aborted
        if (error.name !== "AbortError") {
          setUploadProgress({
            status: "error",
            error: error.message,
            lastUpdated: Date.now(),
          });
          toast.error(`Upload failed: ${error.message}`);
        }
      }
    }
  };

  const renderUploadProgress = () => {
    if (!uploadProgress) return null;

    const getStatusText = () => {
      switch (uploadProgress.status) {
        case "uploading":
          return uploadProgress.isStalled
            ? "Upload seems to be taking longer than expected..."
            : "Uploading file...";
        case "processing":
          return "Processing and generating proof...";
        case "success":
          return "File uploaded successfully!";
        case "complete":
          return "File uploaded and proof generated!";
        case "error":
          return `Error: ${uploadProgress.error || "Something went wrong"}`;
        default:
          return "Processing...";
      }
    };

    const getProgressBarColor = () => {
      switch (uploadProgress.status) {
        case "error":
          return "bg-red-500";
        case "success":
        case "complete":
          return "bg-green-500";
        case "processing":
          return "bg-blue-500";
        default:
          return "bg-blue-500";
      }
    };

    // Calculate progress width
    let progressWidth = "0%";
    if (uploadProgress.status === "uploading") {
      progressWidth = `${uploadProgress.progress || 0}%`;
    } else if (uploadProgress.status === "processing") {
      progressWidth = `${uploadProgress.progress || 50}%`;
    } else if (
      uploadProgress.status === "success" ||
      uploadProgress.status === "complete"
    ) {
      progressWidth = "100%";
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border rounded-lg p-4 mt-6 shadow-sm"
      >
        <div className="flex justify-between items-center mb-2">
          <div className="font-medium text-sm">{getStatusText()}</div>
          {(uploadProgress.status === "uploading" ||
            uploadProgress.status === "processing") && (
            <Button
              onClick={handleCancelUpload}
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 hover:bg-red-50 hover:text-red-600"
            >
              Cancel
            </Button>
          )}
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: progressWidth }}
            transition={{ duration: 0.5 }}
            className={`h-full ${getProgressBarColor()}`}
          ></motion.div>
        </div>

        {uploadProgress.message && (
          <div className="mt-2 text-sm text-gray-600">
            {uploadProgress.message}
          </div>
        )}

        {uploadProgress.cid && (
          <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded border break-all">
            CID: {uploadProgress.cid}
          </div>
        )}
      </motion.div>
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setSelectedImage(file);

    // Create preview URL for images
    if (file.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
  });

  return (
    <div className="space-y-4 mb-8">
      <Typography variant="h3" className="text-xl font-semibold mb-4">
        Upload New File
      </Typography>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1">
            <Typography variant="h4" className="text-lg font-medium mb-1">
              Add a file to storage
            </Typography>
            <Typography variant="muted" className="text-gray-500 text-sm">
              Upload any file to store it securely on the network with automated
              proof generation.
            </Typography>
          </div>
          <div className="flex space-x-2">
            {uploadProgress && (
              <Button
                onClick={handleCancelUpload}
                variant="outline"
                className="text-sm"
              >
                Cancel
              </Button>
            )}
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
                    <div className="w-72 h-48 rounded-md shadow-sm bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                                    <FileIcon filename={selectedImage.name} />
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
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                        d="M6 18L18 6M6 6l12 12"
                      ></path>
                    </svg>
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex flex-col items-center justify-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mt-4 flex text-gray-600">
                    <p className="text-center text-sm">
                      <span className="font-medium text-blue-600 hover:text-blue-500">
                        Click to browse
                      </span>{" "}
                      or drag and drop a file to upload
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Files are stored in the decentralized storage network
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {renderUploadProgress()}
      </div>
    </div>
  );
};

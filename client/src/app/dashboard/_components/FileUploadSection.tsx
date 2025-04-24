"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Typography } from "@/components/ui/typography";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { useUploadStore } from "@/store/upload-store";
import { Loader, AlertTriangle, ExternalLink } from "lucide-react";
import { CostBanner } from "./CostBanner";
import { formatFileSize } from "@/lib/utils";
import ChunkedUploader from "@/components/ChunkedUploader";

interface FileUploadProps {
  onUploadSuccess: () => void;
}

export const FileUploadSection: React.FC<FileUploadProps> = ({
  onUploadSuccess,
}) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileSizeGB, setFileSizeGB] = useState<number>(0);
  const router = useRouter();
  const { proofSetReady, isLoading: isAuthLoading, userProofSetId } = useAuth();
  const { uploadProgress, setUploadProgress } = useUploadStore();
  const [useChunkedUpload, setUseChunkedUpload] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);

  const handleSubmitImage = async () => {
    if (!selectedImage) return;

    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login again.");
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

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

      uploadTimeoutRef.current = setTimeout(() => {
        setUploadProgress((prev) => ({
          ...(prev || { status: "uploading", filename: selectedImage.name }),
          isStalled: true,
        }));
      }, 30000);

      console.log(
        `[FileUploadSection] 🚀 Uploading ${selectedImage.name} to ${API_BASE_URL}/api/v1/upload`
      );

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.open("POST", `${API_BASE_URL}/api/v1/upload`, true);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100
            );
            setUploadProgress((prev) => ({
              ...(prev || {
                status: "uploading",
                filename: selectedImage.name,
              }),
              progress: percentComplete,
              lastUpdated: Date.now(),
              isStalled: false,
            }));

            if (uploadTimeoutRef.current) {
              clearTimeout(uploadTimeoutRef.current);
            }
            uploadTimeoutRef.current = setTimeout(() => {
              setUploadProgress((prev) => ({
                ...(prev || {
                  status: "uploading",
                  filename: selectedImage.name,
                }),
                isStalled: true,
              }));
            }, 30000);
          }
        };

        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as {
                status: string;
                progress: number;
                message?: string;
                cid?: string;
                jobId?: string;
                proofSetId?: string;
              };
              resolve(data);
            } catch {
              reject(new Error("Invalid JSON response"));
            }
          } else {
            let errorMessage = "Upload failed";
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage =
                errorData.message || errorData.error || errorMessage;
            } catch {
              errorMessage = xhr.responseText || errorMessage;
            }
            reject(new Error(errorMessage));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Upload request timed out"));

        xhr.onabort = () => {
          console.log("[FileUploadSection] Upload aborted");
          reject(new Error("AbortError"));
        };

        xhr.timeout = 3600000;

        xhr.send(formData);

        if (signal) {
          signal.addEventListener("abort", () => {
            xhr.abort();
          });
        }
      });

      const data = (await uploadPromise) as {
        status: string;
        progress: number;
        message?: string;
        cid?: string;
        jobId?: string;
        proofSetId?: string;
      };

      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      setUploadProgress({
        status: "success",
        cid: data.cid,
        message: "File uploaded successfully!",
        lastUpdated: Date.now(),
        jobId: data.jobId,
      });

      if (data.jobId) {
        setUploadProgress((prev) => ({
          ...(prev || { filename: selectedImage.name }),
          status: "processing",
        }));

        const pollStatus = async () => {
          try {
            const statusResponse = await fetch(
              `${API_BASE_URL}/api/v1/upload/status/${data.jobId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (!statusResponse.ok) {
              throw new Error("Failed to check proof status");
            }

            const statusData = await statusResponse.json();

            if (statusData.status === "complete") {
              setUploadProgress((prev) => ({
                ...(prev || { filename: selectedImage.name }),
                status: "complete",
                message: "File uploaded and proof generated!",
                serviceProofSetId: statusData.serviceProofSetId,
              }));

              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }

              onUploadSuccess();

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

              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            } else {
              setUploadProgress((prev) => ({
                ...(prev || { filename: selectedImage.name }),
                status: statusData.status,
                progress: statusData.progress,
                message: statusData.message,
                lastUpdated: Date.now(),
                isStalled: false,
                serviceProofSetId:
                  statusData.proofSetId || prev?.serviceProofSetId,
              }));
            }
          } catch (error) {
            console.error(
              "[FileUploadSection] ❌ Error polling status:",
              error
            );
          }
        };

        pollStatus();
        pollIntervalRef.current = setInterval(pollStatus, 3000);
      } else {
        onUploadSuccess();

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
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }

      console.error("[FileUploadSection] 💥 Upload caught error:", error);
      if (error instanceof Error) {
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
        case "adding_root":
          return `Adding file to proof set${
            uploadProgress.serviceProofSetId
              ? ` (${uploadProgress.serviceProofSetId})`
              : ""
          }...`;
        case "finalizing":
          return "Finalizing proof set registration...";
        case "success":
          return "File uploaded successfully!";
        case "complete":
          return "File uploaded and proof generated!";
        case "error":
          return `Error: ${uploadProgress.error || "Something went wrong"}`;
        case "pending":
          return "Waiting for proof set creation to complete...";
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
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed (jpg, png, gif, etc.)");
      return;
    }

    // const maxFileSize = 100 * 1024 * 1024;
    // if (file.size > maxFileSize) {
    //   toast.error(
    //     `File is too large. Maximum size is 100MB. Current size: ${formatFileSize(
    //       file.size
    //     )}`
    //   );
    //   return;
    // }

    setSelectedImage(file);
    setFileSizeGB(file.size / (1024 * 1024 * 1024));
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      maxFiles: 1,
      accept: {
        "image/*": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"],
      },
    });

  if (isAuthLoading) {
    return (
      <div className="space-y-4 mb-8 p-6 bg-white rounded-xl shadow-sm border flex items-center justify-center min-h-[200px]">
        <Loader className="animate-spin text-gray-400" size={24} />
        <Typography variant="muted" className="ml-2">
          Loading user status...
        </Typography>
      </div>
    );
  }

  function isUploadDisabled() {
    return !proofSetReady;
  }

  return (
    <div className="w-full space-y-4">
      <CostBanner fileSizeGB={fileSizeGB} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <Typography variant="h3" className="text-xl font-semibold">
          Upload New Image
        </Typography>
        {proofSetReady && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <a
              href={`http://explore-pdp.xyz:5173/proofsets/${userProofSetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border bg-background hover:text-accent-foreground h-10 px-4 py-2 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
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
              View Your Vault
              <ExternalLink className="h-3 w-3" />
            </a>
          </motion.div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1">
            <Typography variant="h4" className="text-lg font-medium mb-1">
              {proofSetReady ? "Add an image to storage" : "Proof Set Required"}
            </Typography>
            <Typography variant="muted" className="text-gray-500 text-sm">
              {proofSetReady
                ? "Upload any image file (JPG, PNG, GIF, etc.) to store it securely with automated proof generation."
                : "Please complete the payment setup to activate your proof set before uploading images."}
            </Typography>
          </div>
          <div className="flex space-x-2">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSubmitImage}
                disabled={!selectedImage || !proofSetReady || useChunkedUpload}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedImage ? "Upload Selected Image" : "Upload Image"}
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Upload mode toggle */}
        <div className="mt-4 mb-2 flex items-center justify-end">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Standard Upload</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={useChunkedUpload}
                onChange={() => setUseChunkedUpload(!useChunkedUpload)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <span className="text-sm text-gray-500">Large File Upload</span>
          </div>
        </div>

        {useChunkedUpload ? (
          <div className="mt-6">
            <ChunkedUploader
              onUploadSuccess={() => {
                onUploadSuccess();
              }}
              accept="image/*"
              maxFileSize={10 * 1024 * 1024 * 1024}
              chunkSize={5 * 1024 * 1024}
            />
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`text-center p-8 rounded-xl border-2 border-dashed transition-all duration-300 mt-6 ${
              proofSetReady
                ? "cursor-pointer"
                : "cursor-not-allowed bg-gray-50 opacity-70"
            } ${
              isDragActive
                ? "border-blue-500 bg-blue-50 scale-[1.01]"
                : selectedImage
                ? "border-green-500 bg-green-50"
                : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
            }`}
            onClick={(e) => !proofSetReady && e.stopPropagation()}
          >
            <input {...getInputProps()} disabled={!proofSetReady} />
            <AnimatePresence mode="wait">
              {!proofSetReady ? (
                <motion.div
                  key="proof-set-required"
                  className="flex flex-col items-center justify-center text-gray-500"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <AlertTriangle size={40} className="mb-3 text-orange-400" />
                  <Typography
                    variant="h4"
                    className="font-medium text-orange-600 mb-1"
                  >
                    Proof Set Required
                  </Typography>
                  <Typography variant="muted" className="text-sm">
                    Go to the{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        router.push("/dashboard?tab=payment");
                      }}
                      className="text-blue-500 hover:underline font-medium"
                    >
                      Payment Setup
                    </a>{" "}
                    tab to complete the required steps.
                  </Typography>
                </motion.div>
              ) : selectedImage ? (
                <motion.div
                  key="preview"
                  className="relative mx-auto flex flex-col items-center"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-2 text-base font-medium text-gray-700">
                    Image Preview
                  </div>
                  <div className="relative max-w-md overflow-hidden">
                    <Image
                      src={previewUrl!}
                      alt="Preview"
                      className="block max-h-48 w-auto h-auto rounded-md shadow-sm object-contain bg-white"
                      width={0}
                      height={0}
                      sizes="100vw"
                    />
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(null);
                        setPreviewUrl(null);
                        setFileSizeGB(0);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors leading-none shadow-sm"
                      aria-label="Remove image"
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
                  <div className="mt-4 text-sm text-gray-600">
                    {formatFileSize(selectedImage.size)}
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
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </motion.div>
                  <Typography
                    variant="body"
                    className={`${
                      isUploadDisabled()
                        ? "text-gray-500"
                        : isDragActive
                        ? "text-blue-600 font-medium"
                        : "text-gray-700"
                    } transition-colors duration-300 mb-1`}
                  >
                    {isDragActive
                      ? "Drop image here"
                      : "Drag and drop an image, or click to select"}
                  </Typography>
                  <Typography variant="small" className="text-gray-400">
                    Supports JPG, PNG, GIF, WebP, and other image formats
                  </Typography>
                  {fileRejections.length > 0 && (
                    <Typography variant="small" className="text-red-500 mt-2">
                      Only image files are allowed
                    </Typography>
                  )}
                  <Typography variant="small" className="text-gray-400 mt-3">
                    For files larger than 100MB, use the &quot;Large File
                    Upload&quot; option
                  </Typography>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {proofSetReady && !useChunkedUpload && renderUploadProgress()}
      </div>
    </div>
  );
};

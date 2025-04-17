"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

interface UploadResponse {
  cid: string;
  size: number;
  status: string;
  message?: string;
}

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

interface RailsTabProps {
  isLoading: boolean;
}

export const RailsTab: React.FC<RailsTabProps> = ({
  isLoading: initialLoading,
}) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [uploadProgress, setUploadProgress] = useState<{
    status: string;
    progress?: number;
    message?: string;
    cid?: string;
    error?: string;
  } | null>(null);

  const fetchPieces = async () => {
    try {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`${API_BASE_URL}/pieces`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch pieces");
      }

      const data = await response.json();
      setPieces(data);
    } catch (error) {
      console.error(
        "[RailsTab.tsx:fetchPieces] ❌ Error fetching pieces:",
        error
      );
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

  const handleSubmitImage = async () => {
    if (!selectedImage) return;

    const formData = new FormData();
    formData.append("file", selectedImage);

    try {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      setUploadProgress({ status: "uploading", progress: 0 });

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Upload failed";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error(
            "[RailsTab.tsx:handleSubmitImage] Failed to parse error response:",
            errorText
          );
        }
        throw new Error(errorMessage);
      }

      try {
        const data = await response.json();
        console.log(
          "[RailsTab.tsx:handleSubmitImage] 📊 Upload response:",
          data
        );

        if (data.status === "complete" || data.cid) {
          console.log(
            "[RailsTab.tsx:handleSubmitImage] ✅ Upload complete! CID:",
            data.cid
          );
          setSelectedImage(null);
          setPreviewUrl(null);
          setUploadProgress(null);
          // Refresh the pieces list
          fetchPieces();
        } else if (data.status === "error") {
          console.error(
            "[RailsTab.tsx:handleSubmitImage] ❌ Upload error:",
            data.error
          );
          throw new Error(data.error || "Upload failed");
        }

        // Update progress if available
        if (data.progress !== undefined) {
          setUploadProgress({
            status: data.status || "uploading",
            progress: data.progress,
            message: data.message,
            cid: data.cid,
          });
        }
      } catch (error) {
        console.error(
          "[RailsTab.tsx:handleSubmitImage] ❌ Error parsing response:",
          error
        );
        const rawResponse = await response.text();
        console.error(
          "[RailsTab.tsx:handleSubmitImage] ❌ Raw response:",
          rawResponse
        );
        throw new Error("Failed to parse server response");
      }
    } catch (error) {
      console.error(
        "[RailsTab.tsx:handleSubmitImage] ❌ Error uploading image:",
        error
      );
      setUploadProgress({
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  };

  // Add progress indicator UI
  const renderUploadProgress = () => {
    if (!uploadProgress) return null;

    return (
      <div className="mt-4">
        {uploadProgress.status === "error" ? (
          <div className="text-red-500">Error: {uploadProgress.error}</div>
        ) : (
          <div>
            <div className="text-sm text-gray-600">
              Status: {uploadProgress.status}
            </div>
            {uploadProgress.message && (
              <div className="text-sm text-gray-500">
                {uploadProgress.message}
              </div>
            )}
            {uploadProgress.progress !== undefined && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${uploadProgress.progress}%` }}
                ></div>
              </div>
            )}
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
      key="rails"
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
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-64 mx-auto rounded-lg shadow-sm"
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

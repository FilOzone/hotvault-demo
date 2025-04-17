"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState, useCallback } from "react";
import Skeleton from "react-loading-skeleton";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "@/lib/constants";

interface UploadResponse {
  cid: string;
  size: number;
  status: string;
  message?: string;
}

interface RailsTabProps {
  isLoading: boolean;
}

export const RailsTab: React.FC<RailsTabProps> = ({ isLoading }) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    status: string;
    progress?: number;
    message?: string;
    cid?: string;
    error?: string;
  } | null>(null);

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
      // Get the JWT token from localStorage
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        throw new Error("Authentication required");
      }

      console.log("🚀 Starting image upload...");
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Upload failed:", errorData);
        throw new Error(errorData.error || "Upload failed");
      }

      // Handle Server-Sent Events for progress updates
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Convert the Uint8Array to a string
        const text = new TextDecoder().decode(value);
        const lines = text.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log("📊 Upload progress:", data);
              setUploadProgress(data);

              if (data.status === "complete") {
                console.log("✅ Upload complete! CID:", data.cid);
                setSelectedImage(null);
                setPreviewUrl(null);
                setUploadProgress(null);
              } else if (data.status === "error") {
                console.error("❌ Upload error:", data.error);
                throw new Error(data.error);
              }
            } catch (e) {
              console.error("❌ Error parsing progress data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("❌ Error uploading image:", error);
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

  return (
    <motion.div
      key="rails"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <Typography variant="h2" className="text-xl font-mono">
            Upload Image
          </Typography>
          <Typography variant="body" className="text-gray-500 mt-1">
            Upload images to IPFS
          </Typography>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSubmitImage}
            disabled={!selectedImage}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Image
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-xl border border-gray-200">
              <Skeleton height={100} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            {...getRootProps()}
            className={`text-center py-12 rounded-xl border-2 border-dashed ${
              isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200"
            } transition-colors duration-200 cursor-pointer`}
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
        </>
      )}
    </motion.div>
  );
};

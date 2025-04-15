"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { TokenData } from "@/contracts";
import { Rail } from "@/types/dashboard";
import { useState, useCallback } from "react";
import Skeleton from "react-loading-skeleton";
import { RailDetailsModal } from "@/app/dashboard/_components/RailDetailsModal";
import { RailCreationModal } from "@/app/dashboard/_components/RailCreationModal";
import { useDropzone } from "react-dropzone";

interface RailsTabProps {
  isLoading: boolean;
  rails: Rail[];
  userTokens: TokenData[];
  handleCreateRail: (params: {
    token: string;
    to: string;
    arbiter?: string;
  }) => Promise<void>;
  handleTerminate: (rail: Rail) => Promise<void>;
}

export const RailsTab: React.FC<RailsTabProps> = ({
  isLoading,
  rails,
  userTokens,
  handleCreateRail,
  handleTerminate,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);
  const [activeView, setActiveView] = useState<"active" | "terminated">(
    "active"
  );
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const activeRails = rails.filter((rail) => !rail.terminationEpoch);
  const terminatedRails = rails.filter((rail) => rail.terminationEpoch);

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
    formData.append("image", selectedImage);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Reset the form after successful upload
      setSelectedImage(null);
      setPreviewUrl(null);
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  const handleCreateRailSubmit = async (
    token: string,
    recipient: string,
    arbiter: string
  ) => {
    await handleCreateRail({
      token,
      to: recipient,
      arbiter: arbiter || undefined,
    });
  };

  const handleTerminateRail = async (railId: string) => {
    const rail = rails.find((r) => r.id.toString() === railId);
    if (rail) {
      await handleTerminate(rail);
    }
  };

  const formatEpochDuration = (epochs: bigint): string => {
    const epochsNum = Number(epochs);
    if (epochsNum === 0) return "0 epochs";
    if (epochsNum === 1) return "1 epoch";
    return `${epochsNum} epochs`;
  };

  const RailCard = ({ rail, index }: { rail: Rail; index: number }) => (
    <motion.div
      key={rail.id}
      className={`p-6 rounded-xl border transition-all cursor-pointer ${
        rail.terminationEpoch
          ? "border-gray-200 hover:border-red-200 bg-gray-50"
          : "border-gray-200 hover:border-blue-200"
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{
        y: -2,
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
      onClick={() => setSelectedRail(rail)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Typography variant="h3" className="text-lg font-mono truncate">
              Rail #{rail.id}
            </Typography>
            {rail.terminationEpoch && (
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-600 rounded-full">
                Terminated
              </span>
            )}
            {!rail.terminationEpoch && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-600 rounded-full">
                Active
              </span>
            )}
          </div>
          <Typography variant="small" className="text-gray-500 truncate">
            {rail.token}
          </Typography>
        </div>
        <div className="flex flex-col items-end flex-shrink-0 ml-4">
          <Typography variant="small" className="font-mono text-base">
            {rail.paymentRate.toString()} / epoch
          </Typography>
          <Typography variant="small" className="text-gray-500 text-sm">
            Settled up to: {rail.settledUpTo.toString()}
          </Typography>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            From:
          </Typography>
          <Typography
            variant="small"
            className="font-mono text-sm truncate max-w-[200px]"
          >
            {rail.from}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            To:
          </Typography>
          <Typography
            variant="small"
            className="font-mono text-sm truncate max-w-[200px]"
          >
            {rail.to}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            Lockup Period:
          </Typography>
          <Typography variant="small" className="font-mono text-sm">
            {formatEpochDuration(rail.lockupPeriod)}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            Fixed Lockup:
          </Typography>
          <Typography variant="small" className="font-mono text-sm">
            {rail.lockupFixed.toString()}
          </Typography>
        </div>
        {rail.terminationEpoch && (
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
            <Typography variant="small" className="text-gray-500">
              Terminated at:
            </Typography>
            <Typography
              variant="small"
              className="font-mono text-sm text-red-600"
            >
              Epoch {rail.terminationEpoch.toString()}
            </Typography>
          </div>
        )}
      </div>
    </motion.div>
  );

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
            Upload images to the blockchain
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
      )}

      <RailCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tokens={userTokens}
        onSubmit={handleCreateRailSubmit}
      />

      {selectedRail && (
        <RailDetailsModal
          isOpen={!!selectedRail}
          onClose={() => setSelectedRail(null)}
          rail={selectedRail}
          tokens={userTokens}
          onTerminate={handleTerminateRail}
        />
      )}
    </motion.div>
  );
};

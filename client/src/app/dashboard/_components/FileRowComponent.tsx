"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { Download, Trash2 } from "lucide-react";

import { FileIcon } from "./FileIcon";
import { Piece } from "./types";

interface FileRowProps {
  piece: Piece;
  index: number;
  formatFileSize: (bytes: number) => string;
  handleDownload: (piece: Piece) => void;
  handleRemoveRoot: (piece: Piece) => void;
  openProofDetails: (piece: Piece) => void;
  downloadsInProgress: {
    [cid: string]: boolean;
  };
}

const tableRowVariants = {
  hidden: { opacity: 0, x: -5 },
  visible: (custom: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: custom * 0.05, duration: 0.2 },
  }),
};

export const FileRowComponent: React.FC<FileRowProps> = ({
  piece,
  index,
  formatFileSize,
  handleDownload,
  handleRemoveRoot,
  openProofDetails,
  downloadsInProgress,
}) => {
  const isPendingRemoval = piece.pendingRemoval;
  const isDownloading = downloadsInProgress[piece.cid];
  const hasProof =
    piece.serviceProofSetId !== undefined && piece.serviceProofSetId !== null;
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
            <FileIcon filename={piece.filename} />
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
              Proof Available
            </div>
            <button
              onClick={() => openProofDetails(piece)}
              className="ml-2 text-xs text-blue-600 hover:underline flex items-center"
              title="View proof details"
            >
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Details
            </button>
          </div>
        ) : (
          <span className="text-gray-400 text-xs italic">None</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleDownload(piece)}
            disabled={isDownloading}
            className={`text-blue-600 hover:text-blue-900 ${
              isDownloading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            title="Download file"
          >
            <Download className="h-5 w-5" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleRemoveRoot(piece)}
            className="text-red-600 hover:text-red-900"
            title="Remove file"
          >
            <Trash2 className="h-5 w-5" />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
};

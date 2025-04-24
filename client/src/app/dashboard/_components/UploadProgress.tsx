import { AlertTriangle, ExternalLink } from "lucide-react";
import { statusColors, getStatusText } from "@/lib/constants";

interface UploadProgressProps {
  uploadProgress: {
    status: string;
    progress?: number;
    message?: string;
    isStalled?: boolean;
    error?: string;
    filename?: string;
    serviceProofSetId?: string;
    cid?: string;
  } | null;
  onCancel?: () => void;
  hasActiveAbortController?: boolean;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  uploadProgress,
  onCancel,
  hasActiveAbortController,
}) => {
  if (!uploadProgress) return null;

  const statusColor =
    statusColors[uploadProgress.status as keyof typeof statusColors] ||
    statusColors.uploading;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 shadow-lg rounded-lg overflow-hidden">
      <div className={`p-4 ${statusColor}`}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium">
              {uploadProgress.isStalled && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span>{getStatusText(uploadProgress.status)}</span>
              {uploadProgress.status !== "complete" &&
                uploadProgress.status !== "error" &&
                uploadProgress.status !== "cancelled" &&
                hasActiveAbortController && (
                  <button
                    onClick={onCancel}
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
                      Watch this important video while we get your data on FWS
                    </span>
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
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
    </div>
  );
};

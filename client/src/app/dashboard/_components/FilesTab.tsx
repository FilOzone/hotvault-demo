"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import type { ReactElement } from "react";
import { useDropzone } from "react-dropzone";
import { API_BASE_URL } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Download,
  Trash2,
  ExternalLink,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatFileSize, getFilePreviewType } from "@/lib/utils";
import { useUpload } from "@/hooks/useUpload";
import { useUploadStore } from "@/store/upload-store";
import { UploadProgress } from "@/components/ui/upload-progress";
import { useAuth } from "@/contexts/AuthContext";
import { usePayment } from "@/contexts/PaymentContext";
import { UPLOAD_COMPLETED_EVENT } from "@/components/ui/global-upload-progress";
import { ROOT_REMOVED_EVENT } from "./PaymentBalanceHeader";
import { CostBanner } from "./CostBanner";
import { BALANCE_UPDATED_EVENT } from "@/contexts/PaymentContext";

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
  proofSetDbId?: number;
  serviceProofSetId?: string;
  rootId?: string;
}

interface FilesTabProps {
  isLoading: boolean;
  onTabChange?: (tab: string) => void;
}

interface DownloadError extends Error {
  options?: string[];
}

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

type ProofSetStatus = "none" | "creating" | "ready" | "generating";

export const FilesTab = ({
  isLoading: initialLoading,
  onTabChange,
}: FilesTabProps): ReactElement => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [authError, setAuthError] = useState<string | null>(null);
  const [downloadsInProgress, setDownloadsInProgress] = useState<{
    [cid: string]: boolean;
  }>({});
  const [fileSizeGB, setFileSizeGB] = useState<number>(0);
  // Add a timestamp to trigger re-renders when payment status is refreshed
  const [lastPaymentRefresh, setLastPaymentRefresh] = useState<number>(
    Date.now()
  );

  const { disconnectWallet, userProofSetId, updateUserProofSetId } = useAuth();
  const { refreshPaymentSetupStatus } = usePayment();

  const [isProofDialogOpen, setIsProofDialogOpen] = useState(false);
  const [selectedProof, setSelectedProof] = useState<{
    pieceId: number;
    pieceFilename: string;
    serviceProofSetId: string;
    cid: string;
    rootId?: string;
  } | null>(null);

  const [proofSetStatus, setProofSetStatus] = useState<ProofSetStatus>(
    userProofSetId ? "ready" : "none"
  );

  const fetchProofs = useCallback(async () => {
    try {
      if (userProofSetId) {
        console.log(
          "[FilesTab] Using existing userProofSetId:",
          userProofSetId
        );
        setProofSetStatus("ready");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/status`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        console.log(
          "[FilesTab] Auth status response 401:",
          await response.json()
        );
        setAuthError("Your session has expired. Please login again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        console.log("[FilesTab] Auth status response not OK:", data);
        if (data.error?.includes("Proof set not found")) {
          setProofSetStatus("none");
        } else {
          console.warn(
            `[FilesTab.tsx:fetchProofs] Failed to fetch proofs: ${response.statusText}`
          );
          // Keep the current status instead of assuming "creating"
          return;
        }
        return;
      }

      const data = await response.json();
      console.log("[FilesTab] Auth status response:", data);

      // Check the auth status response for proof set state
      if (data.proofSetReady) {
        console.log("[FilesTab] Setting proof set status to ready");
        setProofSetStatus("ready");

        // Make a separate call to get the proof set ID
        try {
          const proofSetResponse = await fetch(
            `${API_BASE_URL}/api/v1/proofset/id`,
            {
              method: "GET",
              credentials: "include",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            }
          );

          if (proofSetResponse.ok) {
            const proofSetData = await proofSetResponse.json();
            console.log("[FilesTab] Proof set data:", proofSetData);
            if (proofSetData.proofSetId) {
              console.log(
                "[FilesTab] Found proofSetId:",
                proofSetData.proofSetId
              );
              updateUserProofSetId(proofSetData.proofSetId);
            }
          } else {
            console.warn(
              "[FilesTab] Failed to fetch proof set ID:",
              proofSetResponse.statusText
            );
          }
        } catch (error) {
          console.error("[FilesTab] Error fetching proof set ID:", error);
        }
      } else if (data.proofSetInitiated) {
        console.log("[FilesTab] Setting proof set status to creating");
        setProofSetStatus("creating");
      } else {
        console.log("[FilesTab] Setting proof set status to none");
        setProofSetStatus("none");
      }

      // Update pieces with proof data if available
      if (data.pieces) {
        console.log("[FilesTab] Updating pieces with proof data:", data.pieces);
        setPieces((prevPieces) =>
          prevPieces.map((piece) => {
            const pieceWithProof = data.pieces.find(
              (p: Piece) => p.id === piece.id
            );
            if (pieceWithProof?.proofSetDbId) {
              return {
                ...piece,
                proofSetDbId: pieceWithProof.proofSetDbId,
                rootId: pieceWithProof.rootId,
              };
            }
            return piece;
          })
        );
      }
    } catch (error) {
      console.warn(
        "[FilesTab.tsx:fetchProofs] Error checking proof status:",
        error
      );
    }
  }, [
    userProofSetId,
    setProofSetStatus,
    setAuthError,
    setPieces,
    updateUserProofSetId,
  ]);

  useEffect(() => {
    if (userProofSetId) {
      setProofSetStatus("ready");
    }
  }, [userProofSetId]);

  useEffect(() => {
    if (proofSetStatus === "creating" && pieces.length > 0 && !userProofSetId) {
      const proofCheckInterval = setInterval(() => {
        console.log("[FilesTab.tsx] Checking if proof sets are ready...");
        fetchProofs();
      }, 15000);

      return () => clearInterval(proofCheckInterval);
    }
  }, [proofSetStatus, pieces.length, userProofSetId, fetchProofs]);

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

      // Refresh payment status after successfully fetching pieces
      try {
        await refreshPaymentSetupStatus();
        // Update last payment refresh timestamp to trigger re-renders
        setLastPaymentRefresh(Date.now());
        // Dispatch custom event to update balance in other components
        window.dispatchEvent(
          new CustomEvent(BALANCE_UPDATED_EVENT, {
            detail: {
              timestamp: Date.now(),
              action: "pieces_refreshed",
            },
          })
        );
        console.log(
          "[FilesTab.tsx:fetchPieces] Payment status refreshed successfully"
        );
      } catch (paymentError) {
        console.error(
          "[FilesTab.tsx:fetchPieces] Error refreshing payment status:",
          paymentError
        );
      }

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
  }, [refreshPaymentSetupStatus]);

  const {
    uploadFile,
    handleCancelUpload: cancelUpload,
    hasActiveUpload,
  } = useUpload(fetchPieces);
  const uploadProgress = useUploadStore((state) => state.uploadProgress);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        if (isMounted) {
          const data = await fetchPieces();
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

    // Handler for upload completion
    const handleUploadCompleted = () => {
      console.log(
        "[FilesTab] Detected upload completion, refreshing file list and payment status"
      );

      if (!isMounted) return;

      setIsLoading(true);

      fetchPieces()
        .then(() => {
          if (!isMounted) return;

          console.log(
            "[FilesTab] File list and payment status refreshed successfully after upload"
          );
          setIsLoading(false);

          // Update last payment refresh timestamp to trigger re-renders
          setLastPaymentRefresh(Date.now());

          // Display success message to user
          toast.success(
            "File uploaded successfully and payment information updated",
            {
              duration: 3000,
            }
          );

          setTimeout(() => {
            if (!isMounted) return;
            refreshPaymentSetupStatus()
              .then(() => {
                setLastPaymentRefresh(Date.now());
                console.log("[FilesTab] Second balance refresh completed");

                setTimeout(() => {
                  if (!isMounted) return;
                  refreshPaymentSetupStatus()
                    .then(() => {
                      setLastPaymentRefresh(Date.now());
                      console.log("[FilesTab] Third balance refresh completed");
                    })
                    .catch((e) =>
                      console.log("[FilesTab] Error in third refresh:", e)
                    );
                }, 2000);
              })
              .catch((e) =>
                console.log("[FilesTab] Error in second refresh:", e)
              );
          }, 1000);
        })
        .catch((error: Error) => {
          if (!isMounted) return;

          console.error(
            "[FilesTab] Error refreshing data after upload:",
            error
          );
          setIsLoading(false);

          refreshPaymentSetupStatus()
            .then(() => {
              setLastPaymentRefresh(Date.now());

              setTimeout(() => {
                if (!isMounted) return;
                refreshPaymentSetupStatus()
                  .then(() => setLastPaymentRefresh(Date.now()))
                  .catch((e) =>
                    console.error("[FilesTab] Error in fallback refresh:", e)
                  );
              }, 2000);
            })
            .catch((e: Error) =>
              console.error("[FilesTab] Failed to refresh payment status:", e)
            );
        });
    };

    const handleBalanceUpdated = () => {
      console.log("[FilesTab] Balance updated detected, triggering re-render");
      setLastPaymentRefresh(Date.now());
    };

    // Add visibility change handler to refresh data when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log(
          "[FilesTab] Tab became visible, refreshing balance and file data"
        );

        // Refresh payment status first
        refreshPaymentSetupStatus()
          .then(() => {
            // Then refresh pieces data
            return fetchPieces();
          })
          .then(() => {
            // Update the timestamp to trigger re-renders
            setLastPaymentRefresh(Date.now());

            // Dispatch custom event to update balance in other components
            window.dispatchEvent(
              new CustomEvent(BALANCE_UPDATED_EVENT, {
                detail: {
                  timestamp: Date.now(),
                  action: "visibility_change",
                },
              })
            );
            console.log("[FilesTab] Data refreshed after tab became visible");
          })
          .catch((error) => {
            console.error(
              "[FilesTab] Error refreshing data on visibility change:",
              error
            );
          });
      }
    };

    window.addEventListener(UPLOAD_COMPLETED_EVENT, handleUploadCompleted);
    window.addEventListener(BALANCE_UPDATED_EVENT, handleBalanceUpdated);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener(UPLOAD_COMPLETED_EVENT, handleUploadCompleted);
      window.removeEventListener(BALANCE_UPDATED_EVENT, handleBalanceUpdated);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authError, fetchPieces, fetchProofs, refreshPaymentSetupStatus]);

  useEffect(() => {
    const firstPieceWithProof = pieces.find(
      (p) => p.proofSetDbId !== null && p.proofSetDbId !== undefined
    );
    const derivedProofSetId = firstPieceWithProof?.serviceProofSetId || null;

    if (derivedProofSetId !== userProofSetId) {
      if (derivedProofSetId) {
        console.log(
          `[FilesTab.tsx] Found piece with different Proof Set ID: ${derivedProofSetId} (Piece ID: ${firstPieceWithProof?.id})`
        );
      } else {
        console.log("[FilesTab.tsx] No pieces with Proof Set ID found.");
      }
    } else {
      console.log(
        `[FilesTab.tsx] Proof Set ID check: Current ID (${userProofSetId}) matches pieces. Found piece ID: ${firstPieceWithProof?.id}`
      );
    }
  }, [pieces, userProofSetId]);

  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [pieceToRemove, setPieceToRemove] = useState<Piece | null>(null);

  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) {
        setAuthError("Authentication required. Please login again.");
      } else {
        if (authError) setAuthError(null);
      }
    };

    checkToken();

    const tokenInterval = setInterval(checkToken, 60000);

    return () => {
      clearInterval(tokenInterval);
    };
  }, [authError]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // Check file size (99MB limit)
    // const maxFileSize = 99 * 1024 * 1024; // 99MB in bytes
    // if (file.size > maxFileSize) {
    //   toast.error(
    //     `File is too large. Maximum size is 99MB. Current size: ${formatFileSize(
    //       file.size
    //     )}`
    //   );
    //   return;
    // }

    setSelectedImage(file);

    const sizeInGB = file.size / (1024 * 1024 * 1024);
    setFileSizeGB(Number(sizeInGB.toFixed(6)));

    if (file.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const isUploadDisabled = useCallback(() => {
    if (proofSetStatus === "none" && pieces.length === 0) {
      return true;
    }
    if (proofSetStatus === "creating") {
      return true;
    }
    return false;
  }, [proofSetStatus, pieces.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: isUploadDisabled(),
  });

  const handleSubmitImage = async () => {
    if (!selectedImage) return;

    try {
      await uploadFile(selectedImage);
      setSelectedImage(null);
      setPreviewUrl(null);
    } catch (error) {
      console.error("[FilesTab] Upload failed:", error);
    }
  };

  const handleDownload = (piece: Piece) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      toast.error("Authentication required. Please login to download files");
      return;
    }

    setDownloadsInProgress((prev) => ({
      ...prev,
      [piece.cid]: true,
    }));

    toast.info(`Preparing ${piece.filename} for download...`);

    const encodedCid = encodeURIComponent(piece.cid);

    downloadWithMethod(piece, encodedCid, false)
      .catch((error) => {
        console.error(
          "[FilesTab.tsx:handleDownload] Error with direct download:",
          error
        );

        if (
          error.message &&
          (error.message.includes("pdptool not found") ||
            error.message.includes("Failed to download file"))
        ) {
          toast.info("Direct download failed. Trying IPFS gateway...");
          return downloadWithMethod(piece, encodedCid, true);
        }
        throw error;
      })
      .catch((error) => {
        console.error(
          "[FilesTab.tsx:handleDownload] Error with gateway download:",
          error
        );
        handleDownloadError(piece, error);
      });
  };

  const downloadWithMethod = (
    piece: Piece,
    encodedCid: string,
    useGateway: boolean
  ) => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      return Promise.reject(new Error("Authentication required"));
    }

    const url = useGateway
      ? `${API_BASE_URL}/api/v1/download/${encodedCid}?gateway=true`
      : `${API_BASE_URL}/api/v1/download/${encodedCid}`;

    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          let errorMessage = `Download failed: ${response.statusText}`;
          let errorOptions: string[] = [];

          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
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
            }
          } else {
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

        if (response.redirected) {
          window.open(response.url, "_blank");

          setDownloadsInProgress((prev) => {
            const newState = { ...prev };
            delete newState[piece.cid];
            return newState;
          });

          toast.success(
            `${piece.filename} opened in new tab from IPFS gateway`
          );
          return null;
        }

        return response.blob();
      })
      .then((blob) => {
        if (!blob) return;

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", piece.filename);
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);

        toast.success(`${piece.filename} downloaded successfully`, {
          duration: 3000,
        });

        setDownloadsInProgress((prev) => {
          const newState = { ...prev };
          delete newState[piece.cid];
          return newState;
        });
      });
  };

  const handleDownloadError = (piece: Piece, error: DownloadError) => {
    const options = error.options || [];
    const cid = piece.cid.split(":")[0];

    if (options.length > 0) {
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
              const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
              window.open(gatewayUrl, "_blank");

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
      toast.error(error.message || "Download failed");
    }

    setDownloadsInProgress((prev) => {
      const newState = { ...prev };
      delete newState[piece.cid];
      return newState;
    });
  };

  const handleRemoveRoot = (piece: Piece) => {
    setPieceToRemove(piece);
    setIsRemoveDialogOpen(true);
  };

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

      toast.success("Root removed and file deleted successfully");

      // Update the local state to remove the piece immediately
      setPieces((prevPieces) =>
        prevPieces.filter((p) => p.id !== pieceToRemove.id)
      );

      // Dispatch the ROOT_REMOVED_EVENT to trigger balance refresh
      window.dispatchEvent(new Event(ROOT_REMOVED_EVENT));

      // Refresh payment data and notify components
      try {
        await refreshPaymentSetupStatus();

        // Update the timestamp to force re-renders
        setLastPaymentRefresh(Date.now());

        // Dispatch custom event to update balance in other components
        window.dispatchEvent(
          new CustomEvent(BALANCE_UPDATED_EVENT, {
            detail: {
              timestamp: Date.now(),
              action: "root_removed",
            },
          })
        );

        console.log(
          "[FilesTab.tsx:submitRemoveRoot] Payment status refreshed successfully"
        );
      } catch (paymentError) {
        console.error(
          "[FilesTab.tsx:submitRemoveRoot] Error refreshing payment status:",
          paymentError
        );
      }

      // Close dialog
      setIsRemoveDialogOpen(false);
      setPieceToRemove(null);
    } catch (error) {
      console.error("[FilesTab.tsx:submitRemoveRoot] Error:", error);
      toast.error(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const openProofDetails = (piece: Piece) => {
    if (piece.serviceProofSetId === undefined) {
      console.warn(
        "Attempted to open proof details for piece without serviceProofSetId:",
        piece.id
      );
      toast.error("Proof Set ID not available for this piece.");
      return;
    }

    setSelectedProof({
      pieceId: piece.id,
      pieceFilename: piece.filename,
      serviceProofSetId: piece.serviceProofSetId, // Use service ID
      cid: piece.cid,
      rootId: piece.rootId, // Include rootId when available
    });
    setIsProofDialogOpen(true);
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";

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

  const renderPieceRow = (piece: Piece, index: number) => {
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
                {/* Display serviceProofSetId */}
                Set #{piece.serviceProofSetId}
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
                  onClick={() => {
                    handleDownload(piece);
                  }}
                  disabled={isDownloading}
                  className="h-8 flex items-center transition-all duration-200 hover:text-blue-600"
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span>Download</span>
                </Button>
              </motion.div>

              {hasProof && (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openProofDetails(piece)}
                    className="h-8 flex items-center transition-all duration-200 hover:text-blue-600"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    <span>Details</span>
                  </Button>
                </motion.div>
              )}

              {!isPendingRemoval && (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRoot(piece)}
                    disabled={piece.pendingRemoval}
                    className="h-8 flex items-center transition-all duration-200 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span>Remove</span>
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </td>
      </motion.tr>
    );
  };

  const renderProofSetStatusBanner = () => {
    console.log(
      "[FilesTab] Rendering banner - status:",
      proofSetStatus,
      "pieces:",
      pieces.length
    );

    if (proofSetStatus === "none" && pieces.length === 0) {
      console.log("[FilesTab] Showing 'Proof Set Required' banner");
      return (
        <motion.div
          className="mb-6 p-4 bg-blue-100 border border-blue-100 rounded-lg text-blue-700 flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex-1">
            <p className="font-medium mb-1">Please Setup a Vault</p>
            <p className="text-sm">
              You need to setup a Vault in the Payment setup tab before you can
              upload files. This is a one time setup to onboard you to HotVault.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                onTabChange?.("payment");
              }}
            >
              Go to Vault Setup
            </Button>
          </div>
        </motion.div>
      );
    }

    if (proofSetStatus === "creating") {
      console.log("[FilesTab] Showing 'Proof Set Creating' banner");
      return (
        <motion.div
          className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex-shrink-0 bg-blue-100 p-2 rounded-full">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
          <div className="flex-1">
            <p className="font-medium mb-1">Proof Set Creation in Progress</p>
            <p className="text-sm">
              Your proof set is being created on FWS. This process typically
              takes few minutesto complete. During this time, uploads are
              disabled until the proof set creation is finalized.
            </p>
          </div>
        </motion.div>
      );
    }

    console.log("[FilesTab] No banner shown");
    return null;
  };

  const getDropzoneMessage = () => {
    if (proofSetStatus === "none" && pieces.length === 0) {
      return "Create a proof set in Payment Setup before uploading";
    }
    if (proofSetStatus === "creating") {
      return "Uploads disabled while proof set is being created";
    }
    return isDragActive
      ? "Drop to upload"
      : "Drag and drop any file here, or click to select";
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
              onClick={disconnectWallet}
            >
              Login Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {renderProofSetStatusBanner()}

      {proofSetStatus === "ready" && (
        <div className="mb-6 flex justify-end">
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
        </div>
      )}

      {proofSetStatus === "ready" && (
        <CostBanner
          fileSizeGB={fileSizeGB}
          existingFiles={pieces.map((piece) => ({
            id: piece.id,
            filename: piece.filename,
            size: piece.size,
          }))}
          key={`cost-banner-${lastPaymentRefresh}`} // Add this key to force re-rendering
        />
      )}

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
            <Typography
              variant="small"
              className="text-gray-500 mt-1 flex items-center gap-2"
            >
              Upload, manage and share your files
            </Typography>
          </div>
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSubmitImage}
                disabled={isUploadDisabled() || !selectedImage}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploadDisabled()
                  ? "Upload Disabled (Create Vault First)"
                  : selectedImage
                  ? "Upload Selected File"
                  : "Select a File First"}
              </Button>
            </motion.div>
          </div>
        </div>

        <div
          {...getRootProps()}
          className={`text-center p-8 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer mb-6 ${
            isUploadDisabled()
              ? "border-gray-300 bg-gray-100 cursor-not-allowed"
              : isDragActive
              ? "border-blue-500 bg-blue-50 scale-[1.01]"
              : selectedImage
              ? "border-green-500 bg-green-50"
              : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          }`}
        >
          <input {...getInputProps()} />
          <AnimatePresence mode="wait">
            {isUploadDisabled() ? (
              <motion.div
                key="disabled"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="py-8 px-4 flex flex-col items-center"
              >
                <motion.div className="w-16 h-16 mb-4 rounded-full bg-gray-200 flex items-center justify-center transition-colors duration-300 border-2 border-gray-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </motion.div>
                <Typography
                  variant="body"
                  className="text-gray-500 transition-colors duration-300 mb-1"
                >
                  Uploads disabled
                </Typography>
                <Typography variant="small" className="text-gray-400">
                  Please wait for proof set creation to complete
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
                  Preview
                </div>
                <div className="relative max-w-md overflow-hidden">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      className="block max-h-48 w-auto h-auto rounded-md shadow-sm object-contain bg-white"
                      width={0}
                      height={0}
                      sizes="100vw"
                    />
                  ) : (
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
                      setFileSizeGB(0);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-200 text-red-700 rounded-full hover:bg-red-300 transition-colors leading-none shadow-sm"
                    aria-label="Remove file"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 className="w-4 h-4" />
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
                    isUploadDisabled()
                      ? "text-gray-500"
                      : isDragActive
                      ? "text-blue-600 font-medium"
                      : "text-gray-700"
                  } transition-colors duration-300 mb-1`}
                >
                  {getDropzoneMessage()}
                </Typography>
                <Typography variant="small" className="text-gray-400">
                  Accepts any file type
                </Typography>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <UploadProgress
          uploadProgress={uploadProgress}
          onCancel={cancelUpload}
          hasActiveAbortController={hasActiveUpload}
        />
      </motion.div>

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
                    {selectedProof.serviceProofSetId}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          selectedProof.serviceProofSetId || ""
                        );
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
                        ` http://explore-pdp.xyz:5173/proofsets/${selectedProof?.serviceProofSetId}`,
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
                    View Proof Set #{selectedProof?.serviceProofSetId}
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

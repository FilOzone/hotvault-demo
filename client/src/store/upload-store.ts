import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UploadProgress {
  status:
    | "starting"
    | "preparing"
    | "uploading"
    | "processing"
    | "success"
    | "finalizing"
    | "adding_root"
    | "complete"
    | "error"
    | "warning"
    | "cancelled";
  progress?: number;
  message?: string;
  cid?: string;
  error?: string;
  lastUpdated?: number;
  isStalled?: boolean;
  filename?: string;
  jobId?: string;
  serviceProofSetId?: string;
}

interface UploadStore {
  uploadProgress: UploadProgress | null;
  setUploadProgress: (
    progress: UploadProgress | ((prev: UploadProgress | null) => UploadProgress)
  ) => void;
  clearUploadProgress: () => void;
}

export const useUploadStore = create<UploadStore>()(
  persist(
    (set, get) => ({
      uploadProgress: null,
      setUploadProgress: (progress) => {
        const newProgress =
          typeof progress === "function"
            ? progress(get().uploadProgress)
            : progress;
        console.log("[UploadStore] Setting progress:", newProgress);

        // Check if the upload is stalled
        if (newProgress.lastUpdated) {
          const timeSinceLastUpdate = Date.now() - newProgress.lastUpdated;
          if (timeSinceLastUpdate > 10000) {
            // 10 seconds
            newProgress.isStalled = true;
          }
        }

        set({ uploadProgress: newProgress });
      },
      clearUploadProgress: () => {
        console.log("[UploadStore] Clearing progress");
        set({ uploadProgress: null });
      },
    }),
    {
      name: "upload-storage",
      partialize: (state) => ({ uploadProgress: state.uploadProgress }),
    }
  )
);

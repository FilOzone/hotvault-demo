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
    | "cancelled"
    | "retry"
    | "pending";
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

        if (
          newProgress &&
          (newProgress.status === "complete" ||
            newProgress.status === "success") &&
          newProgress.progress === 100
        ) {
          console.log(
            "[UploadStore] Complete status with 100% detected, forcing cleanup soon"
          );

          set({ uploadProgress: newProgress });
          setTimeout(() => {
            console.log(
              "[UploadStore] Force clearing progress after complete status"
            );
            if (typeof window !== "undefined") {
              localStorage.removeItem("upload-storage");
            }
            set({ uploadProgress: null });
          }, 250);
          return;
        }

        if (newProgress.lastUpdated) {
          const timeSinceLastUpdate = Date.now() - newProgress.lastUpdated;
          if (timeSinceLastUpdate > 10000) {
            newProgress.isStalled = true;
          }
        }

        set({ uploadProgress: newProgress });
      },
      clearUploadProgress: () => {
        console.log("[UploadStore] Clearing progress");
        if (typeof window !== "undefined") {
          const storageKey = "upload-storage";
          try {
            const storageData = localStorage.getItem(storageKey);
            if (storageData) {
              console.log("[UploadStore] Found data in localStorage, removing");
              localStorage.removeItem(storageKey);
            }
          } catch (e) {
            console.error("[UploadStore] Error clearing localStorage:", e);
          }
        }
        set({ uploadProgress: null });
      },
    }),
    {
      name: "upload-storage",
      partialize: (state) => ({ uploadProgress: state.uploadProgress }),
      merge: (persistedState, currentState) => {
        const uploadProgressCleared =
          currentState.uploadProgress === null &&
          JSON.stringify(persistedState) !== "{}";

        if (uploadProgressCleared) {
          console.log(
            "[UploadStore] Upload progress was cleared in memory, not restoring from storage"
          );
          return currentState;
        }
        return {
          ...currentState,
          ...(persistedState as Partial<UploadStore>),
        };
      },
    }
  )
);

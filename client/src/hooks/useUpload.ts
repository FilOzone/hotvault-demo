import { useCallback, useRef } from "react";
import { useUploadStore } from "@/store/upload-store";
import { API_BASE_URL } from "@/lib/constants";

export const useUpload = (onSuccess?: () => void) => {
  const { setUploadProgress, clearUploadProgress } = useUploadStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);

  const handleCancelUpload = useCallback(() => {
    const currentAbortController = abortControllerRef.current;
    const currentPollInterval = pollIntervalRef.current;

    if (currentAbortController) {
      currentAbortController.abort();
      abortControllerRef.current = null;
    }

    if (currentPollInterval) {
      clearInterval(currentPollInterval);
      pollIntervalRef.current = null;
    }

    uploadStartTimeRef.current = null;

    setUploadProgress({
      status: "cancelled",
      message: "Upload cancelled by user",
      error: "Upload cancelled",
      progress: 0,
    });

    setTimeout(() => {
      clearUploadProgress();
    }, 2000);
  }, [setUploadProgress, clearUploadProgress]);

  const uploadFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const token = localStorage.getItem("jwt_token");
        if (!token) {
          throw new Error("Authentication required");
        }

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        uploadStartTimeRef.current = Date.now();

        setUploadProgress({
          status: "starting",
          progress: 0,
          message: "Initiating upload...",
          lastUpdated: Date.now(),
          isStalled: false,
          filename: file.name,
        });

        const response = await fetch(`${API_BASE_URL}/api/v1/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Upload failed (${response.status})`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            console.error("[useUpload] Raw error response:", errorText);
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("[useUpload] Upload initiated:", data);

        if (data.jobId) {
          setUploadProgress((prev) => ({
            ...prev,
            ...data,
            lastUpdated: Date.now(),
            isStalled: false,
          }));

          setTimeout(() => {
            pollStatus(data.jobId, token);
          }, 1000);

          return data;
        } else {
          throw new Error("No job ID received from server");
        }
      } catch (error) {
        abortControllerRef.current = null;
        uploadStartTimeRef.current = null;

        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("[useUpload] Upload was cancelled by user");
          return;
        }

        console.error("[useUpload] Error in uploadFile:", error);
        setUploadProgress({
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed",
          lastUpdated: Date.now(),
        });

        throw error;
      }
    },
    [setUploadProgress, clearUploadProgress, onSuccess, handleCancelUpload]
  );

  const pollStatus = useCallback(
    async (jobId: string, token: string) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/upload/status/${jobId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to get upload status");
        }

        const data = await response.json();
        console.log("[useUpload] Got status update:", data);

        if (
          (data.status === "complete" || data.status === "success") &&
          data.progress === 100
        ) {
          console.log(
            "[useUpload] Upload complete with 100% progress. Immediately cleaning up."
          );

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          onSuccess?.();

          setTimeout(() => {
            clearUploadProgress();
          }, 100);

          return;
        }

        setUploadProgress((prev) => ({
          ...prev,
          ...data,
          lastUpdated: Date.now(),
          isStalled: false,
        }));

        if (data.status === "complete" || data.status === "error") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          if (data.status === "complete") {
            onSuccess?.();
          }
        } else {
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(() => {
              pollStatus(jobId, token);
            }, 2000);
          }
        }
      } catch (error) {
        console.error("[useUpload] Error polling for status:", error);
      }
    },
    [setUploadProgress, clearUploadProgress, onSuccess]
  );

  return {
    uploadFile,
    handleCancelUpload,
    hasActiveUpload: !!abortControllerRef.current,
  };
};

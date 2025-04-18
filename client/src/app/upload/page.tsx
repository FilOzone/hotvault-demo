"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ethers } from "ethers";

const API_BASE_URL = "http://localhost:8080/api/v1";

interface NonceResponse {
  nonce: string;
}

interface VerifyResponse {
  token: string;
  expires: number;
}

interface UploadResponse {
  message: string;
  filename: string;
  size: number;
  prepare_output: string;
  upload_output: string;
  upload_progress: string[];
  cid: string;
  service_url: string;
  service_name: string;
}

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { account } = useAuth();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !account || !window.ethereum) {
      toast.error("Please select a file and connect your wallet first");
      return;
    }

    setUploading(true);

    try {
      // Step 1: Get nonce
      const nonceResponse = await fetch(`${API_BASE_URL}/auth/nonce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: account.toLowerCase(),
        }),
      });

      if (!nonceResponse.ok) {
        const errorData = await nonceResponse.json();
        throw new Error(errorData.error || "Failed to get nonce");
      }

      const { nonce } = (await nonceResponse.json()) as NonceResponse;

      // Step 2: Sign message with nonce
      // Format the message exactly as expected by the backend
      const message = `Sign this message to authenticate: ${nonce}`;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      console.log("Debug info:", {
        address: account.toLowerCase(),
        nonce,
        signature,
        message,
      });

      // Step 3: Verify signature
      const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: account.toLowerCase(),
          signature,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || "Failed to verify signature");
      }

      const { token } = (await verifyResponse.json()) as VerifyResponse;

      // Step 4: Upload file with token
      const formData = new FormData();
      formData.append("file", selectedFile);

      const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse
          .json()
          .catch(() => ({ error: uploadResponse.statusText }));
        console.error("Upload failed:", {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          errorData,
        });
        throw new Error(
          errorData.error ||
            errorData.message ||
            `Upload failed (${uploadResponse.status}): ${uploadResponse.statusText}`
        );
      }

      const result = (await uploadResponse.json()) as UploadResponse;
      console.log("Upload successful:", result);
      toast.success(
        `File uploaded successfully to ${result.service_name}!\n` +
          `File: ${result.filename} (${Math.round(result.size / 1024)} KB)\n` +
          `CID: ${result.cid}\n` +
          `Service URL: ${result.service_url}`
      );
      setSelectedFile(null);

      // Reset the file input
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      console.error("Upload error:", error);
      let errorMessage = "Failed to upload file. Please try again.";

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        errorMessage = JSON.stringify(error);
      }

      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Image Upload Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid w-full items-center gap-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100"
              disabled={uploading}
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading || !account}
              className="w-full"
            >
              {uploading ? "Processing..." : "Upload Image"}
            </Button>
          </div>
          {selectedFile && (
            <div className="text-sm text-gray-500">
              Selected file: {selectedFile.name} (
              {Math.round(selectedFile.size / 1024)} KB)
            </div>
          )}
          {!account && (
            <div className="text-sm text-red-500">
              Please connect your wallet to upload files
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

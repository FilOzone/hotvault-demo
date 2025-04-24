"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ProofDetails } from "./types";

interface ProofDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProof: ProofDetails | null;
}

export const ProofDetailsDialog: React.FC<ProofDetailsDialogProps> = ({
  isOpen,
  onClose,
  selectedProof,
}) => {
  if (!selectedProof) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Proof Details</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                File Name
              </h3>
              <p className="bg-gray-50 rounded p-3 text-sm break-all">
                {selectedProof.pieceFilename}
              </p>
            </div>

            <div className="col-span-1">
              <h3 className="text-sm font-medium text-gray-500 mb-1">
                Proof Set ID
              </h3>
              <div className="flex items-center gap-1 bg-gray-50 rounded p-3 text-sm font-mono break-all">
                {selectedProof.serviceProofSetId}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      selectedProof.serviceProofSetId
                    );
                    toast.success("Proof Set ID copied to clipboard");
                  }}
                  className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0"
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
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
                </button>
              </div>
            </div>

            {selectedProof.rootId && (
              <div className="col-span-1">
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Root ID
                </h3>
                <div className="flex items-center gap-1 bg-gray-50 rounded p-3 text-sm font-mono break-all">
                  {selectedProof.rootId}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedProof.rootId || "");
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
                  The root is a cryptographic commitment that represents this
                  file in the PDP system.
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
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
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
              The PDP Explorer provides detailed verification information about
              your data&apos;s proof of storage.
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

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Piece } from "./types";

interface RemoveConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pieceToRemove: Piece | null;
  onConfirm: () => Promise<void>;
  isRemovalLoading?: boolean;
}

export const RemoveConfirmationDialog: React.FC<
  RemoveConfirmationDialogProps
> = ({
  isOpen,
  onClose,
  pieceToRemove,
  onConfirm,
  isRemovalLoading = false,
}) => {
  if (!pieceToRemove) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Confirm File Removal
          </DialogTitle>
          <DialogDescription className="pt-2">
            Are you sure you want to remove{" "}
            <span className="font-medium">{pieceToRemove.filename}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-md my-4">
          <h3 className="text-amber-800 font-medium text-sm mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Important Information
          </h3>
          <p className="text-amber-700 text-sm">
            This action will mark the file for removal from the storage network.
            Once initiated, the removal process typically takes 2-3 days to
            complete.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isRemovalLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRemovalLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isRemovalLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
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
                Processing...
              </>
            ) : (
              "Remove File"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

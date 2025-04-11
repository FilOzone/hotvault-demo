"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { RailCreationModalProps, BUTTON_STYLES, INPUT_STYLES } from "@/types/dashboard";
import { Typography } from "@/components/ui/typography";

export const RailCreationModal: React.FC<RailCreationModalProps> = ({
  isOpen,
  onClose,
  tokens,
  onSubmit,
}) => {
  const [selectedToken, setSelectedToken] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [arbiterAddress, setArbiterAddress] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!selectedToken || !recipientAddress) return;

    setIsCreating(true);
    try {
      await onSubmit(
        selectedToken,
        recipientAddress,
        arbiterAddress || ethers.ZeroAddress,
        "0", // paymentRate - to be implemented
        "0", // lockupPeriod - to be implemented
        "0" // lockupFixed - to be implemented
      );
      onClose();
      toast.success("Rail created successfully!");
    } catch (error) {
      console.error("Error creating rail:", error);
      toast.error("Failed to create rail");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-xl p-6 w-full max-w-md m-4 shadow-xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Typography variant="h2" className="text-xl font-mono mb-4">
          Create New Payment Rail
        </Typography>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Typography variant="small" className="text-gray-400 text-xs mb-1">
              Select Token
            </Typography>
            <select
              value={selectedToken}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedToken(e.target.value)
              }
              className={INPUT_STYLES.base}
            >
              <option value="">Select a token</option>
              {tokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Typography variant="small" className="text-gray-400 text-xs mb-1">
              Recipient Address
            </Typography>
            <motion.div
              className="relative group"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              <input
                value={recipientAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRecipientAddress(e.target.value)
                }
                placeholder="0x..."
                className={INPUT_STYLES.base}
                disabled={isCreating}
              />
            </motion.div>
          </div>
          <div>
            <Typography variant="small" className="text-gray-400 text-xs mb-1">
              Arbiter Address (Optional)
            </Typography>
            <motion.div
              className="relative group"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              <input
                value={arbiterAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setArbiterAddress(e.target.value)
                }
                placeholder="0x..."
                className={INPUT_STYLES.base}
                disabled={isCreating}
              />
            </motion.div>
          </div>
          <div className="flex gap-2 justify-end mt-6">
            <motion.button
              onClick={onClose}
              disabled={isCreating}
              className={`${BUTTON_STYLES.base} ${BUTTON_STYLES.secondary}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              onClick={() => handleSubmit()}
              disabled={isCreating || !selectedToken || !recipientAddress}
              className={`${BUTTON_STYLES.base} ${BUTTON_STYLES.primary}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isCreating ? (
                <motion.span
                  className="inline-flex items-center gap-1"
                  animate={{ opacity: [1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <svg
                    className="w-3 h-3 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Creating...
                </motion.span>
              ) : (
                "Create Rail"
              )}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

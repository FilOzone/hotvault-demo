"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Text } from "@/theme/components";
import toast from "react-hot-toast";
import { BUTTON_STYLES, INPUT_STYLES } from "../types";
import { TokenData } from "@/contracts";
import { ethers } from "ethers";

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenData;
  withdrawable: number;
  onSubmit: (
    tokenAddress: string,
    amount: string,
    recipientAddress?: string
  ) => Promise<void>;
}

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
  isOpen,
  onClose,
  token,
  withdrawable,
  onSubmit,
}) => {
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (parseFloat(withdrawalAmount) > withdrawable) {
      toast.error("Amount exceeds withdrawable balance");
      return;
    }

    if (recipientAddress && !ethers.isAddress(recipientAddress)) {
      toast.error("Invalid recipient address");
      return;
    }

    setIsWithdrawing(true);
    try {
      await onSubmit(
        token.address,
        withdrawalAmount,
        recipientAddress.length > 0 ? recipientAddress : undefined
      );
      onClose();
      toast.success("Withdrawal successful!");
    } catch (error) {
      console.error("Error withdrawing:", error);
      toast.error("Failed to withdraw");
    } finally {
      setIsWithdrawing(false);
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
        <Text variant="h2" className="text-xl font-mono mb-4">
          Withdraw {token.symbol}
        </Text>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Text variant="small" className="text-gray-400 text-xs mb-1">
              Available to Withdraw
            </Text>
            <div className="p-3 bg-gray-50 rounded-lg">
              <Text variant="body" className="font-mono">
                {withdrawable.toFixed(4)} {token.symbol}
              </Text>
            </div>
          </div>
          <div>
            <Text variant="small" className="text-gray-400 text-xs mb-1">
              Amount to Withdraw
            </Text>
            <motion.div
              className="relative group"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              <input
                type="number"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder={`Enter amount in ${token.symbol}`}
                className={INPUT_STYLES.base}
                step="0.0001"
                min="0"
                max={withdrawable}
                disabled={isWithdrawing}
              />
            </motion.div>
          </div>
          <div>
            <Text variant="small" className="text-gray-400 text-xs mb-1">
              Recipient Address (Optional)
            </Text>
            <motion.div
              className="relative group"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className={INPUT_STYLES.base}
                disabled={isWithdrawing}
              />
              <Text variant="small" className="text-gray-400 text-xs mt-1">
                Leave empty to withdraw to your wallet
              </Text>
            </motion.div>
          </div>
          <div className="flex gap-2 justify-end mt-6">
            <motion.button
              type="button"
              onClick={onClose}
              disabled={isWithdrawing}
              className={`${BUTTON_STYLES.base} ${BUTTON_STYLES.secondary}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={
                isWithdrawing ||
                !withdrawalAmount ||
                parseFloat(withdrawalAmount) <= 0 ||
                (recipientAddress.length > 0 &&
                  !ethers.isAddress(recipientAddress))
              }
              className={`${BUTTON_STYLES.base} ${BUTTON_STYLES.primary}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isWithdrawing ? (
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
                  Withdrawing...
                </motion.span>
              ) : (
                "Withdraw"
              )}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

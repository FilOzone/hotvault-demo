"use client";

import { usePayment } from "@/contexts/PaymentContext";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

export const PaymentBalanceHeader = () => {
  const { paymentStatus } = usePayment();

  const renderBalance = () => {
    if (paymentStatus.isLoading) {
      return <Skeleton className="h-6 w-24" />;
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-lg border border-gray-200"
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-gray-600">Balance:</span>
          <span className="text-sm font-medium">
            {formatCurrency(paymentStatus.accountFunds)} USDFC
          </span>
        </div>
        <div className="h-4 w-[1px] bg-gray-200" />
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-purple-500" />
          <span className="text-sm text-gray-600">Locked:</span>
          <span className="text-sm font-medium">
            {formatCurrency(paymentStatus.lockedFunds || "0")} USDFC
          </span>
        </div>
      </motion.div>
    );
  };

  // Don't render anything if there's no payment setup yet
  if (!paymentStatus.isDeposited && !paymentStatus.isLoading) {
    return null;
  }

  return (
    <div className="flex items-center justify-end px-4">{renderBalance()}</div>
  );
};

"use client";

import { usePayment } from "@/contexts/PaymentContext";
import { Wallet, Plus, Shield, Loader, X, ArrowDownLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import * as Constants from "@/lib/constants";

export const TokenBalanceCard = () => {
  const { paymentStatus, depositFunds, approveToken, withdrawFunds } =
    usePayment();
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showSetAllowance, setShowSetAllowance] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddFunds = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await depositFunds(depositAmount);
      if (result) {
        toast.success(`Successfully deposited ${depositAmount} USDFC`);
        setDepositAmount("");
        setShowAddFunds(false);
      } else {
        toast.error("Failed to deposit USDFC");
      }
    } catch (error) {
      console.error("Error depositing USDFC:", error);
      toast.error("Error depositing USDFC. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetAllowance = async () => {
    if (
      !allowanceAmount ||
      parseFloat(allowanceAmount) < parseFloat(Constants.PROOF_SET_FEE)
    ) {
      toast.error(
        `Allowance must be at least ${Constants.PROOF_SET_FEE} USDFC`
      );
      return;
    }

    setIsProcessing(true);
    try {
      const result = await approveToken(allowanceAmount);
      if (result) {
        toast.success(`Successfully set allowance to ${allowanceAmount} USDFC`);
        setAllowanceAmount("");
        setShowSetAllowance(false);
      } else {
        toast.error("Failed to set allowance");
      }
    } catch (error) {
      console.error("Error setting allowance:", error);
      toast.error("Error setting allowance. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Convert all amounts to numbers for accurate comparison
    const withdrawAmountNum = parseFloat(withdrawAmount);
    const availableFunds =
      parseFloat(paymentStatus.accountFunds) -
      parseFloat(paymentStatus.lockedFunds.current);
    const walletBalance = parseFloat(paymentStatus.usdcBalance);

    // Debug logging
    console.log("Withdrawal validation:", {
      withdrawAmount: withdrawAmountNum,
      accountFunds: paymentStatus.accountFunds,
      lockedFunds: paymentStatus.lockedFunds,
      availableFunds,
      walletBalance,
    });

    // Check contract funds first
    if (withdrawAmountNum > availableFunds) {
      const errorMsg = `Cannot withdraw more than available unlocked funds (${formatCurrency(
        availableFunds.toString()
      )} USDFC)`;
      console.error("Withdrawal validation failed:", errorMsg);
      toast.error(errorMsg);
      return;
    }

    // Then check wallet balance
    if (withdrawAmountNum > walletBalance) {
      const errorMsg = `Insufficient USDFC balance in wallet to receive withdrawn funds. Current balance: ${formatCurrency(
        paymentStatus.usdcBalance
      )} USDFC`;
      console.error("Wallet balance validation failed:", errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsProcessing(true);
    try {
      console.log("Initiating withdrawal:", withdrawAmount);
      const result = await withdrawFunds(withdrawAmount);
      if (result) {
        toast.success(`Successfully withdrew ${withdrawAmount} USDFC`);
        setWithdrawAmount("");
        setShowWithdraw(false);
      } else {
        if (paymentStatus.error) {
          console.error("Withdrawal failed with error:", paymentStatus.error);
          toast.error(paymentStatus.error);
        } else {
          console.error("Withdrawal failed without specific error");
          toast.error("Failed to withdraw USDFC");
        }
      }
    } catch (error) {
      console.error("Error withdrawing USDFC:", error);
      toast.error("Error withdrawing USDFC. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-500" />
          <h3 className="text-xl font-medium">USDFC Balance</h3>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowWithdraw(true);
              setShowSetAllowance(false);
              setShowAddFunds(false);
            }}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors"
          >
            <ArrowDownLeft className="w-4 h-4" />
            Withdraw
          </button>
          <button
            onClick={() => {
              setShowSetAllowance(true);
              setShowAddFunds(false);
              setShowWithdraw(false);
            }}
            className="flex items-center gap-1.5 text-sm text-purple-500 hover:text-purple-600 transition-colors"
          >
            <Shield className="w-4 h-4" />
            Set Allowance
          </button>
          <button
            onClick={() => {
              setShowAddFunds(true);
              setShowSetAllowance(false);
              setShowWithdraw(false);
            }}
            className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Funds
          </button>
        </div>
      </div>

      {/* Balance Information */}
      <div className="px-3 pb-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Available Balance</span>
          <span className="text-lg font-medium">
            {formatCurrency(paymentStatus.usdcBalance)} USDFC
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Account Funds</span>
          <span className="text-lg font-medium">
            {formatCurrency(paymentStatus.accountFunds)} USDFC
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Locked Funds</span>
          <div className="text-right">
            <span className="text-lg font-medium">
              {formatCurrency(paymentStatus.lockedFunds.current)} USDFC
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-600">Available for Withdrawal</span>
          <span className="text-lg font-medium">
            {formatCurrency(
              (
                parseFloat(paymentStatus.accountFunds) -
                parseFloat(paymentStatus.lockedFunds.current)
              ).toString()
            )}{" "}
            USDFC
          </span>
        </div>

        {/* Add Funds Form */}
        {showAddFunds && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Add Funds</h4>
              <button
                onClick={() => setShowAddFunds(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Amount to deposit"
                min="0.01"
                step="0.01"
                disabled={isProcessing}
              />
              <button
                onClick={handleAddFunds}
                disabled={isProcessing || !depositAmount}
                className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Set Allowance Form */}
        {showSetAllowance && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Set Allowance</h4>
              <button
                onClick={() => setShowSetAllowance(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <input
                  type="number"
                  value={allowanceAmount}
                  onChange={(e) => setAllowanceAmount(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  placeholder="Allowance amount"
                  min={Constants.PROOF_SET_FEE}
                  step="0.01"
                  disabled={isProcessing}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Minimum: {Constants.PROOF_SET_FEE} USDFC
                </p>
              </div>
              <button
                onClick={handleSetAllowance}
                disabled={isProcessing || !allowanceAmount}
                className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Approve"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Withdraw Form */}
        {showWithdraw && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Withdraw Funds</h4>
              <button
                onClick={() => setShowWithdraw(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="Amount to withdraw"
                  min="0.01"
                  step="0.01"
                  disabled={isProcessing}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Available:{" "}
                  {formatCurrency(
                    (
                      parseFloat(paymentStatus.accountFunds) -
                      parseFloat(paymentStatus.lockedFunds.current)
                    ).toString()
                  )}{" "}
                  USDFC
                </p>
              </div>
              <button
                onClick={handleWithdraw}
                disabled={isProcessing || !withdrawAmount}
                className="w-full px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Withdraw"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

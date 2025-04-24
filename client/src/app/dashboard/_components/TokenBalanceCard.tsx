"use client";

import { usePayment } from "@/contexts/PaymentContext";
import { Wallet, Plus, Shield, Loader, X, ArrowDownLeft } from "lucide-react";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as Constants from "@/lib/constants";
import { UPLOAD_COMPLETED_EVENT } from "@/components/ui/global-upload-progress";
import { ROOT_REMOVED_EVENT } from "./PaymentBalanceHeader";
import { BALANCE_UPDATED_EVENT } from "@/contexts/PaymentContext";

export const TokenBalanceCard = () => {
  const {
    paymentStatus,
    depositFunds,
    approveToken,
    withdrawFunds,
    refreshPaymentSetupStatus,
  } = usePayment();
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showSetAllowance, setShowSetAllowance] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleUploadComplete = () => {
      console.log(
        "[TokenBalanceCard] File upload completed, refreshing balance"
      );
      refreshPaymentSetupStatus();
    };

    const handleRootRemoved = () => {
      console.log("[TokenBalanceCard] Root removed, refreshing balance");
      refreshPaymentSetupStatus();
    };

    const handleBalanceUpdate = (event: CustomEvent) => {
      console.log("[TokenBalanceCard] Balance updated:", event.detail);
      // The balance is already updated in the context
    };

    window.addEventListener(UPLOAD_COMPLETED_EVENT, handleUploadComplete);
    window.addEventListener(ROOT_REMOVED_EVENT, handleRootRemoved);
    window.addEventListener(
      BALANCE_UPDATED_EVENT,
      handleBalanceUpdate as EventListener
    );

    return () => {
      window.removeEventListener(UPLOAD_COMPLETED_EVENT, handleUploadComplete);
      window.removeEventListener(ROOT_REMOVED_EVENT, handleRootRemoved);
      window.removeEventListener(
        BALANCE_UPDATED_EVENT,
        handleBalanceUpdate as EventListener
      );
    };
  }, [refreshPaymentSetupStatus]);

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

    const withdrawAmountNum = parseFloat(withdrawAmount);
    const lockedAmount = parseFloat(paymentStatus.lockedFunds.current);
    const totalFunds = parseFloat(paymentStatus.accountFunds);

    const availableFunds = Math.max(
      0,
      parseFloat((totalFunds - lockedAmount).toFixed(6))
    );

    console.log("Withdrawal validation:", {
      withdrawAmount: withdrawAmountNum,
      accountFunds: paymentStatus.accountFunds,
      lockedFunds: paymentStatus.lockedFunds,
      availableFunds,
      precision: {
        totalFunds,
        lockedAmount,
        difference: totalFunds - lockedAmount,
      },
    });

    if (withdrawAmountNum > availableFunds + 0.001) {
      const errorMsg = `Cannot withdraw more than available unlocked funds (${formatCurrency(
        availableFunds.toString()
      )} USDFC)`;
      console.error("Withdrawal validation failed:", errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (Math.abs(withdrawAmountNum - totalFunds) < 0.01) {
      setWithdrawAmount(availableFunds.toString());
    }

    setIsProcessing(true);
    try {
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

  const setMaxWithdrawal = () => {
    const availableFunds = Math.max(
      0,
      parseFloat(
        (
          parseFloat(paymentStatus.accountFunds) -
          parseFloat(paymentStatus.lockedFunds.current) -
          0.0001
        ).toFixed(6)
      )
    );
    setWithdrawAmount(availableFunds.toString());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-50 p-2.5 rounded-xl">
            <Wallet className="w-6 h-6 text-blue-500" />
          </div>
          <h3 className="text-2xl font-semibold">USDFC Balance</h3>
        </div>

        <div className="space-y-4">
          {/* Wallet Balance Section */}
          <div className="p-6 bg-blue-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-blue-500" />
              <div className="text-[15px] font-medium text-blue-700">
                Wallet Balance
              </div>
            </div>
            <div className="text-2xl font-semibold text-blue-900 font-mono">
              {parseFloat(paymentStatus.usdcBalance).toFixed(5)} USDFC
            </div>
            <div className="text-[15px] text-blue-600 mt-1">
              Available in your connected wallet
            </div>
          </div>

          {/* Total FWS Funds */}
          <div className="p-6 bg-gray-50 rounded-xl">
            <div className="text-[15px] text-gray-600 mb-1">
              Total FWS Funds
            </div>
            <div className="text-2xl font-semibold font-mono">
              {parseFloat(paymentStatus.accountFunds).toFixed(5)} USDFC
            </div>
          </div>

          {/* Locked Funds */}
          <div className="p-6 bg-gray-50 rounded-xl">
            <div className="text-[15px] text-gray-600 mb-1">Locked Funds</div>
            <div className="text-2xl font-semibold font-mono">
              {parseFloat(paymentStatus.lockedFunds.current).toFixed(5)} USDFC
            </div>
          </div>

          {/* Available for Withdrawal */}
          <div className="p-6 bg-gray-50 rounded-xl">
            <div className="text-[15px] text-gray-600 mb-1">
              Available for Withdrawal
            </div>
            <div className="text-2xl font-semibold text-green-700 font-mono">
              {Math.max(
                0,
                parseFloat(paymentStatus.accountFunds) -
                  parseFloat(paymentStatus.lockedFunds.current)
              ).toFixed(5)}{" "}
              USDFC
            </div>
          </div>

          <div className="h-px bg-gray-100 my-2" />

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => {
                setShowWithdraw(true);
                setShowSetAllowance(false);
                setShowAddFunds(false);
              }}
              className="w-full flex items-center gap-2.5 px-6 py-3 text-[15px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
            >
              <ArrowDownLeft className="w-5 h-5" strokeWidth={2} />
              Withdraw
            </button>
            <button
              onClick={() => {
                setShowSetAllowance(true);
                setShowAddFunds(false);
                setShowWithdraw(false);
              }}
              className="w-full flex items-center gap-2.5 px-6 py-3 text-[15px] font-medium text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
            >
              <Shield className="w-5 h-5" strokeWidth={2} />
              Set Allowance
            </button>
            <button
              onClick={() => {
                setShowAddFunds(true);
                setShowSetAllowance(false);
                setShowWithdraw(false);
              }}
              className="w-full flex items-center gap-2.5 px-6 py-3 text-[15px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
            >
              <Plus className="w-5 h-5" strokeWidth={2} />
              Add Funds
            </button>
          </div>

          {/* Action Forms */}
          {showAddFunds && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-blue-900">Add Funds</h4>
                <button
                  onClick={() => setShowAddFunds(false)}
                  className="text-blue-500 hover:text-blue-600 p-1 rounded-full hover:bg-blue-100/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                  placeholder="Amount to deposit"
                  min="0.01"
                  step="0.01"
                  disabled={isProcessing}
                />
                <button
                  onClick={handleAddFunds}
                  disabled={isProcessing || !depositAmount}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          {showSetAllowance && (
            <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-100 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-purple-900">
                  Set Allowance
                </h4>
                <button
                  onClick={() => setShowSetAllowance(false)}
                  className="text-purple-500 hover:text-purple-600 p-1 rounded-full hover:bg-purple-100/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <input
                    type="number"
                    value={allowanceAmount}
                    onChange={(e) => setAllowanceAmount(e.target.value)}
                    className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white"
                    placeholder="Allowance amount"
                    min={Constants.PROOF_SET_FEE}
                    step="0.01"
                    disabled={isProcessing}
                  />
                  <p className="mt-1.5 text-xs text-purple-600">
                    Minimum: {Constants.PROOF_SET_FEE} USDFC
                  </p>
                </div>
                <button
                  onClick={handleSetAllowance}
                  disabled={isProcessing || !allowanceAmount}
                  className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          {showWithdraw && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-red-900">
                  Withdraw Funds
                </h4>
                <button
                  onClick={() => setShowWithdraw(false)}
                  className="text-red-500 hover:text-red-600 p-1 rounded-full hover:bg-red-100/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex relative">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-white pr-16"
                      placeholder="Amount to withdraw"
                      min="0.01"
                      step="0.01"
                      disabled={isProcessing}
                    />
                    <button
                      type="button"
                      onClick={setMaxWithdrawal}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded hover:bg-red-200"
                    >
                      Max
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-red-600">
                    Available:{" "}
                    {formatCurrencyPrecise(
                      Math.max(
                        0,
                        parseFloat(
                          (
                            parseFloat(paymentStatus.accountFunds) -
                            parseFloat(paymentStatus.lockedFunds.current) -
                            0.0001
                          ).toFixed(6)
                        )
                      ).toString()
                    )}{" "}
                    USDFC
                  </p>
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={isProcessing || !withdrawAmount}
                  className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
    </div>
  );
};

"use client";

import { usePayment } from "@/contexts/PaymentContext";
import { formatCurrency } from "@/lib/utils";
import { Plus, Loader, Shield, ChevronDown, Wallet } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { UPLOAD_COMPLETED_EVENT } from "@/components/ui/global-upload-progress";
import { BALANCE_UPDATED_EVENT } from "@/contexts/PaymentContext";
import { toast } from "sonner";
import * as Constants from "@/lib/constants";

export const ROOT_REMOVED_EVENT = "ROOT_REMOVED";

export const PaymentBalanceHeader = () => {
  const {
    paymentStatus,
    refreshPaymentSetupStatus,
    depositFunds,
    approveToken,
  } = usePayment();
  const [showDetails, setShowDetails] = useState(false);
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [isSettingAllowance, setIsSettingAllowance] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  const lastRefreshTimeRef = useRef<number>(0);
  const DEBOUNCE_INTERVAL = 1500;

  const refreshPaymentWithIndicator = async () => {
    try {
      setIsRefreshing(true);
      await refreshPaymentSetupStatus();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        detailsRef.current &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        setShowDetails(false);
        setIsAddingFunds(false);
        setIsSettingAllowance(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleUploadComplete = () => {
      console.log(
        "[PaymentBalanceHeader] File upload completed, refreshing balance"
      );
      refreshPaymentWithIndicator();
    };

    const handleRootRemoved = () => {
      console.log("[PaymentBalanceHeader] Root removed, refreshing balance");
      refreshPaymentWithIndicator();
    };

    const handleBalanceUpdate = (event: CustomEvent) => {
      console.log("[PaymentBalanceHeader] Balance updated:", event.detail);

      const now = Date.now();
      if (now - lastRefreshTimeRef.current < DEBOUNCE_INTERVAL) {
        console.log("[PaymentBalanceHeader] Skipping refresh due to debounce", {
          timeSinceLastRefresh: now - lastRefreshTimeRef.current,
          debounceInterval: DEBOUNCE_INTERVAL,
        });
        return;
      }

      lastRefreshTimeRef.current = now;

      refreshPaymentWithIndicator()
        .then(() => {
          console.log(
            "[PaymentBalanceHeader] Payment status refreshed after balance update"
          );
          setShowDetails(false);
        })
        .catch((error) => {
          console.error(
            "[PaymentBalanceHeader] Error refreshing payment status:",
            error
          );
        });
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
        setIsAddingFunds(false);
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
    if (!allowanceAmount || parseFloat(allowanceAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await approveToken(toContractValue(allowanceAmount));
      if (result) {
        toast.success(`Successfully set allowance to ${allowanceAmount} USDFC`);
        setAllowanceAmount("");
        setIsSettingAllowance(false);
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

  const toContractValue = (value: string): string => {
    if (!value) return "0";
    return (parseFloat(value) * 1e18).toString();
  };

  if (
    !paymentStatus.isLoading &&
    !paymentStatus.isDeposited &&
    !paymentStatus.proofSetReady &&
    !paymentStatus.isCreatingProofSet
  ) {
    return null;
  }

  return (
    <div className="flex items-center justify-end px-4 h-12">
      <div className="relative" ref={detailsRef}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-3 px-3 py-1.5 text-sm bg-white hover:bg-gray-50 rounded-md border border-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Wallet
              className={`w-4 h-4 ${
                isRefreshing ? "text-blue-500 animate-pulse" : "text-gray-500"
              }`}
            />
            <span>
              {isRefreshing
                ? "Updating..."
                : formatCurrency(paymentStatus.accountFunds) + " USDFC"}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </button>

        {showDetails && (
          <div className="absolute right-0 top-full mt-1 w-[320px] bg-white rounded-lg shadow-lg border border-gray-200 divide-y divide-gray-100">
            <div className="p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Balance Summary
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Wallet Balance:</span>
                  <span className="font-medium">
                    {formatCurrency(paymentStatus.usdcBalance)} USDFC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">FWS Balance:</span>
                  <span className="font-medium">
                    {formatCurrency(paymentStatus.accountFunds)} USDFC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Locked Funds:</span>
                  <span className="font-medium font-mono overflow-hidden text-ellipsis max-w-[150px]">
                    {parseFloat(paymentStatus.lockedFunds.current).toFixed(5) +
                      " USDFC"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Available for Withdrawal:
                  </span>
                  <span className="font-medium font-mono overflow-hidden text-ellipsis max-w-[150px]">
                    {Math.max(
                      0,
                      parseFloat(paymentStatus.accountFunds) -
                        parseFloat(paymentStatus.lockedFunds.current)
                    ).toFixed(5)}{" "}
                    USDFC
                  </span>
                </div>
              </div>
            </div>

            {/* {paymentStatus.operatorApproval && (
              <div className="p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Operator Approval
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Rate Usage:</span>
                    <span className="font-mono text-xs overflow-hidden text-ellipsis max-w-[150px]">
                      {formatContractValue(
                        paymentStatus.operatorApproval.rateUsage
                      )}
                      /
                      {formatContractValue(
                        paymentStatus.operatorApproval.rateAllowance
                      )}{" "}
                      USDFC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Lockup Usage:</span>
                    <span className="font-mono text-xs overflow-hidden text-ellipsis max-w-[150px]">
                      {formatContractValue(
                        paymentStatus.operatorApproval.lockupUsage
                      )}
                      /
                      {formatContractValue(
                        paymentStatus.operatorApproval.lockupAllowance
                      )}{" "}
                      USDFC
                    </span>
                  </div>
                </div>
              </div>
            )} */}

            <div className="p-3">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Actions
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsAddingFunds(!isAddingFunds);
                    setIsSettingAllowance(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Funds
                </button>
                <button
                  onClick={() => {
                    setIsSettingAllowance(!isSettingAllowance);
                    setIsAddingFunds(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 flex items-center"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Set Allowance
                </button>

                {isAddingFunds && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Amount to deposit"
                      min="0.01"
                      step="0.01"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={handleAddFunds}
                      disabled={isProcessing || !depositAmount}
                      className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                    >
                      {isProcessing ? (
                        <>
                          <Loader size={14} className="animate-spin mr-1" />
                          {paymentStatus.error &&
                          paymentStatus.error.includes("Waiting")
                            ? paymentStatus.error
                            : "Processing..."}
                        </>
                      ) : (
                        "Deposit"
                      )}
                    </button>
                  </div>
                )}

                {isSettingAllowance && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="number"
                      value={allowanceAmount}
                      onChange={(e) => setAllowanceAmount(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Allowance amount"
                      min={Constants.PROOF_SET_FEE}
                      step="0.01"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={handleSetAllowance}
                      disabled={isProcessing || !allowanceAmount}
                      className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                    >
                      {isProcessing ? (
                        <>
                          <Loader size={14} className="animate-spin mr-1" />
                          {paymentStatus.error &&
                          paymentStatus.error.includes("Waiting")
                            ? paymentStatus.error
                            : "Processing..."}
                        </>
                      ) : (
                        "Approve"
                      )}
                    </button>
                    <p className="mt-1 text-xs text-gray-600">
                      Min: {Constants.PROOF_SET_FEE} USDFC
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

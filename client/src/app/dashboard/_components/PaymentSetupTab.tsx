import { useState, useEffect } from "react";
import { usePayment } from "@/contexts/PaymentContext";
import { useAuth } from "@/contexts/AuthContext";
import { TokenBalanceCard } from "./TokenBalanceCard";
import {
  CheckCircle,
  Loader,
  Info,
  AlertTriangle,
  Files,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import * as Constants from "@/lib/constants";
import { toast } from "react-hot-toast";
import { TransactionHistory } from "./TransactionHistory";
import { DASHBOARD_SECTIONS, DashboardSection } from "@/types/dashboard";
import { BALANCE_UPDATED_EVENT } from "@/contexts/PaymentContext";

enum PaymentStep {
  APPROVE_TOKEN = 0,
  DEPOSIT = 1,
  APPROVE_OPERATOR = 2,
  CREATE_PROOF_SET = 3,
  COMPLETE = 4,
}

interface PaymentSetupTabProps {
  setActiveTab?: (tab: DashboardSection) => void;
}

const StepIcon = ({
  completed,
  active,
  number,
}: {
  completed: boolean;
  active: boolean;
  number: number;
}) => {
  if (completed) {
    return (
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="w-5 h-5 text-green-600" />
      </div>
    );
  }
  return (
    <div
      className={`w-8 h-8 rounded-full ${
        active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
      } flex items-center justify-center`}
    >
      <span className="text-sm font-semibold">{number}</span>
    </div>
  );
};

const formatLargeNumber = (num: string) => {
  const trimmed = num.replace(/\.?0+$/, "");
  if (trimmed.length <= 12) return trimmed;

  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
};

const toDisplayValue = (value: string): string => {
  if (!value) return "";
  const numValue = parseFloat(value) / 1e18;
  return numValue.toFixed(5);
};

const toContractValue = (value: string): string => {
  if (!value) return "";
  return (parseFloat(value) * 1e18).toString();
};

export const PaymentSetupTab = ({ setActiveTab }: PaymentSetupTabProps) => {
  const {
    paymentStatus,
    approveToken,
    depositFunds,
    approveServiceOperator,
    refreshPaymentSetupStatus,
    initiateProofSetCreation,
  } = usePayment();
  const { account, userProofSetId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<PaymentStep>(
    PaymentStep.APPROVE_TOKEN
  );

  const [tokenAllowance, setTokenAllowance] = useState("100");
  const [depositAmount, setDepositAmount] = useState(
    (parseFloat(Constants.PROOF_SET_FEE) + 0.01).toFixed(2)
  );
  const [rateAllowance, setRateAllowance] = useState("");
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [isUpdatingAllowances, setIsUpdatingAllowances] = useState(false);
  const [isProofSetClicked, setIsProofSetClicked] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleBalanceUpdate = (event: CustomEvent) => {
      console.log("[PaymentSetupTab] Balance updated:", event.detail);
      if (event.detail) {
        if (currentStep === PaymentStep.DEPOSIT) {
          if (
            event.detail.newBalance &&
            parseFloat(event.detail.newBalance) >=
              parseFloat(Constants.PROOF_SET_FEE)
          ) {
            setCurrentStep(PaymentStep.APPROVE_OPERATOR);
          }
        }
      }

      setIsProcessing(false);
    };

    window.addEventListener(
      BALANCE_UPDATED_EVENT,
      handleBalanceUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        BALANCE_UPDATED_EVENT,
        handleBalanceUpdate as EventListener
      );
    };
  }, [currentStep]);

  useEffect(() => {
    if (paymentStatus.isOperatorApproved && !isUpdatingAllowances) {
      setRateAllowance(
        toDisplayValue(paymentStatus.operatorApproval?.rateAllowance || "")
      );
      setLockupAllowance(
        toDisplayValue(paymentStatus.operatorApproval?.lockupAllowance || "")
      );
    }
  }, [
    paymentStatus.isOperatorApproved,
    paymentStatus.operatorApproval,
    isUpdatingAllowances,
  ]);

  useEffect(() => {
    if (paymentStatus.proofSetReady) {
      setCurrentStep(PaymentStep.COMPLETE);
      setIsProofSetClicked(false);
    } else if (paymentStatus.isCreatingProofSet) {
      setCurrentStep(PaymentStep.CREATE_PROOF_SET);
    } else if (paymentStatus.isOperatorApproved) {
      setCurrentStep(PaymentStep.CREATE_PROOF_SET);
    } else if (paymentStatus.isDeposited) {
      setCurrentStep(PaymentStep.APPROVE_OPERATOR);
    } else if (paymentStatus.isTokenApproved) {
      setCurrentStep(PaymentStep.DEPOSIT);
    } else {
      setCurrentStep(PaymentStep.APPROVE_TOKEN);
    }
  }, [paymentStatus]);

  useEffect(() => {
    setIsProcessing(false);
  }, [
    account,
    paymentStatus.isTokenApproved,
    paymentStatus.isDeposited,
    paymentStatus.isOperatorApproved,
  ]);

  const handleApproveToken = async () => {
    if (!tokenAllowance || parseFloat(tokenAllowance) <= 0) {
      toast.error("Please enter a valid allowance amount");
      return;
    }

    if (!paymentStatus.hasMinimumBalance) {
      toast.error(
        `You need at least ${Constants.MINIMUM_USDFC_BALANCE} USDFC in your wallet to proceed`
      );
      return;
    }

    setIsProcessing(true);
    try {
      const result = await approveToken(tokenAllowance);
      if (result) {
        toast.success(`USDFC token approved for ${tokenAllowance} USDFC`);
        await refreshPaymentSetupStatus();
      } else {
        toast.error("Failed to approve USDFC token");
      }
    } catch (error) {
      console.error("Error approving token:", error);
      toast.error("Error approving token. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeposit = async () => {
    if (
      !depositAmount ||
      parseFloat(depositAmount) < parseFloat(Constants.PROOF_SET_FEE)
    ) {
      toast.error(
        `Deposit amount must be at least ${Constants.PROOF_SET_FEE} USDFC`
      );
      return;
    }

    if (!paymentStatus.hasMinimumBalance) {
      toast.error(
        `You need at least ${Constants.MINIMUM_USDFC_BALANCE} USDFC in your wallet to proceed`
      );
      return;
    }

    setIsProcessing(true);
    try {
      const result = await depositFunds(depositAmount);
      if (result) {
        toast.success(
          `Successfully deposited ${depositAmount} USDFC to FWS funds`
        );
        await refreshPaymentSetupStatus();
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

  const handleApproveOperator = async () => {
    if (
      !rateAllowance ||
      parseFloat(rateAllowance) <= 0 ||
      !lockupAllowance ||
      parseFloat(lockupAllowance) <= 0
    ) {
      toast.error("Please enter both rate and lockup allowance values");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await approveServiceOperator(
        toContractValue(rateAllowance),
        toContractValue(lockupAllowance)
      );
      if (result) {
        toast.success(
          `PDP Service operator ${
            paymentStatus.isOperatorApproved ? "updated" : "approved"
          } with ${rateAllowance} USDFC rate allowance and ${lockupAllowance} USDFC lockup allowance`
        );
        setIsUpdatingAllowances(false);
        await refreshPaymentSetupStatus();
      } else {
        toast.error(
          `Failed to ${
            paymentStatus.isOperatorApproved ? "update" : "approve"
          } PDP Service operator`
        );
      }
    } catch (error) {
      console.error("Error with operator approval:", error);
      toast.error(
        `Error ${
          paymentStatus.isOperatorApproved ? "updating" : "approving"
        } operator. Please try again.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateProofSet = async () => {
    if (
      parseFloat(paymentStatus.accountFunds) <
      parseFloat(Constants.PROOF_SET_FEE)
    ) {
      toast.error(
        `Insufficient funds in FWS. You need at least ${Constants.PROOF_SET_FEE} USDFC in your FWS funds to create a proof set.`
      );
      return;
    }

    setIsProofSetClicked(true);
    try {
      const result = await initiateProofSetCreation();
      if (!result) {
        toast.error("Failed to create Hot Vault space");
        setIsProofSetClicked(false);
      }
    } catch (error) {
      console.error("Error creating Hot Vault space:", error);
      toast.error("Error creating Hot Vault space. Please try again.");
      setIsProofSetClicked(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshPaymentSetupStatus();
      toast.success("Balances refreshed", { duration: 2000 });
    } catch (error) {
      console.error("Error refreshing balances:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderTokenApprovalStep = () => {
    const isActive = currentStep === PaymentStep.APPROVE_TOKEN;
    const isCompleted = currentStep > PaymentStep.APPROVE_TOKEN;

    return (
      <div
        className={`w-full p-6 rounded-2xl transition-all ${
          isCompleted
            ? "bg-green-50"
            : isActive
            ? "bg-white border border-gray-200"
            : "bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-4">
          <StepIcon completed={isCompleted} active={isActive} number={1} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`font-semibold text-lg ${
                    isCompleted
                      ? "text-green-700"
                      : isActive
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Authorize USDFC Token
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isCompleted ? "Completed" : "Allow FWS to use your USDFC"}
                </p>
              </div>
              {isCompleted && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Completed
                </span>
              )}
            </div>

            {isActive && (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium">
                      Set Token Allowance
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Specify how many USDFC tokens FWS can transfer on your
                      behalf.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="number"
                    value={tokenAllowance}
                    onChange={(e) => setTokenAllowance(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Allowance amount"
                    min="10"
                    step="0.01"
                    disabled={isProcessing}
                  />
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Minimum required: 10 USDFC</span>
                    <span>
                      Wallet balance: {paymentStatus.usdcBalance} USDFC
                    </span>
                  </div>
                  <button
                    onClick={handleApproveToken}
                    disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        {paymentStatus.error &&
                        paymentStatus.error.includes(
                          "Waiting for blockchain confirmation"
                        )
                          ? paymentStatus.error
                          : "Processing..."}
                      </>
                    ) : (
                      "Approve Token"
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

  const renderDepositStep = () => {
    const isActive = currentStep === PaymentStep.DEPOSIT;
    const isCompleted = currentStep > PaymentStep.DEPOSIT;

    return (
      <div
        className={`w-full p-6 rounded-2xl transition-all ${
          isCompleted
            ? "bg-green-50"
            : isActive
            ? "bg-white border border-gray-200"
            : "bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-4">
          <StepIcon completed={isCompleted} active={isActive} number={2} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`font-semibold text-lg ${
                    isCompleted
                      ? "text-green-700"
                      : isActive
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Deposit USDFC
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isCompleted ? "Completed" : "Deposit funds into FWS"}
                </p>
              </div>
              {isCompleted && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Completed
                </span>
              )}
            </div>

            {isActive && (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium">
                      Deposit Funds
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Deposit USDFC tokens to fund your vault.
                    </p>
                    {paymentStatus.lastApprovalTimestamp > 0 &&
                      Date.now() - paymentStatus.lastApprovalTimestamp <
                        10000 && (
                        <p className="text-sm text-amber-600 mt-2 font-medium">
                          Note: If you just approved tokens, the system may need
                          a few seconds to confirm the transaction.
                        </p>
                      )}
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Deposit amount"
                    min="10"
                    step="0.01"
                    disabled={isProcessing}
                  />
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Minimum required: 10 USDFC</span>
                    <span>
                      Wallet balance: {paymentStatus.usdcBalance} USDFC
                    </span>
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                      "Deposit Funds"
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

  const renderOperatorApprovalStep = () => {
    const isActive = currentStep === PaymentStep.APPROVE_OPERATOR;
    const isCompleted = currentStep > PaymentStep.APPROVE_OPERATOR;
    const isUpdating = isUpdatingAllowances;

    return (
      <div
        className={`w-full p-6 rounded-2xl transition-all ${
          isCompleted && !isUpdating
            ? "bg-green-50"
            : isActive || isUpdating
            ? "bg-white border border-gray-200"
            : "bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-4">
          <StepIcon
            completed={isCompleted && !isUpdating}
            active={isActive || isUpdating}
            number={3}
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`font-semibold text-lg ${
                    isCompleted && !isUpdating
                      ? "text-green-700"
                      : isActive || isUpdating
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Approve PDP Service on FWS
                </h3>
              </div>
              {isCompleted && !isUpdating ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Completed
                </span>
              ) : null}
            </div>

            {isCompleted && !isUpdating && !isActive && (
              <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-gray-700">
                        <span>Rate Allowance</span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="font-mono text-sm break-all">
                          {formatLargeNumber(
                            toDisplayValue(
                              paymentStatus.operatorApproval?.rateAllowance ||
                                "0"
                            )
                          )}{" "}
                          USDFC/epoch
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-gray-700">
                        <span>Lockup Allowance</span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="font-mono text-sm break-all">
                          {formatLargeNumber(
                            toDisplayValue(
                              paymentStatus.operatorApproval?.lockupAllowance ||
                                "0"
                            )
                          )}{" "}
                          USDFC
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsUpdatingAllowances(true)}
                    className="mt-2 w-full px-4 py-2.5 bg-white border border-gray-200 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
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
                      className="text-gray-500"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Update Settings
                  </button>
                </div>
              </div>
            )}

            {(isActive || isUpdating) && (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium">
                      Configure Payment Settings
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Set allowances for the PDP Service to manage payments on
                      your behalf.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rate Allowance (USDFC/epoch)
                    </label>
                    <p className="text-xs mb-2 font-medium text-gray-500">
                      Maximum USDFC/epoch that PDP can spend from your FWS funds
                    </p>
                    <input
                      type="number"
                      value={rateAllowance}
                      onChange={(e) => setRateAllowance(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter rate allowance"
                      min="0.01"
                      step="0.01"
                      disabled={isProcessing}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lockup Allowance (USDFC)
                    </label>
                    <input
                      type="number"
                      value={lockupAllowance}
                      onChange={(e) => setLockupAllowance(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter lockup allowance"
                      min="0.01"
                      step="0.01"
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleApproveOperator}
                      disabled={isProcessing}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          {paymentStatus.error &&
                          paymentStatus.error.includes(
                            "Waiting for blockchain confirmation"
                          )
                            ? paymentStatus.error
                            : "Processing..."}
                        </>
                      ) : isUpdating ? (
                        "Update Settings"
                      ) : (
                        "Approve"
                      )}
                    </button>
                    {isUpdating && (
                      <button
                        onClick={() => {
                          setIsUpdatingAllowances(false);
                          setRateAllowance(
                            paymentStatus.operatorApproval?.rateAllowance || ""
                          );
                          setLockupAllowance(
                            paymentStatus.operatorApproval?.lockupAllowance ||
                              ""
                          );
                        }}
                        className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                        disabled={isProcessing}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCreateProofSetStep = () => {
    const isActive = currentStep === PaymentStep.CREATE_PROOF_SET;
    const isTrulyCompleted = currentStep > PaymentStep.CREATE_PROOF_SET;
    const isProcessingCreation =
      paymentStatus.isCreatingProofSet && !isTrulyCompleted;

    return (
      <div
        className={`w-full p-6 rounded-2xl transition-all ${
          isTrulyCompleted
            ? "bg-green-50"
            : isActive || isProcessingCreation
            ? "bg-white border border-gray-200"
            : "bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-4">
          <StepIcon
            completed={isTrulyCompleted}
            active={isActive || isProcessingCreation}
            number={4}
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`font-semibold text-lg ${
                    isTrulyCompleted
                      ? "text-green-700"
                      : isActive || isProcessingCreation
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Get Hot Vault Space
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isTrulyCompleted
                    ? "Completed"
                    : isProcessingCreation || isProofSetClicked
                    ? "Creation in progress..."
                    : "This will cost you a one-time fee of 0.1 USDFC from your FWS funds."}
                </p>
              </div>
              {isTrulyCompleted && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  We have deducted 0.1 USDFC from your FWS funds.
                </span>
              )}
            </div>

            {isActive && !isProcessingCreation && !isProofSetClicked && (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium">
                      Create Your Proof Set
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      This will register your unique proof set with the Hot
                      Vault service. This process may take several minutes.
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      <span className="font-medium">Cost:</span>{" "}
                      {Constants.PROOF_SET_FEE} USDFC from your FWS funds
                      <span className="ml-2 font-medium">
                        Available in FWS:
                      </span>{" "}
                      {paymentStatus.accountFunds} USDFC
                    </p>
                    {parseFloat(paymentStatus.accountFunds) <
                      parseFloat(Constants.PROOF_SET_FEE) && (
                      <p className="text-sm text-amber-600 mt-2 font-medium">
                        ⚠️ You need at least {Constants.PROOF_SET_FEE} USDFC in
                        your FWS funds to proceed.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleCreateProofSet}
                  disabled={
                    isProcessingCreation ||
                    isProofSetClicked ||
                    parseFloat(paymentStatus.accountFunds) <
                      parseFloat(Constants.PROOF_SET_FEE)
                  }
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Get Hot Vault Space
                </button>
              </div>
            )}

            {(isProcessingCreation || isProofSetClicked) && (
              <div className="mt-4 bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin">
                    <Loader className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Setting Up Hot Vault Space
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Please wait while we set up your Hot Vault space. This
                      typically takes a few minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isTrulyCompleted && (
              <div className="mt-4 bg-white rounded-lg p-4 border border-green-100">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-base font-medium text-green-900">
                      Hot Vault Space Created Successfully!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Your Hot Vault space is ready. You can now proceed to
                      upload files.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCompletionStep = () => {
    const isCompleted =
      paymentStatus.proofSetReady && currentStep === PaymentStep.COMPLETE;

    return (
      <div
        className={`w-full p-6 rounded-2xl transition-all ${
          isCompleted ? "bg-green-50" : "bg-gray-50"
        }`}
      >
        <div className="flex items-start gap-4">
          <StepIcon completed={isCompleted} active={false} number={5} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`font-semibold text-lg ${
                    isCompleted ? "text-green-700" : "text-gray-600"
                  }`}
                >
                  Setup Complete
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isCompleted ? "All steps completed" : "Pending completion"}
                </p>
              </div>
            </div>

            {isCompleted && (
              <div className="mt-4 bg-white rounded-lg p-4 border border-green-100">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="w-full">
                    <p className="text-base font-medium text-green-900">
                      Payment setup complete!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Your payment setup is complete. You can now use all
                      features of the Hot Vault service. Please go to the files
                      tab to upload your files.
                    </p>
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() =>
                          setActiveTab && setActiveTab(DASHBOARD_SECTIONS.FILES)
                        }
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Files className="w-4 h-4" />
                        Go to Files Tab
                      </button>
                      <button
                        onClick={() =>
                          window.open(
                            `http://explore-pdp.xyz:5173/proofsets/${userProofSetId}`,
                            "_blank"
                          )
                        }
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 gap-2 text-blue-600 hover:text-blue-700"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-1"
                        >
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        View Your Vault
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div className="px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Payment Setup</h1>
          <div className="flex gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              {isRefreshing ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh Balances
            </button>
            {paymentStatus.proofSetReady && userProofSetId && (
              <a
                href={`http://explore-pdp.xyz:5173/proofsets/${userProofSetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border bg-background hover:text-accent-foreground h-10 px-4 py-2 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
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
                View Your Vault
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <TokenBalanceCard />

          <div className="mt-6">
            <TransactionHistory />
          </div>
        </div>

        {/* Right Column - Setup Steps */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-medium text-gray-900">
                Payment Setup Steps
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Complete these steps to enable Hot Vault service
              </p>
            </div>

            <div className="p-5 space-y-4">
              {renderTokenApprovalStep()}
              {renderDepositStep()}
              {renderOperatorApprovalStep()}
              {renderCreateProofSetStep()}
              {renderCompletionStep()}

              {!paymentStatus.hasMinimumBalance &&
                !paymentStatus.proofSetReady &&
                (currentStep === PaymentStep.APPROVE_TOKEN ||
                  currentStep === PaymentStep.DEPOSIT) && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        Insufficient Balance
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        You need at least {Constants.MINIMUM_USDFC_BALANCE}{" "}
                        USDFC in your wallet to complete the setup.
                        {paymentStatus.isDeposited
                          ? " Please deposit more funds before proceeding."
                          : " Please complete the token approval step and deposit funds."}
                      </p>
                    </div>
                  </div>
                )}

              {parseFloat(paymentStatus.accountFunds) <
                parseFloat(Constants.PROOF_SET_FEE) &&
                !paymentStatus.proofSetReady &&
                currentStep === PaymentStep.CREATE_PROOF_SET && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        Insufficient FWS Funds
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        You need at least {Constants.PROOF_SET_FEE} USDFC in
                        your FWS funds to create a proof set. Please deposit
                        more funds before proceeding.
                      </p>
                    </div>
                  </div>
                )}

              {paymentStatus.error && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-100 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-700 mt-1">
                      {paymentStatus.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useState, useEffect } from "react";
import { usePayment } from "@/contexts/PaymentContext";
import { TokenBalanceCard } from "./TokenBalanceCard";
import { Wallet, CheckCircle, Loader, Info, AlertTriangle } from "lucide-react";
import * as Constants from "@/lib/constants";
import { toast } from "react-hot-toast";
import { TransactionHistory } from "./TransactionHistory";

enum PaymentStep {
  APPROVE_TOKEN = 0,
  DEPOSIT = 1,
  APPROVE_OPERATOR = 2,
  CREATE_PROOF_SET = 3,
  COMPLETE = 4,
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

// First, let's add a helper function at the top of the file to format large numbers
const formatLargeNumber = (num: string) => {
  // Remove trailing zeros after decimal
  const trimmed = num.replace(/\.?0+$/, "");
  if (trimmed.length <= 12) return trimmed;

  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
};

export const PaymentSetupTab = () => {
  const {
    paymentStatus,
    approveToken,
    depositFunds,
    approveServiceOperator,
    refreshPaymentSetupStatus,
    initiateProofSetCreation,
  } = usePayment();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<PaymentStep>(
    PaymentStep.APPROVE_TOKEN
  );

  // State for user input values
  const [tokenAllowance, setTokenAllowance] = useState("100");
  const [depositAmount, setDepositAmount] = useState(
    (parseFloat(Constants.PROOF_SET_FEE) + 0.01).toFixed(2)
  );
  const [rateAllowance, setRateAllowance] = useState("");
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [isUpdatingAllowances, setIsUpdatingAllowances] = useState(false);
  const [isProofSetClicked, setIsProofSetClicked] = useState(false);

  // Load current allowances when operator is approved
  useEffect(() => {
    if (paymentStatus.isOperatorApproved && !isUpdatingAllowances) {
      setRateAllowance(paymentStatus.operatorApproval?.rateAllowance || "");
      setLockupAllowance(paymentStatus.operatorApproval?.lockupAllowance || "");
    }
  }, [paymentStatus.isOperatorApproved, paymentStatus.operatorApproval]);

  // Determine the current step based on payment status
  useEffect(() => {
    if (paymentStatus.proofSetReady) {
      setCurrentStep(PaymentStep.COMPLETE);
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

  // Real implementation for the token approval step
  const handleApproveToken = async () => {
    if (!tokenAllowance || parseFloat(tokenAllowance) <= 0) {
      toast.error("Please enter a valid allowance amount");
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

  // Real implementation for the deposit step
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

    setIsProcessing(true);
    try {
      const result = await depositFunds(depositAmount);
      if (result) {
        toast.success(`Successfully deposited ${depositAmount} USDFC`);
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

  // Real implementation for the operator approval step
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
        rateAllowance,
        lockupAllowance
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

  // Helper to render token approval step with input field
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
                  Approve USDFC Token
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isCompleted
                    ? "Completed"
                    : "Allow the Payments contract to use your USDFC"}
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
                      Specify how many USDFC tokens the Payments contract can
                      transfer on your behalf.
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
                    min={Constants.PROOF_SET_FEE}
                    step="0.01"
                    disabled={isProcessing}
                  />
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>
                      Minimum required: {Constants.PROOF_SET_FEE} USDFC
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
                        Processing...
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

  // Helper to render deposit step with input field
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
                  {isCompleted
                    ? "Completed"
                    : "Deposit funds into the Payments contract"}
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
                      Deposit USDFC tokens to fund your proofs. A minimum amount
                      is required for proof set creation.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Deposit amount"
                    min={Constants.PROOF_SET_FEE}
                    step="0.01"
                    disabled={isProcessing}
                  />
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>
                      Minimum required: {Constants.PROOF_SET_FEE} USDFC
                    </span>
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Processing...
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

  // Helper to render operator approval step with input fields
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
                  PDP Service Operator Settings
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isCompleted && !isUpdating
                    ? "Completed"
                    : "Configure payment rail settings"}
                </p>
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
                      <span className="text-sm font-medium text-gray-700">
                        Rate Allowance
                      </span>
                      <span className="text-xs text-gray-500">USDFC/epoch</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="font-mono text-sm break-all">
                        {formatLargeNumber(
                          paymentStatus.operatorApproval?.rateAllowance || "0"
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Lockup Allowance
                      </span>
                      <span className="text-xs text-gray-500">USDFC</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="font-mono text-sm break-all">
                        {formatLargeNumber(
                          paymentStatus.operatorApproval?.lockupAllowance || "0"
                        )}
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
                      Set allowances for the PDP Service operator to manage
                      payments on your behalf.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rate Allowance (USDFC/epoch)
                    </label>
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
                          Processing...
                        </>
                      ) : isUpdating ? (
                        "Update Settings"
                      ) : (
                        "Approve Operator"
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

  // Helper to render the new proof set creation step
  const renderCreateProofSetStep = () => {
    const isActive = currentStep === PaymentStep.CREATE_PROOF_SET;
    const isTrulyCompleted = currentStep > PaymentStep.CREATE_PROOF_SET;
    const isProcessingCreation =
      paymentStatus.isCreatingProofSet && !isTrulyCompleted;

    const handleCreateProofSet = async () => {
      setIsProofSetClicked(true);
      await initiateProofSetCreation();
    };

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
                  Create Proof Set
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isTrulyCompleted
                    ? "Completed"
                    : isProcessingCreation || isProofSetClicked
                    ? "Creation in progress..."
                    : "Create your proof set on the network"}
                </p>
              </div>
              {isTrulyCompleted && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Completed
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
                  </div>
                </div>

                <button
                  onClick={handleCreateProofSet}
                  disabled={isProcessingCreation || isProofSetClicked}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Create Proof Set
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
                      Creating Proof Set
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Please wait while we set up your proof set. This typically
                      takes 5-10 minutes.
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

  // Helper to render completion step
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
                  <div>
                    <p className="text-base font-medium text-green-900">
                      Payment setup complete!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Your payment setup is complete. You can now use all
                      features of the Hot Vault service.
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

  return (
    <div className="animate-fadeIn">
      <div className="px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-500" />
          Payment Setup
        </h1>
        <p className="text-gray-600 mt-1">
          Configure your payment settings to use the Hot Vault service
        </p>
      </div>

      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div>
          <TokenBalanceCard />

          <div className="mt-6 bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
            <div className="p-4 border-b border-blue-100">
              <h3 className="text-sm font-medium text-blue-900">
                Why do I need to set up payments?
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-blue-700">
                Hot Vault requires a one-time payment setup to create your proof
                set. This includes approving the token, depositing USDFC, and
                allowing the service to create proofs on your behalf.
              </p>

              <div className="mt-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">
                  Payment Details
                </h4>
                <div className="bg-white bg-opacity-50 rounded p-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-700">
                      Proof Set Creation Fee
                    </span>
                    <span className="font-medium text-blue-900">
                      {Constants.PROOF_SET_FEE} USDFC
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-700">Payment Contract</span>
                    <span className="font-mono text-xs text-blue-900">
                      {Constants.PAYMENT_PROXY_ADDRESS.slice(0, 6)}...
                      {Constants.PAYMENT_PROXY_ADDRESS.slice(-4)}
                    </span>
                  </div>
                </div>
              </div>

              {paymentStatus.isDeposited && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">
                    Account Status
                  </h4>
                  <div className="bg-white bg-opacity-50 rounded p-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-blue-700">
                        Funds in Payments Contract
                      </span>
                      <span className="font-medium text-blue-900">
                        {parseFloat(paymentStatus.accountFunds).toFixed(6)}{" "}
                        USDFC
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

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

              {!paymentStatus.hasMinimumBalance && (
                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800">
                      Insufficient USDFC Balance
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      You need at least {Constants.MINIMUM_USDFC_BALANCE} USDFC
                      to complete the setup. Please obtain USDFC tokens before
                      proceeding.
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

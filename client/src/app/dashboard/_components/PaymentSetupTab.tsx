import { useState, useEffect } from "react";
import { usePayment } from "@/contexts/PaymentContext";
import { TokenBalanceCard } from "./TokenBalanceCard";
import {
  Wallet,
  CheckCircle,
  AlertCircle,
  Loader,
  Info,
  ShieldCheck,
} from "lucide-react";
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
  const [rateAllowance, setRateAllowance] = useState("1");
  const [lockupAllowance, setLockupAllowance] = useState("1");

  // Determine the current step based on payment status
  useEffect(() => {
    if (paymentStatus.proofSetReady) {
      setCurrentStep(PaymentStep.COMPLETE);
    } else if (paymentStatus.isCreatingProofSet) {
      setCurrentStep(PaymentStep.COMPLETE);
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
      toast.error("Please enter valid allowance amounts");
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
          `PDP Service operator approved with ${rateAllowance} USDFC rate allowance and ${lockupAllowance} USDFC lockup allowance`
        );
        await refreshPaymentSetupStatus();
      } else {
        toast.error("Failed to approve PDP Service operator");
      }
    } catch (error) {
      console.error("Error approving operator:", error);
      toast.error("Error approving operator. Please try again.");
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
        className={`w-full p-4 rounded-lg transition-all ${
          isActive
            ? "bg-blue-50 border border-blue-200"
            : isCompleted
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive
                ? "bg-blue-100 text-blue-600"
                : isCompleted
                ? "bg-green-100 text-green-600"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isCompleted ? (
              <CheckCircle size={18} />
            ) : (
              <span className="text-sm font-semibold">1</span>
            )}
          </div>
          <div className="flex-1">
            <p
              className={`font-medium ${
                isActive
                  ? "text-blue-700"
                  : isCompleted
                  ? "text-green-700"
                  : "text-gray-600"
              }`}
            >
              Approve USDFC Token
            </p>
            <p className="text-xs text-gray-500">
              {isActive && isProcessing ? (
                <span className="flex items-center text-blue-600">
                  <Loader size={12} className="animate-spin mr-1" />{" "}
                  Processing...
                </span>
              ) : isActive ? (
                "Allow the Payments contract to use your USDFC"
              ) : isCompleted ? (
                "Completed"
              ) : (
                "Pending"
              )}
            </p>
          </div>
        </div>

        {isActive && (
          <div className="mt-3 bg-white p-3 rounded border border-blue-100">
            <div className="flex items-center mb-2">
              <Info size={14} className="text-blue-500 mr-2" />
              <span className="text-xs text-blue-700">
                Specify how many USDFC tokens the Payments contract can transfer
                on your behalf
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={tokenAllowance}
                onChange={(e) => setTokenAllowance(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Allowance amount"
                disabled={isProcessing}
                min={Constants.PROOF_SET_FEE}
                step="0.01"
              />
              <span className="text-sm text-gray-500">USDFC</span>
              <button
                onClick={handleApproveToken}
                disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
              >
                {isProcessing ? (
                  <>
                    <Loader size={14} className="animate-spin mr-1" />
                    Processing...
                  </>
                ) : (
                  "Approve"
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Minimum required: {Constants.PROOF_SET_FEE} USDFC
            </p>
          </div>
        )}
      </div>
    );
  };

  // Helper to render deposit step with input field
  const renderDepositStep = () => {
    const isActive = currentStep === PaymentStep.DEPOSIT;
    const isCompleted = currentStep > PaymentStep.DEPOSIT;

    return (
      <div
        className={`w-full p-4 rounded-lg transition-all ${
          isActive
            ? "bg-blue-50 border border-blue-200"
            : isCompleted
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive
                ? "bg-blue-100 text-blue-600"
                : isCompleted
                ? "bg-green-100 text-green-600"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isCompleted ? (
              <CheckCircle size={18} />
            ) : (
              <span className="text-sm font-semibold">2</span>
            )}
          </div>
          <div className="flex-1">
            <p
              className={`font-medium ${
                isActive
                  ? "text-blue-700"
                  : isCompleted
                  ? "text-green-700"
                  : "text-gray-600"
              }`}
            >
              Deposit USDFC
            </p>
            <p className="text-xs text-gray-500">
              {isActive && isProcessing ? (
                <span className="flex items-center text-blue-600">
                  <Loader size={12} className="animate-spin mr-1" />{" "}
                  Processing...
                </span>
              ) : isActive ? (
                "Deposit funds into the Payments contract"
              ) : isCompleted ? (
                "Completed"
              ) : (
                "Pending"
              )}
            </p>
          </div>
        </div>

        {isActive && (
          <div className="mt-3 bg-white p-3 rounded border border-blue-100">
            <div className="flex items-center mb-2">
              <Info size={14} className="text-blue-500 mr-2" />
              <span className="text-xs text-blue-700">
                Deposit USDFC tokens to fund your proofs
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Deposit amount"
                disabled={isProcessing}
                min={Constants.PROOF_SET_FEE}
                step="0.01"
              />
              <span className="text-sm text-gray-500">USDFC</span>
              <button
                onClick={handleDeposit}
                disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
              >
                {isProcessing ? (
                  <>
                    <Loader size={14} className="animate-spin mr-1" />
                    Processing...
                  </>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Minimum required: {Constants.PROOF_SET_FEE} USDFC for proof set
              creation
            </p>
          </div>
        )}
      </div>
    );
  };

  // Helper to render operator approval step with input fields
  const renderOperatorApprovalStep = () => {
    const isActive = currentStep === PaymentStep.APPROVE_OPERATOR;
    const isCompleted = currentStep > PaymentStep.APPROVE_OPERATOR;

    return (
      <div
        className={`w-full p-4 rounded-lg transition-all ${
          isActive
            ? "bg-blue-50 border border-blue-200"
            : isCompleted
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive
                ? "bg-blue-100 text-blue-600"
                : isCompleted
                ? "bg-green-100 text-green-600"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isCompleted ? (
              <CheckCircle size={18} />
            ) : (
              <span className="text-sm font-semibold">3</span>
            )}
          </div>
          <div className="flex-1">
            <p
              className={`font-medium ${
                isActive
                  ? "text-blue-700"
                  : isCompleted
                  ? "text-green-700"
                  : "text-gray-600"
              }`}
            >
              Approve PDP Service Operator
            </p>
            <p className="text-xs text-gray-500">
              {isActive && isProcessing ? (
                <span className="flex items-center text-blue-600">
                  <Loader size={12} className="animate-spin mr-1" />{" "}
                  Processing...
                </span>
              ) : isActive ? (
                "Allow the PDP Service to create payment rails"
              ) : isCompleted ? (
                "Completed"
              ) : (
                "Pending"
              )}
            </p>
          </div>
        </div>

        {isActive && (
          <div className="mt-3 bg-white p-3 rounded border border-blue-100">
            <div className="flex items-center mb-3">
              <Info size={14} className="text-blue-500 mr-2" />
              <span className="text-xs text-blue-700">
                Set allowances for the PDP Service operator
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Rate Allowance (USDFC/epoch)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rateAllowance}
                    onChange={(e) => setRateAllowance(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Rate allowance"
                    disabled={isProcessing}
                    min="0.01"
                    step="0.01"
                  />
                  <span className="text-sm text-gray-500">USDFC</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Maximum payment rate per epoch (block)
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Lockup Allowance (USDFC)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={lockupAllowance}
                    onChange={(e) => setLockupAllowance(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Lockup allowance"
                    disabled={isProcessing}
                    min="0.01"
                    step="0.01"
                  />
                  <span className="text-sm text-gray-500">USDFC</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Maximum amount that can be locked for future payments
                </p>
              </div>

              <button
                onClick={handleApproveOperator}
                disabled={!paymentStatus.hasMinimumBalance || isProcessing}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
              >
                {isProcessing ? (
                  <>
                    <Loader size={14} className="animate-spin mr-1" />
                    Processing...
                  </>
                ) : (
                  "Approve Operator"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Helper to render the new proof set creation step
  const renderCreateProofSetStep = () => {
    const isActive = currentStep === PaymentStep.CREATE_PROOF_SET;
    const isTrulyCompleted = currentStep > PaymentStep.CREATE_PROOF_SET;
    const isProcessingCreation =
      paymentStatus.isCreatingProofSet && !isTrulyCompleted;

    return (
      <div
        className={`w-full p-4 rounded-lg transition-all ${
          isActive || isProcessingCreation
            ? "bg-blue-50 border border-blue-200"
            : isTrulyCompleted
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isProcessingCreation
                ? "bg-blue-100 text-blue-600"
                : isActive
                ? "bg-blue-100 text-blue-600"
                : isTrulyCompleted
                ? "bg-green-100 text-green-600"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isTrulyCompleted ? (
              <CheckCircle size={18} />
            ) : isProcessingCreation ? (
              <Loader size={18} className="animate-spin" />
            ) : (
              <span className="text-sm font-semibold">4</span>
            )}
          </div>
          <div className="flex-1">
            <p
              className={`font-medium ${
                isActive || isProcessingCreation
                  ? "text-blue-700"
                  : isTrulyCompleted
                  ? "text-green-700"
                  : "text-gray-600"
              }`}
            >
              Create Proof Set
            </p>
            <p className="text-xs text-gray-500">
              {isProcessingCreation ? (
                <span className="flex items-center text-blue-600">
                  <Loader size={12} className="animate-spin mr-1" />
                  Creation in progress... (This may take several minutes)
                </span>
              ) : isActive ? (
                "Final step: Initiate proof set creation on the network"
              ) : isTrulyCompleted ? (
                "Completed"
              ) : (
                "Pending"
              )}
            </p>
          </div>
        </div>

        {isActive && !isProcessingCreation && (
          <div className="mt-3 bg-white p-3 rounded border border-blue-100">
            <div className="flex items-center mb-3">
              <Info size={14} className="text-blue-500 mr-2" />
              <span className="text-xs text-blue-700">
                This action will register your unique proof set with the FWS
                service. It may take a few minutes.
              </span>
            </div>

            <button
              onClick={initiateProofSetCreation}
              disabled={isProcessingCreation || paymentStatus.isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
            >
              {isProcessingCreation ? (
                <>
                  <Loader size={14} className="animate-spin mr-1" />
                  Processing...
                </>
              ) : (
                <span className="flex items-center">
                  <ShieldCheck size={14} className="mr-1.5" />
                  Create Proof Set
                </span>
              )}
            </button>
            {paymentStatus.error &&
              paymentStatus.error.includes("already exists") && (
                <p className="mt-2 text-xs text-amber-600">
                  Proof set already exists. Refreshing status...
                </p>
              )}
          </div>
        )}
      </div>
    );
  };

  // Helper to render completion step
  const renderCompletionStep = () => {
    const isCompleted =
      paymentStatus.proofSetReady && currentStep === PaymentStep.COMPLETE;
    const isCreating =
      paymentStatus.isCreatingProofSet && currentStep === PaymentStep.COMPLETE;

    return (
      <div
        className={`w-full p-4 rounded-lg transition-all ${
          isCompleted
            ? "bg-green-50 border border-green-200"
            : isCreating
            ? "bg-blue-50 border border-blue-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isCompleted
                ? "bg-green-100 text-green-600"
                : isCreating
                ? "bg-blue-100 text-blue-600"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isCompleted ? (
              <CheckCircle size={18} />
            ) : isCreating ? (
              <Loader size={18} className="animate-spin" />
            ) : (
              <span className="text-sm font-semibold">5</span>
            )}
          </div>
          <div>
            <p
              className={`font-medium ${
                isCompleted
                  ? "text-green-700"
                  : isCreating
                  ? "text-blue-700"
                  : "text-gray-600"
              }`}
            >
              Setup Complete
            </p>
            <p className="text-xs text-gray-500">
              {isCompleted
                ? "All steps completed"
                : isCreating
                ? "Creating proof set..."
                : "Pending"}
            </p>
          </div>
        </div>

        {isCompleted && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg text-green-700 flex items-start">
            <CheckCircle size={20} className="mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Payment setup complete!</p>
              <p className="text-sm mt-1">
                Your payment setup is complete. You can now use all features of
                the FWS service.
              </p>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg text-blue-700 flex items-start">
            <Loader
              size={20}
              className="animate-spin mr-3 mt-0.5 flex-shrink-0"
            />
            <div>
              <p className="font-semibold">Creating your proof set...</p>
              <p className="text-sm mt-1">
                This process typically takes 5-10 minutes. Please wait while we
                set up your proof set on the blockchain.
              </p>
            </div>
          </div>
        )}
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
          Configure your payment settings to use the FWS service
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
                FWS requires a one-time payment setup to create your proof set.
                This includes approving the token, depositing USDFC, and
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
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-medium text-gray-900">
                Payment Setup Steps
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Complete these steps to enable FWS service
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
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
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
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
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

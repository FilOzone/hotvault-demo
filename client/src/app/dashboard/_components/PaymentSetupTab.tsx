import { useState } from "react";
import { usePayment } from "@/contexts/PaymentContext";
import { TokenBalanceCard } from "./TokenBalanceCard";
import {
  Wallet,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader,
} from "lucide-react";
import * as Constants from "@/lib/constants";

enum PaymentStep {
  APPROVE_TOKEN = 0,
  DEPOSIT = 1,
  APPROVE_OPERATOR = 2,
  COMPLETE = 3,
}

export const PaymentSetupTab = () => {
  const { paymentStatus } = usePayment();
  const [currentStep, setCurrentStep] = useState<PaymentStep>(
    PaymentStep.APPROVE_TOKEN
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock functions for the payment steps - these would be replaced with actual implementations
  const handleApproveToken = async () => {
    setIsProcessing(true);
    try {
      // Implement token approval using PaymentContext
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate processing
      setCurrentStep(PaymentStep.DEPOSIT);
    } catch (error) {
      console.error("Error approving token:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeposit = async () => {
    setIsProcessing(true);
    try {
      // Implement deposit using PaymentContext
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate processing
      setCurrentStep(PaymentStep.APPROVE_OPERATOR);
    } catch (error) {
      console.error("Error depositing USDFC:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveOperator = async () => {
    setIsProcessing(true);
    try {
      // Implement operator approval using PaymentContext
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate processing
      setCurrentStep(PaymentStep.COMPLETE);
    } catch (error) {
      console.error("Error approving operator:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to render the correct step button
  const renderStepButton = (
    step: PaymentStep,
    currentStep: PaymentStep,
    label: string,
    onClick: () => Promise<void>,
    disabled: boolean
  ) => {
    const isActive = currentStep === step;
    const isCompleted = currentStep > step;

    return (
      <button
        onClick={onClick}
        disabled={!isActive || disabled || isProcessing}
        className={`w-full flex items-center justify-between p-4 rounded-lg transition-all ${
          isActive
            ? "bg-blue-50 border border-blue-200 hover:bg-blue-100"
            : isCompleted
            ? "bg-green-50 border border-green-200"
            : "bg-gray-50 border border-gray-200 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3">
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
              <span className="text-sm font-semibold">{step + 1}</span>
            )}
          </div>
          <div className="text-left">
            <p
              className={`font-medium ${
                isActive
                  ? "text-blue-700"
                  : isCompleted
                  ? "text-green-700"
                  : "text-gray-600"
              }`}
            >
              {label}
            </p>
            <p className="text-xs text-gray-500">
              {isActive && isProcessing ? (
                <span className="flex items-center text-blue-600">
                  <Loader size={12} className="animate-spin mr-1" />{" "}
                  Processing...
                </span>
              ) : isActive ? (
                "Click to proceed"
              ) : isCompleted ? (
                "Completed"
              ) : (
                "Pending"
              )}
            </p>
          </div>
        </div>
        {isActive && !isProcessing && (
          <ArrowRight size={18} className="text-blue-500" />
        )}
      </button>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          <Wallet size={20} className="mr-2 text-blue-500" />
          Payment Setup
        </h2>
        <p className="text-gray-600 mt-1">
          Configure your payment settings to use the FWS service
        </p>
      </div>

      <div className="p-6 grid md:grid-cols-5 gap-6">
        <div className="md:col-span-2">
          <TokenBalanceCard />

          {/* Helpful info card */}
          <div className="mt-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">
              Why do I need to set up payments?
            </h3>
            <p className="text-sm text-blue-700">
              FWS requires a one-time payment setup to create your proof set.
              This includes approving the token, depositing USDFC, and allowing
              the service to create proofs on your behalf.
            </p>

            <h3 className="text-sm font-semibold text-blue-800 mt-4 mb-2">
              Payment Details
            </h3>
            <div className="bg-white bg-opacity-50 rounded p-3 text-xs">
              <div className="flex justify-between py-1 border-b border-blue-100">
                <span>Proof Set Creation Fee</span>
                <span className="font-medium">
                  {Constants.PROOF_SET_FEE} USDFC
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span>Payment Contract</span>
                <span className="font-mono text-xs truncate max-w-[140px]">
                  {Constants.PAYMENT_PROXY_ADDRESS.substring(0, 6)}...
                  {Constants.PAYMENT_PROXY_ADDRESS.substring(
                    Constants.PAYMENT_PROXY_ADDRESS.length - 4
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-medium text-gray-800">
                Payment Setup Steps
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Complete these steps to enable FWS service
              </p>
            </div>

            <div className="p-5 space-y-3">
              {/* Step 1: Approve Token */}
              {renderStepButton(
                PaymentStep.APPROVE_TOKEN,
                currentStep,
                "Approve USDFC Token",
                handleApproveToken,
                !paymentStatus.hasMinimumBalance
              )}

              {/* Step 2: Deposit */}
              {renderStepButton(
                PaymentStep.DEPOSIT,
                currentStep,
                "Deposit USDFC",
                handleDeposit,
                !paymentStatus.hasMinimumBalance
              )}

              {/* Step 3: Approve Operator */}
              {renderStepButton(
                PaymentStep.APPROVE_OPERATOR,
                currentStep,
                "Approve PDP Service Operator",
                handleApproveOperator,
                !paymentStatus.hasMinimumBalance
              )}

              {/* Payment Success Message */}
              {currentStep === PaymentStep.COMPLETE && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200 text-green-700 flex items-start">
                  <CheckCircle
                    size={20}
                    className="mr-3 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="font-semibold">Payment setup complete!</p>
                    <p className="text-sm mt-1">
                      Your payment setup is complete. You can now use all
                      features of the FWS service.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning for insufficient balance */}
              {!paymentStatus.hasMinimumBalance && (
                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 flex items-start">
                  <AlertCircle
                    size={20}
                    className="mr-3 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="font-semibold">Insufficient USDFC Balance</p>
                    <p className="text-sm mt-1">
                      You need at least {Constants.MINIMUM_USDFC_BALANCE} USDFC
                      to complete the setup. Please obtain USDFC tokens before
                      proceeding.
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

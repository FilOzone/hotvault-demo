import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { ethers } from "ethers";
import { useAuth } from "./AuthContext";
import {
  getUSDFCBalance,
  approveUSDFCSpending,
  depositUSDFC,
  approveOperator,
  getAccountStatus,
  getOperatorApproval,
} from "@/lib/contracts";
import * as Constants from "@/lib/constants";

// Define interface for transaction history
export interface TransactionRecord {
  id: string;
  type: "token_approval" | "deposit" | "operator_approval";
  txHash: string;
  amount?: string;
  timestamp: number;
  status: "pending" | "success" | "failed";
  error?: string;
}

// Define the payment status interface
interface PaymentStatus {
  usdcBalance: string;
  hasMinimumBalance: boolean;
  isLoading: boolean;
  error: string | null;
  isTokenApproved: boolean;
  isDeposited: boolean;
  isOperatorApproved: boolean;
  accountFunds: string;
  proofSetReady: boolean;
  isCreatingProofSet: boolean;
}

// Define the context type
interface PaymentContextType {
  paymentStatus: PaymentStatus;
  refreshBalance: () => Promise<void>;
  refreshPaymentSetupStatus: () => Promise<void>;
  approveToken: (amount: string) => Promise<boolean>;
  depositFunds: (amount: string) => Promise<boolean>;
  approveServiceOperator: (
    rateAllowance: string,
    lockupAllowance: string
  ) => Promise<boolean>;
  initiateProofSetCreation: () => Promise<boolean>;
  transactions: TransactionRecord[];
  clearTransactionHistory: () => void;
}

// Create the context
const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

// Helper to generate a unique ID
const generateId = () =>
  `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Create provider component
export const PaymentProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { account } = useAuth();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    usdcBalance: "0",
    hasMinimumBalance: false,
    isLoading: false,
    error: null,
    isTokenApproved: false,
    isDeposited: false,
    isOperatorApproved: false,
    accountFunds: "0",
    proofSetReady: false,
    isCreatingProofSet: false,
  });
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  // Function to add a transaction to history
  const addTransaction = (transaction: Omit<TransactionRecord, "id">) => {
    const newTransaction = {
      ...transaction,
      id: generateId(),
    };
    setTransactions((prev) => [newTransaction, ...prev]);
    return newTransaction.id;
  };

  // Function to update a transaction in history
  const updateTransaction = (
    id: string,
    updates: Partial<TransactionRecord>
  ) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
    );
  };

  // Function to clear transaction history
  const clearTransactionHistory = () => {
    setTransactions([]);
  };

  // Function to refresh the balance
  const refreshBalance = useCallback(async () => {
    if (!account) {
      setPaymentStatus((prev) => ({
        ...prev,
        usdcBalance: "0",
        hasMinimumBalance: false,
        error: null,
        isLoading: false,
      }));
      return;
    }

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Ensure ethereum exists
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      // Create a provider
      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );

      // Get USDFC balance
      const balanceResult = await getUSDFCBalance(
        provider,
        Constants.USDFC_TOKEN_ADDRESS,
        account
      );

      setPaymentStatus((prev) => ({
        ...prev,
        usdcBalance: balanceResult.formattedBalance,
        hasMinimumBalance: balanceResult.hasMinimumBalance,
        isLoading: false,
      }));

      console.log(
        `USDFC Balance for ${account}: ${balanceResult.formattedBalance}`
      );
      if (!balanceResult.hasMinimumBalance) {
        console.warn(
          `User has insufficient USDFC balance (${balanceResult.formattedBalance}). Minimum required: ${Constants.MINIMUM_USDFC_BALANCE}`
        );
      }
    } catch (error) {
      console.error("Error checking USDFC balance:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to check USDFC balance",
        isLoading: false,
      }));
    }
  }, [account]);

  const refreshPaymentSetupStatus = useCallback(async () => {
    if (!account) return;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Ensure ethereum exists
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      // Create a provider
      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );

      // Fetch proofSetReady status from the auth endpoint
      let fetchedProofSetReady = false;
      try {
        const statusResponse = await fetch(
          `${Constants.API_BASE_URL}/api/v1/auth/status`,
          {
            method: "GET",
            credentials: "include",
          }
        );
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          fetchedProofSetReady = statusData.proofSetReady;
        }
      } catch (authStatusError) {
        console.error(
          "Error fetching auth status for proofSetReady:",
          authStatusError
        );
        // Keep proofSetReady as false if status check fails
      }

      // Check if user has deposited funds into the Payments contract
      try {
        const accountStatus = await getAccountStatus(
          provider,
          Constants.PAYMENT_PROXY_ADDRESS,
          Constants.USDFC_TOKEN_ADDRESS,
          account
        );

        // Check if user has approved the PDP service operator
        const operatorStatus = await getOperatorApproval(
          provider,
          Constants.PAYMENT_PROXY_ADDRESS,
          Constants.USDFC_TOKEN_ADDRESS,
          account,
          Constants.PDP_SERVICE_ADDRESS
        );

        // Check if deposited amount is at least the proof set fee
        const minDepositAmount = parseFloat(Constants.PROOF_SET_FEE);
        const isDeposited = parseFloat(accountStatus.funds) >= minDepositAmount;

        setPaymentStatus((prev) => ({
          ...prev,
          isDeposited,
          isOperatorApproved: operatorStatus.isApproved,
          accountFunds: accountStatus.funds,
          proofSetReady: fetchedProofSetReady,
          isLoading: false,
        }));

        console.log(`Payment setup status for ${account}:`, {
          isDeposited,
          funds: accountStatus.funds,
          isOperatorApproved: operatorStatus.isApproved,
        });
      } catch {
        // If we can't get the account status, it likely means the user hasn't interacted with the contract yet
        console.log("User hasn't interacted with the Payments contract yet");
        setPaymentStatus((prev) => ({
          ...prev,
          isDeposited: false,
          isOperatorApproved: false,
          accountFunds: "0",
          proofSetReady: fetchedProofSetReady,
        }));
      }

      // Create a token contract to check allowance
      const tokenContract = new ethers.Contract(
        Constants.USDFC_TOKEN_ADDRESS,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
        ],
        provider
      );

      const tokenAllowance = await tokenContract.allowance(
        account,
        Constants.PAYMENT_PROXY_ADDRESS
      );

      // Check if allowance is enough for the proof set fee
      const minimumAllowance = ethers.parseUnits(Constants.PROOF_SET_FEE, 6); // Assume 6 decimals for USDFC
      const isTokenApproved = tokenAllowance >= minimumAllowance;

      setPaymentStatus((prev) => ({
        ...prev,
        isTokenApproved,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error checking payment setup status:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to check payment setup status",
        isLoading: false,
        proofSetReady: false,
      }));
    }
  }, [account]);

  // Approve the Payments contract to spend tokens
  const approveToken = async (amount: string): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    // Create transaction record
    const txId = addTransaction({
      type: "token_approval",
      txHash: "",
      amount,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      // Ensure ethereum exists
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      // Create a provider and signer
      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      // Approve spending
      const txResponse = await approveUSDFCSpending(
        signer,
        Constants.USDFC_TOKEN_ADDRESS,
        Constants.PAYMENT_PROXY_ADDRESS,
        amount
      );

      // Update transaction with hash
      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update status
      setPaymentStatus((prev) => ({
        ...prev,
        isTokenApproved: true,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      console.error("Error approving token spending:", error);

      // Update transaction with error
      updateTransaction(txId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to approve token spending",
        isLoading: false,
      }));
      return false;
    }
  };

  // Deposit funds into the Payments contract
  const depositFunds = async (amount: string): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    // Create transaction record
    const txId = addTransaction({
      type: "deposit",
      txHash: "",
      amount,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      // Ensure ethereum exists
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      // Create a provider and signer
      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      // Deposit funds
      const txResponse = await depositUSDFC(
        signer,
        Constants.PAYMENT_PROXY_ADDRESS,
        Constants.USDFC_TOKEN_ADDRESS,
        amount
      );

      // Update transaction with hash
      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update status and refresh account funds
      await refreshPaymentSetupStatus();

      return true;
    } catch (error) {
      console.error("Error depositing funds:", error);

      // Update transaction with error
      updateTransaction(txId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to deposit funds",
        isLoading: false,
      }));
      return false;
    }
  };

  // Approve the PDP service operator
  const approveServiceOperator = async (
    rateAllowance: string,
    lockupAllowance: string
  ): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    // Create transaction record
    const txId = addTransaction({
      type: "operator_approval",
      txHash: "",
      amount: `Rate: ${rateAllowance}, Lockup: ${lockupAllowance}`,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      // Ensure ethereum exists
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      // Create a provider and signer
      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      // Approve operator
      const txResponse = await approveOperator(
        signer,
        Constants.PAYMENT_PROXY_ADDRESS,
        Constants.USDFC_TOKEN_ADDRESS,
        Constants.PDP_SERVICE_ADDRESS,
        rateAllowance,
        lockupAllowance
      );

      // Update transaction with hash
      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update status
      setPaymentStatus((prev) => ({
        ...prev,
        isOperatorApproved: true,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      console.error("Error approving service operator:", error);

      // Update transaction with error
      updateTransaction(txId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to approve service operator",
        isLoading: false,
      }));
      return false;
    }
  };

  // Function to initiate proof set creation
  const initiateProofSetCreation = async (): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({
      ...prev,
      isLoading: true,
      isCreatingProofSet: true,
      error: null,
    }));

    try {
      const token = localStorage.getItem("jwt_token"); // Or get from cookie if not using localStorage
      if (!token) {
        throw new Error("Authentication token not found.");
      }

      const response = await fetch(
        `${Constants.API_BASE_URL}/api/v1/proof-set/create`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include", // Include if using cookies primarily
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to initiate proof set creation"
        );
      }

      console.log("Proof set creation initiated successfully.");
      // Optionally trigger a delayed refresh or rely on polling in the UI
      setTimeout(() => refreshPaymentSetupStatus(), 5000); // Refresh status after 5s

      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: false,
        isCreatingProofSet: false,
      }));
      return true;
    } catch (error) {
      console.error("Error initiating proof set creation:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        isLoading: false,
        isCreatingProofSet: false,
      }));
      return false;
    }
  };

  // Check balance and payment setup status when account changes
  useEffect(() => {
    refreshBalance();
    refreshPaymentSetupStatus();
  }, [account, refreshBalance, refreshPaymentSetupStatus]);

  return (
    <PaymentContext.Provider
      value={{
        paymentStatus,
        refreshBalance,
        refreshPaymentSetupStatus,
        approveToken,
        depositFunds,
        approveServiceOperator,
        initiateProofSetCreation,
        transactions,
        clearTransactionHistory,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
};

// Hook to use the payment context
export function usePayment() {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error("usePayment must be used within a PaymentProvider");
  }
  return context;
}

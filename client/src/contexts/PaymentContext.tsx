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
  withdrawUSDFC,
} from "@/lib/contracts";
import * as Constants from "@/lib/constants";

export const BALANCE_UPDATED_EVENT = "BALANCE_UPDATED";

export interface TransactionRecord {
  id: string;
  type: "token_approval" | "deposit" | "operator_approval" | "withdraw";
  txHash: string;
  amount?: string;
  timestamp: number;
  status: "pending" | "success" | "failed";
  error?: string;
}

export type PaymentStatus = {
  isTokenApproved: boolean;
  isDeposited: boolean;
  isOperatorApproved: boolean;
  isCreatingProofSet: boolean;
  proofSetReady: boolean;
  proofSetId: string | null;
  hasMinimumBalance: boolean;
  usdcBalance: string;
  accountFunds: string;
  error: string | null;
  isLoading: boolean;
  lastApprovalTimestamp: number;
  operatorApproval: {
    rateAllowance: string;
    lockupAllowance: string;
  } | null;
  lockedFunds: {
    current: string;
  };
};

interface PaymentContextType {
  paymentStatus: PaymentStatus;
  refreshBalance: () => Promise<void>;
  refreshPaymentSetupStatus: () => Promise<void>;
  approveToken: (amount: string) => Promise<boolean>;
  depositFunds: (amount: string) => Promise<boolean>;
  withdrawFunds: (amount: string) => Promise<boolean>;
  approveServiceOperator: (
    rateAllowance: string,
    lockupAllowance: string
  ) => Promise<boolean>;
  initiateProofSetCreation: () => Promise<boolean>;
  transactions: TransactionRecord[];
  clearTransactionHistory: () => void;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

const generateId = () =>
  `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const initialState: PaymentStatus = {
  isTokenApproved: false,
  isDeposited: false,
  isOperatorApproved: false,
  isCreatingProofSet: false,
  proofSetReady: false,
  proofSetId: null,
  hasMinimumBalance: false,
  usdcBalance: "0",
  accountFunds: "0",
  error: null,
  isLoading: false,
  lastApprovalTimestamp: 0,
  operatorApproval: null,
  lockedFunds: {
    current: "0",
  },
};

export const PaymentProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { account } = useAuth();
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>(initialState);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  const addTransaction = (transaction: Omit<TransactionRecord, "id">) => {
    const newTransaction = {
      ...transaction,
      id: generateId(),
    };
    setTransactions((prev) => [newTransaction, ...prev]);
    return newTransaction.id;
  };

  const updateTransaction = (
    id: string,
    updates: Partial<TransactionRecord>
  ) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
    );
  };

  const clearTransactionHistory = () => {
    setTransactions([]);
  };

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
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );

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
    } catch (error) {
      console.error("Error checking USDFC balance:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to check USDFC balance",
        isLoading: false,
      }));
    }
  }, [account]);

  const startPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${Constants.API_BASE_URL}/api/v1/auth/status`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (response.ok) {
          const data = await response.json();

          setPaymentStatus((prev) => ({
            ...prev,
            proofSetReady: data.proofSetReady,
            isCreatingProofSet: data.proofSetInitiated && !data.proofSetReady,
          }));

          if (data.proofSetReady) {
            clearInterval(interval);
            setPollingInterval(null);
            refreshPaymentSetupStatus();
          }
        }
      } catch (error) {
        console.error("Error polling for proof set status:", error);
      }
    }, 30000);

    setPollingInterval(interval);

    return () => {
      clearInterval(interval);
      setPollingInterval(null);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const refreshPaymentSetupStatus = useCallback(async () => {
    if (!account) return;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );

      let fetchedProofSetReady = false;
      let fetchedProofSetInitiated = false;
      let fetchedProofSetId = null;
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
          fetchedProofSetInitiated = statusData.proofSetInitiated;
          fetchedProofSetId = statusData.proofSetId;

          if (
            fetchedProofSetInitiated &&
            !fetchedProofSetReady &&
            !pollingInterval
          ) {
            startPolling();
          }
        }
      } catch (authStatusError) {
        console.error(
          "Error fetching auth status for proofSetReady:",
          authStatusError
        );
      }

      try {
        const accountStatus = await getAccountStatus(
          provider,
          Constants.PAYMENT_PROXY_ADDRESS,
          Constants.USDFC_TOKEN_ADDRESS,
          account
        );

        const operatorStatus = await getOperatorApproval(
          provider,
          Constants.PAYMENT_PROXY_ADDRESS,
          Constants.USDFC_TOKEN_ADDRESS,
          account,
          Constants.PDP_SERVICE_ADDRESS
        );

        const minDepositAmount = parseFloat(Constants.PROOF_SET_FEE);
        const isDeposited = parseFloat(accountStatus.funds) >= minDepositAmount;

        setPaymentStatus((prev) => ({
          ...prev,
          isDeposited,
          isOperatorApproved: operatorStatus.isApproved,
          accountFunds: accountStatus.funds,
          lockedFunds: {
            ...prev.lockedFunds,
            current: accountStatus.lockupCurrent,
            rate: accountStatus.lockupRate,
            lastSettledAt: accountStatus.lockupLastSettledAt,
          },
          proofSetReady: fetchedProofSetReady,
          proofSetId: fetchedProofSetId,
          isCreatingProofSet: fetchedProofSetInitiated && !fetchedProofSetReady,
          isLoading: false,
          hasMinimumBalance: prev.hasMinimumBalance,
        }));

        console.log(`Payment setup status for ${account}:`, {
          isDeposited,
          funds: accountStatus.funds,
          lockedFunds: {
            current: accountStatus.lockupCurrent,
            rate: accountStatus.lockupRate,
            lastSettledAt: accountStatus.lockupLastSettledAt,
          },
          isOperatorApproved: operatorStatus.isApproved,
        });

        // Notify any listening components of the updated balance
        window.dispatchEvent(
          new CustomEvent(BALANCE_UPDATED_EVENT, {
            detail: {
              newBalance: accountStatus.funds,
              newLockedFunds: accountStatus.lockupCurrent,
            },
          })
        );
      } catch (error) {
        console.error("Error fetching account status:", error);
        console.log("User hasn't interacted with the Payments contract yet");
        setPaymentStatus((prev) => ({
          ...prev,
          isDeposited: false,
          isOperatorApproved: false,
          accountFunds: "0",
          lockedFunds: {
            current: "0",
            rate: "0",
            lastSettledAt: "0",
          },
          proofSetReady: fetchedProofSetReady,
          proofSetId: fetchedProofSetId,
          isCreatingProofSet: fetchedProofSetInitiated && !fetchedProofSetReady,
        }));
      }

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

      const minimumAllowance = ethers.parseUnits(Constants.PROOF_SET_FEE, 6);
      const isTokenApproved = tokenAllowance >= minimumAllowance;

      setPaymentStatus((prev) => ({
        ...prev,
        isTokenApproved,
      }));

      const paymentContract = new ethers.Contract(
        Constants.PAYMENT_PROXY_ADDRESS,
        [
          "function operatorApprovals(address token, address client, address operator) view returns (bool isApproved, uint256 rateAllowance, uint256 lockupAllowance, uint256 rateUsage, uint256 lockupUsage)",
        ],
        provider
      );

      try {
        const approval = await paymentContract.operatorApprovals(
          Constants.USDFC_TOKEN_ADDRESS,
          account,
          Constants.PDP_SERVICE_ADDRESS
        );

        setPaymentStatus((prev) => ({
          ...prev,
          operatorApproval: {
            rateAllowance: ethers.formatUnits(approval.rateAllowance, 18),
            lockupAllowance: ethers.formatUnits(approval.lockupAllowance, 18),
            rateUsage: ethers.formatUnits(approval.rateUsage, 18),
            lockupUsage: ethers.formatUnits(approval.lockupUsage, 18),
          },
        }));
      } catch (error) {
        console.error("Error fetching operator approval details:", error);
      }
    } catch (error) {
      console.error("Error checking payment setup status:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        error: "Failed to check payment setup status",
        isLoading: false,
        proofSetReady: false,
        proofSetId: null,
        isCreatingProofSet: false,
        operatorApproval: null,
      }));
    }
  }, [account, startPolling, pollingInterval]);

  const refreshAfterTransaction = async () => {
    try {
      await refreshBalance();
      await refreshPaymentSetupStatus();

      setTimeout(async () => {
        await refreshBalance();
        await refreshPaymentSetupStatus();

        setTimeout(async () => {
          await refreshBalance();
          await refreshPaymentSetupStatus();

          setTimeout(async () => {
            await refreshBalance();
            await refreshPaymentSetupStatus();
          }, 1500);
        }, 1000);
      }, 500);
    } catch (error) {
      console.error("Error during refresh sequence:", error);
    }
  };

  const approveToken = async (amount: string): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    const txId = addTransaction({
      type: "token_approval",
      txHash: "",
      amount,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      const txResponse = await approveUSDFCSpending(
        signer,
        Constants.USDFC_TOKEN_ADDRESS,
        Constants.PAYMENT_PROXY_ADDRESS,
        amount
      );

      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      const now = Date.now();

      // Update state to indicate we're waiting for blockchain confirmation
      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: true,
        error: "Waiting for blockchain confirmation...",
      }));

      // Wait 5 seconds for blockchain to sync before showing success
      await new Promise((resolve) => setTimeout(resolve, 5000));

      setPaymentStatus((prev) => ({
        ...prev,
        isTokenApproved: true,
        isLoading: false,
        error: null,
        lastApprovalTimestamp: now,
      }));

      return true;
    } catch (error) {
      console.error("Error approving token spending:", error);

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

  const updateBalanceAndNotify = (updates: {
    newBalance: string;
    newLockedFunds?: string;
  }) => {
    setPaymentStatus((prev) => ({
      ...prev,
      accountFunds: updates.newBalance,
      lockedFunds: {
        ...prev.lockedFunds,
        current: updates.newLockedFunds || prev.lockedFunds.current,
      },
      isLoading: false,
      error: null,
    }));

    // Dispatch event to notify all components
    window.dispatchEvent(
      new CustomEvent(BALANCE_UPDATED_EVENT, {
        detail: {
          newBalance: updates.newBalance,
          newLockedFunds: updates.newLockedFunds,
        },
      })
    );
  };

  const depositFunds = async (amount: string): Promise<boolean> => {
    if (!account) return false;

    const now = Date.now();
    const lastApproval = paymentStatus.lastApprovalTimestamp;
    const minDelay = 5000;
    const timeSinceApproval = now - lastApproval;

    if (lastApproval > 0 && timeSinceApproval < minDelay) {
      console.warn(
        `Deposit attempted too soon after approval (${timeSinceApproval}ms). Waiting for confirmation...`
      );

      const remainingTime = minDelay - timeSinceApproval;

      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: true,
        error: `Waiting ${Math.ceil(
          remainingTime / 1000
        )} seconds for approval confirmation...`,
      }));

      await new Promise((resolve) => setTimeout(resolve, remainingTime + 500));

      setPaymentStatus((prev) => ({ ...prev, error: null }));
    }

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    const txId = addTransaction({
      type: "deposit",
      txHash: "",
      amount,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      const txResponse = await depositUSDFC(
        signer,
        Constants.PAYMENT_PROXY_ADDRESS,
        Constants.USDFC_TOKEN_ADDRESS,
        amount
      );

      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update state to indicate we're waiting for blockchain confirmation
      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: true,
        error: "Waiting for blockchain confirmation...",
      }));

      // Immediately update UI with anticipated new values
      const newBalance = (
        parseFloat(paymentStatus.accountFunds) + parseFloat(amount)
      ).toString();

      // Also update wallet balance
      const newWalletBalance = Math.max(
        0,
        parseFloat(paymentStatus.usdcBalance) - parseFloat(amount)
      ).toFixed(6);

      setPaymentStatus((prev) => ({
        ...prev,
        accountFunds: newBalance,
        usdcBalance: newWalletBalance,
        isDeposited:
          parseFloat(newBalance) >= parseFloat(Constants.PROOF_SET_FEE),
        isLoading: true,
      }));

      // Notify all components about the balance update
      window.dispatchEvent(
        new CustomEvent(BALANCE_UPDATED_EVENT, {
          detail: {
            newBalance,
            newWalletBalance,
          },
        })
      );

      // Wait a bit for the transaction to propagate
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Start aggressive refresh sequence
      refreshAfterTransaction();

      setPaymentStatus((prev) => ({ ...prev, isLoading: false }));
      return true;
    } catch (error) {
      console.error("Error depositing funds:", error);

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

  const withdrawFunds = async (amount: string): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );

      const txId = addTransaction({
        type: "withdraw",
        txHash: "",
        amount,
        timestamp: Date.now(),
        status: "pending",
      });

      const signer = await provider.getSigner();

      const txResponse = await withdrawUSDFC(
        signer,
        Constants.PAYMENT_PROXY_ADDRESS,
        Constants.USDFC_TOKEN_ADDRESS,
        amount
      );

      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update state to indicate we're waiting for blockchain confirmation
      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: true,
        error: "Waiting for blockchain confirmation..",
      }));

      // Wait 5 seconds for blockchain to sync before showing success
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Update balance immediately
      const newBalance = (
        parseFloat(paymentStatus.accountFunds) - parseFloat(amount)
      ).toString();
      const newLockedFunds = paymentStatus.lockedFunds.current; // Locked funds remain unchanged on withdrawal
      updateBalanceAndNotify({
        newBalance,
        newLockedFunds,
      });

      // Refresh in background
      await Promise.all([refreshBalance(), refreshPaymentSetupStatus()]);

      return true;
    } catch (error) {
      console.error("Error withdrawing funds:", error);

      if (error instanceof Error) {
        setPaymentStatus((prev) => ({
          ...prev,
          error: error.message,
          isLoading: false,
        }));
      } else {
        setPaymentStatus((prev) => ({
          ...prev,
          error: "Failed to withdraw funds",
          isLoading: false,
        }));
      }
      return false;
    }
  };

  const approveServiceOperator = async (
    rateAllowance: string,
    lockupAllowance: string
  ): Promise<boolean> => {
    if (!account) return false;

    setPaymentStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    const txId = addTransaction({
      type: "operator_approval",
      txHash: "",
      amount: `Rate: ${rateAllowance}, Lockup: ${lockupAllowance}`,
      timestamp: Date.now(),
      status: "pending",
    });

    try {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }

      const provider = new ethers.BrowserProvider(
        window.ethereum as ethers.Eip1193Provider
      );
      const signer = await provider.getSigner();

      const txResponse = await approveOperator(
        signer,
        Constants.PAYMENT_PROXY_ADDRESS,
        Constants.USDFC_TOKEN_ADDRESS,
        Constants.PDP_SERVICE_ADDRESS,
        rateAllowance,
        lockupAllowance
      );

      updateTransaction(txId, {
        txHash: txResponse.hash,
        status: "success",
      });

      // Update state to indicate we're waiting for blockchain confirmation
      setPaymentStatus((prev) => ({
        ...prev,
        isLoading: true,
        error: "Waiting for blockchain confirmation...",
      }));

      // Wait 5 seconds for blockchain to sync before showing success
      await new Promise((resolve) => setTimeout(resolve, 5000));

      setPaymentStatus((prev) => ({
        ...prev,
        isOperatorApproved: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      console.error("Error approving service operator:", error);

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

  const initiateProofSetCreation = async (): Promise<boolean> => {
    if (!account) return false;

    try {
      // Check if the account has sufficient funds for creating a proof set
      if (
        parseFloat(paymentStatus.accountFunds) <
        parseFloat(Constants.PROOF_SET_FEE)
      ) {
        throw new Error(
          `Insufficient funds in FWS. You need at least ${Constants.PROOF_SET_FEE} USDFC in your FWS funds.`
        );
      }

      setPaymentStatus((prev) => ({
        ...prev,
        isCreatingProofSet: true,
        error: null,
      }));

      const response = await fetch(
        `${Constants.API_BASE_URL}/api/v1/proof-set/create`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create proof set");
      }

      startPolling();

      setPaymentStatus((prev) => ({
        ...prev,
        isCreatingProofSet: true,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      console.error("Failed to create proof set:", error);
      setPaymentStatus((prev) => ({
        ...prev,
        isCreatingProofSet: false,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create proof set. Please try again.",
      }));
      return false;
    }
  };

  useEffect(() => {
    refreshBalance();
    refreshPaymentSetupStatus();
  }, [account, refreshBalance, refreshPaymentSetupStatus]);

  // Add visibility change handler to refresh data when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && account) {
        console.log(
          "[PaymentContext] Tab became visible, refreshing payment status and balance"
        );

        // Create a sequence of refreshes to ensure data is up-to-date
        Promise.all([refreshBalance(), refreshPaymentSetupStatus()])
          .then(() => {
            console.log(
              "[PaymentContext] Initial refresh after visibility change completed"
            );

            // Dispatch event to notify components
            window.dispatchEvent(
              new CustomEvent(BALANCE_UPDATED_EVENT, {
                detail: {
                  timestamp: Date.now(),
                  action: "visibility_change",
                },
              })
            );

            // Do a follow-up refresh after a short delay
            setTimeout(() => {
              Promise.all([refreshBalance(), refreshPaymentSetupStatus()])
                .then(() => {
                  console.log("[PaymentContext] Follow-up refresh completed");

                  // Dispatch another event
                  window.dispatchEvent(
                    new CustomEvent(BALANCE_UPDATED_EVENT, {
                      detail: {
                        timestamp: Date.now(),
                        action: "visibility_change_followup",
                      },
                    })
                  );
                })
                .catch((error) => {
                  console.error(
                    "[PaymentContext] Error in follow-up refresh:",
                    error
                  );
                });
            }, 1500);
          })
          .catch((error) => {
            console.error(
              "[PaymentContext] Error refreshing on visibility change:",
              error
            );
          });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [account, refreshBalance, refreshPaymentSetupStatus]);

  return (
    <PaymentContext.Provider
      value={{
        paymentStatus,
        refreshBalance,
        refreshPaymentSetupStatus,
        approveToken,
        depositFunds,
        withdrawFunds,
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

export function usePayment() {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error("usePayment must be used within a PaymentProvider");
  }
  return context;
}

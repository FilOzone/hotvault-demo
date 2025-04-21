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
import { getUSDFCBalance } from "@/lib/contracts";
import * as Constants from "@/lib/constants";

// Define the payment status interface
interface PaymentStatus {
  usdcBalance: string;
  hasMinimumBalance: boolean;
  isLoading: boolean;
  error: string | null;
}

// Define the context type
interface PaymentContextType {
  paymentStatus: PaymentStatus;
  refreshBalance: () => Promise<void>;
}

// Create the context
const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

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
  });

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

  // Check balance when account changes
  useEffect(() => {
    refreshBalance();
  }, [account, refreshBalance]);

  return (
    <PaymentContext.Provider value={{ paymentStatus, refreshBalance }}>
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

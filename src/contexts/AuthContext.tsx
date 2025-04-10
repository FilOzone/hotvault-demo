import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (
    eventName: "accountsChanged" | "disconnect",
    handler: (accounts: string[]) => void
  ) => void;
  removeListener: (
    eventName: "accountsChanged" | "disconnect",
    handler: (accounts: string[]) => void
  ) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface AuthContextType {
  account: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  error: string;
  handleAccountSwitch: () => Promise<void>;
  disconnectWallet: () => void;
  connectWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "fws_wallet_connected";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [account, setAccount] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  // Handle account changes
  const handleAccountsChanged = (newAccounts: string[]) => {
    const newAccount = newAccounts[0] || "";
    setAccount(newAccount);
    if (!newAccount) {
      localStorage.removeItem(STORAGE_KEY);
      setError("");
      router.push("/");
    } else {
      localStorage.setItem(STORAGE_KEY, "true");
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    setAccount("");
    localStorage.removeItem(STORAGE_KEY);
    setError("");
    router.push("/");
  };

  useEffect(() => {
    const checkConnection = async () => {
      if (!window.ethereum) {
        setIsLoading(false);
        return;
      }

      try {
        // Only check accounts if we were previously connected
        if (localStorage.getItem(STORAGE_KEY)) {
          const accounts = (await window.ethereum.request({
            method: "eth_accounts",
          })) as string[];

          handleAccountsChanged(accounts);
        }
      } catch (err) {
        console.error("Failed to get accounts:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();

    if (window.ethereum) {
      // Add event listeners
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("disconnect", handleDisconnect);

      // Cleanup event listeners
      return () => {
        window.ethereum?.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum?.removeListener("disconnect", handleDisconnect);
      };
    }
  }, [router]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask to continue");
      return;
    }

    try {
      setIsConnecting(true);
      setError("");

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      handleAccountsChanged(accounts);
    } catch (err) {
      setError("Failed to connect to MetaMask");
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    handleDisconnect();
  };

  const handleAccountSwitch = async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (error) {
      console.error("Failed to switch accounts:", error);
    }
  };

  const value = {
    account,
    isConnecting,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    handleAccountSwitch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

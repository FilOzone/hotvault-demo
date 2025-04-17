import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";

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
const JWT_STORAGE_KEY = "jwt_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [account, setAccount] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  // Add connection lock
  const [isConnectionLocked, setIsConnectionLocked] = useState(false);

  const authenticateWithBackend = async (address: string) => {
    console.log("🔐 Starting authentication process for address:", address);
    try {
      // Step 1: Get nonce from backend
      console.log("📡 Requesting nonce from backend...");
      const nonceResponse = await fetch(`${API_BASE_URL}/auth/nonce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
      });

      if (!nonceResponse.ok) {
        console.error(
          "[AuthContext.tsx:authenticateWithBackend] ❌ Failed to get nonce. Status:",
          nonceResponse.status
        );
        const errorData = await nonceResponse.json();
        console.error(
          "[AuthContext.tsx:authenticateWithBackend] Error details:",
          errorData
        );
        throw new Error("Failed to get nonce");
      }

      const { nonce } = await nonceResponse.json();
      console.log(
        "[AuthContext.tsx:authenticateWithBackend] ✅ Received nonce from backend:",
        nonce
      );

      // Step 2: Sign the nonce with MetaMask
      console.log(
        "[AuthContext.tsx:authenticateWithBackend] 🦊 Requesting MetaMask signature..."
      );
      const message = `Sign this message to authenticate: ${nonce}`;
      const signature = await window.ethereum?.request({
        method: "personal_sign",
        params: [message, address],
      });

      if (!signature) {
        console.error(
          "[AuthContext.tsx:authenticateWithBackend] ❌ Failed to get signature from MetaMask"
        );
        throw new Error("Failed to sign message");
      }
      console.log(
        "[AuthContext.tsx:authenticateWithBackend] ✅ Received signature from MetaMask:",
        signature
      );

      // Step 3: Verify signature and get JWT token
      console.log(
        "[AuthContext.tsx:authenticateWithBackend] 📡 Verifying signature with backend..."
      );

      console.log(
        `[AuthContext.tsx:authenticateWithBackend] address: ${address}`
      );
      console.log(
        `[AuthContext.tsx:authenticateWithBackend] signature: ${signature}`
      );

      try {
        const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address,
            signature,
          }),
        });

        const verifyResponseData = await verifyResponse.json();
        console.log(
          "[AuthContext.tsx:authenticateWithBackend] Verify response:",
          verifyResponseData
        );

        if (!verifyResponse.ok) {
          console.error(
            "[AuthContext.tsx:authenticateWithBackend] ❌ Failed to verify signature. Status:",
            verifyResponse.status
          );
          console.error(
            "[AuthContext.tsx:authenticateWithBackend] Error details:",
            verifyResponseData
          );
          throw new Error(
            verifyResponseData.error || "Failed to verify signature"
          );
        }

        if (!verifyResponseData.token) {
          console.error(
            "[AuthContext.tsx:authenticateWithBackend] ❌ No token in response"
          );
          throw new Error("No token received from server");
        }

        const { token } = verifyResponseData;
        console.log(
          "[AuthContext.tsx:authenticateWithBackend] ✅ Received JWT token from backend"
        );
        console.log(
          "[AuthContext.tsx:authenticateWithBackend] 🔑 Token preview:",
          token.substring(0, 20) + "..."
        );
        localStorage.setItem(JWT_STORAGE_KEY, token);
        return token;
      } catch (error) {
        console.error(
          "[AuthContext.tsx:authenticateWithBackend] 🚨 Verification error:",
          error
        );
        throw error;
      }
    } catch (error) {
      console.error("🚨 Authentication error:", error);
      throw error;
    }
  };

  // Handle account changes
  const handleAccountsChanged = async (newAccounts: string[]) => {
    console.log(
      "[AuthContext.tsx:handleAccountsChanged] 👛 Account change detected:",
      newAccounts
    );
    const newAccount = newAccounts[0] || "";
    setAccount(newAccount);

    if (!newAccount) {
      console.log(
        "[AuthContext.tsx:handleAccountsChanged] 🔓 No account found, clearing storage and redirecting to home"
      );
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
      setError("");
      router.push("/");
    } else {
      try {
        console.log(
          "[AuthContext.tsx:handleAccountsChanged] 🔒 New account connected, starting authentication"
        );
        await authenticateWithBackend(newAccount);
        localStorage.setItem(STORAGE_KEY, "true");
        console.log(
          "[AuthContext.tsx:handleAccountsChanged] ✅ Authentication successful, redirecting to dashboard"
        );
        router.push("/dashboard");
      } catch (error) {
        console.error(
          "[AuthContext.tsx:handleAccountsChanged] ❌ Authentication failed:",
          error
        );
        setError("Failed to authenticate with the backend");
        setAccount("");
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(JWT_STORAGE_KEY);
      }
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    console.log("🔌 Wallet disconnected");
    setAccount("");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JWT_STORAGE_KEY);
    setError("");
    router.push("/");
  };

  useEffect(() => {
    const checkConnection = async () => {
      console.log("🔍 Checking existing connection...");
      if (!window.ethereum) {
        console.log("❌ MetaMask not found");
        setIsLoading(false);
        return;
      }

      try {
        // Only check accounts if we were previously connected
        if (localStorage.getItem(STORAGE_KEY)) {
          console.log("💾 Found stored connection, checking accounts...");
          const accounts = (await window.ethereum.request({
            method: "eth_accounts",
          })) as string[];

          if (accounts[0]) {
            console.log("👤 Found connected account:", accounts[0]);
            // If we have an account but no JWT, try to re-authenticate
            if (!localStorage.getItem(JWT_STORAGE_KEY)) {
              console.log("🔄 No JWT found, re-authenticating...");
              await authenticateWithBackend(accounts[0]);
            } else {
              console.log("✅ JWT token found in storage");
            }
          }

          handleAccountsChanged(accounts);
        } else {
          console.log("💾 No stored connection found");
        }
      } catch (err) {
        console.error("❌ Connection check failed:", err);
        // Clear storage if authentication fails
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(JWT_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();

    if (window.ethereum) {
      console.log("🦊 Setting up MetaMask event listeners");
      // Add event listeners
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("disconnect", handleDisconnect);

      // Cleanup event listeners
      return () => {
        console.log("🧹 Cleaning up MetaMask event listeners");
        window.ethereum?.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum?.removeListener("disconnect", handleDisconnect);
      };
    }
  }, [router]);

  const connectWallet = async () => {
    console.log("🔌 Initiating wallet connection...");
    if (!window.ethereum) {
      console.error("❌ MetaMask not found");
      setError("Please install MetaMask to continue");
      return;
    }

    if (isConnectionLocked) {
      console.log("🔒 Connection request already in progress");
      setError("Please check MetaMask for the connection request");
      return;
    }

    try {
      setIsConnecting(true);
      setIsConnectionLocked(true);
      setError("");
      console.log("🦊 Requesting MetaMask accounts...");

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      console.log("✅ Accounts received:", accounts);
      await handleAccountsChanged(accounts);
    } catch (err: any) {
      console.error("❌ Wallet connection failed:", err);
      if (err.code === -32002) {
        setError(
          "Connection request already pending in MetaMask. Please check your MetaMask extension."
        );
      } else {
        setError("Failed to connect to MetaMask");
      }
    } finally {
      setIsConnecting(false);
      // Add a delay before unlocking to prevent rapid reconnection attempts
      setTimeout(() => {
        setIsConnectionLocked(false);
      }, 1000);
    }
  };

  const disconnectWallet = () => {
    console.log("🔌 Initiating wallet disconnect...");
    handleDisconnect();
  };

  const handleAccountSwitch = async () => {
    console.log("�� Initiating account switch...");
    try {
      await window.ethereum?.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      console.log("✅ Account switch dialog opened");
    } catch (error) {
      console.error("❌ Account switch failed:", error);
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

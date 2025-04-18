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
// We'll keep this for backward compatibility, but it won't be the primary storage
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
    try {
      console.log("🔐 Authenticating with backend for address:", address);

      // Step 1: Get a nonce from the backend
      const nonceResponse = await fetch(`${API_BASE_URL}/api/v1/auth/nonce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
        credentials: "include", // Important for cookies
      });

      if (!nonceResponse.ok) {
        throw new Error(`Failed to get nonce: ${nonceResponse.statusText}`);
      }

      const { nonce } = await nonceResponse.json();
      console.log("📝 Received nonce from backend:", nonce);

      // Step 2: Sign the nonce with MetaMask
      if (!window.ethereum) {
        throw new Error("MetaMask not available");
      }

      console.log("🖊️ Requesting signature...");

      // Try a standard ethereum message format - this is what most backends expect
      const message = `Sign this message to authenticate with FWS: ${nonce}`;
      console.log("Message to sign:", message);

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      console.log("✍️ Signature:", signature);

      // Step 3: Verify the signature with the backend and get JWT token
      const verifyResponse = await fetch(`${API_BASE_URL}/api/v1/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          signature,
          message, // Send the message we signed so backend knows what was signed
        }),
        credentials: "include", // Important for cookies
      });

      if (!verifyResponse.ok) {
        throw new Error(
          `Failed to verify signature: ${verifyResponse.statusText}`
        );
      }

      const { token } = await verifyResponse.json();

      // Store the token in localStorage as a fallback
      if (token) {
        localStorage.setItem(JWT_STORAGE_KEY, token);
        console.log("🔑 JWT token stored");
      } else {
        console.log("⚠️ No JWT token received, but cookie should be set");
      }

      // Mark as connected in localStorage
      localStorage.setItem(STORAGE_KEY, "true");

      return token;
    } catch (error) {
      console.error("❌ Authentication error:", error);
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

    if (!newAccount) {
      console.log(
        "[AuthContext.tsx:handleAccountsChanged] 🔓 No account found, clearing storage and redirecting to home"
      );
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
      // Also clear the cookie by calling logout endpoint
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setError("");
      setAccount("");
      router.push("/");
      return;
    }

    // If we have an account, first check if we're already authenticated with it
    try {
      const statusResponse = await fetch(`${API_BASE_URL}/api/v1/auth/status`, {
        method: "GET",
        credentials: "include",
      });

      if (statusResponse.ok) {
        const data = await statusResponse.json();

        if (
          data.authenticated &&
          data.address.toLowerCase() === newAccount.toLowerCase()
        ) {
          console.log("✅ Already authenticated with this account");
          setAccount(newAccount);
          localStorage.setItem(STORAGE_KEY, "true");
          setIsLoading(false);
          router.push("/dashboard");
          return;
        }
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      // Continue with authentication process
    }

    // Need to authenticate with the new account
    try {
      console.log(
        "[AuthContext.tsx:handleAccountsChanged] 🔒 New account connected, starting authentication"
      );
      await authenticateWithBackend(newAccount);
      setAccount(newAccount);
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
      // Clear the auth cookie
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    console.log("🔌 Wallet disconnected");
    setAccount("");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JWT_STORAGE_KEY);
    // Clear the auth cookie
    fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => console.error("Error logging out:", err));
    setError("");
    router.push("/");
  };

  const checkConnection = async () => {
    setIsLoading(true);
    console.log("⏳ Checking connection status...");

    try {
      // First check if we have a valid cookie session
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/status`, {
        method: "GET",
        credentials: "include", // Important for cookies
      });

      if (response.ok) {
        const data = await response.json();
        setAccount(data.address);
        localStorage.setItem(STORAGE_KEY, "true");
        console.log(
          "✅ Authenticated via cookie session for address:",
          data.address
        );
        setIsLoading(false);
        return true;
      }

      console.log("Cookie authentication failed, checking alternatives...");

      // If cookie auth failed but we have MetaMask, check if accounts exist
      if (window.ethereum) {
        const accounts = (await window.ethereum.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts && accounts.length > 0) {
          const currentAddress = accounts[0];
          console.log("📱 Found existing MetaMask account:", currentAddress);

          // Check if we have marked this account as connected in localStorage
          const isStoredConnected =
            localStorage.getItem(STORAGE_KEY) === "true";

          if (isStoredConnected) {
            console.log("🔄 Attempting to re-authenticate with the backend");
            try {
              await authenticateWithBackend(currentAddress);
              setAccount(currentAddress);
              console.log("✅ Re-authenticated successfully");
              setIsLoading(false);
              return true;
            } catch (error) {
              console.error("❌ Re-authentication failed:", error);
              // If re-authentication fails, continue with the flow
            }
          }
        }
      }

      // If we get here, we're not authenticated
      console.log("❌ No valid authentication found");
      setAccount("");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
    } catch (error) {
      console.error("🚨 Error checking connection:", error);
      setAccount("");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
    }

    setIsLoading(false);
    return false;
  };

  useEffect(() => {
    checkConnection();

    // Set up event listeners for account changes and disconnection
    if (window.ethereum) {
      const accountsChangedHandler = (accounts: string[]) => {
        if (!isConnectionLocked) {
          handleAccountsChanged(accounts);
        }
      };

      window.ethereum.on("accountsChanged", accountsChangedHandler);
      window.ethereum.on("disconnect", handleDisconnect);

      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener(
            "accountsChanged",
            accountsChangedHandler
          );
          window.ethereum.removeListener("disconnect", handleDisconnect);
        }
      };
    }
  }, [router, isConnectionLocked]);

  const connectWallet = async () => {
    if (isConnectionLocked) {
      console.log("🔒 Connection locked, please wait...");
      return;
    }

    setIsConnectionLocked(true);
    setIsConnecting(true);
    setError("");

    if (!window.ethereum) {
      setError("MetaMask not found! Please install MetaMask to use this app.");
      setIsConnecting(false);
      setIsConnectionLocked(false);
      return;
    }

    try {
      console.log("🦊 Requesting accounts...");
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask");
      }

      console.log("✅ Account connected:", accounts[0]);

      // First check if we already have a valid session for this account
      try {
        const statusResponse = await fetch(
          `${API_BASE_URL}/api/v1/auth/status`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (statusResponse.ok) {
          const data = await statusResponse.json();

          if (
            data.authenticated &&
            data.address.toLowerCase() === accounts[0].toLowerCase()
          ) {
            console.log("✅ Already authenticated with this account");
            setAccount(accounts[0]);
            localStorage.setItem(STORAGE_KEY, "true");
            setIsLoading(false);
            router.push("/dashboard");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
        // Continue with authentication
      }

      // Otherwise proceed with normal authentication flow
      await authenticateWithBackend(accounts[0]);
      setAccount(accounts[0]);
      localStorage.setItem(STORAGE_KEY, "true");
      router.push("/dashboard");
    } catch (error) {
      console.error("❌ Connection error:", error);
      setError("Failed to connect wallet. Please try again.");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
    } finally {
      setIsConnecting(false);
      // Small delay before unlocking to prevent accidental double-clicks
      setTimeout(() => {
        setIsConnectionLocked(false);
      }, 1000);
    }
  };

  const disconnectWallet = () => {
    handleDisconnect();
  };

  const handleAccountSwitch = async () => {
    if (isConnectionLocked) {
      return;
    }

    setIsConnectionLocked(true);
    try {
      await connectWallet();
    } finally {
      // Small delay before unlocking to prevent accidental double-clicks
      setTimeout(() => {
        setIsConnectionLocked(false);
      }, 1000);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        account,
        isConnecting,
        isLoading,
        error,
        handleAccountSwitch,
        disconnectWallet,
        connectWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

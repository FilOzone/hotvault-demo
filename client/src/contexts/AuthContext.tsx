import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";
import type { EthereumProvider } from "@/types/window";
import { toast } from "react-hot-toast";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export type AuthContextType = {
  account: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  error: string;
  proofSetReady: boolean;
  proofSetId: string | null;
  userProofSetId: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  updateUserProofSetId: (id: string) => void;
  handleAccountSwitch: () => Promise<void>;
};

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
  const [proofSetReady, setProofSetReady] = useState<boolean>(false);
  const [userProofSetId, setUserProofSetId] = useState<string | null>(null);
  const router = useRouter();

  const [isConnectionLocked, setIsConnectionLocked] = useState(false);

  const authenticateWithBackend = useCallback(async (address: string) => {
    try {
      console.log("🔐 Authenticating with backend for address:", address);

      const nonceResponse = await fetch(`${API_BASE_URL}/api/v1/auth/nonce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
        credentials: "include",
      });

      if (!nonceResponse.ok) {
        throw new Error(`Failed to get nonce: ${nonceResponse.statusText}`);
      }

      const { nonce } = await nonceResponse.json();
      console.log("📝 Received nonce from backend:", nonce);

      if (!window.ethereum) {
        throw new Error("MetaMask not available");
      }

      console.log("🖊️ Requesting signature...");

      const message = `Sign this message to login to Hot Vault (No funds will be transferred in this step): ${nonce}`;
      console.log("Message to sign:", message);

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      console.log("✍️ Signature:", signature);

      const verifyResponse = await fetch(`${API_BASE_URL}/api/v1/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          signature,
          message,
        }),
        credentials: "include",
      });

      if (!verifyResponse.ok) {
        throw new Error(
          `Failed to verify signature: ${verifyResponse.statusText}`
        );
      }

      const { token } = await verifyResponse.json();

      if (token) {
        localStorage.setItem(JWT_STORAGE_KEY, token);
        console.log("🔑 JWT token stored");
      } else {
        console.log("⚠️ No JWT token received, but cookie should be set");
      }

      localStorage.setItem(STORAGE_KEY, "true");

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
          setProofSetReady(data.proofSetReady);
          if (data.proofSetId) {
            console.log("🔒 Setting proof set ID:", data.proofSetId);
            setUserProofSetId(data.proofSetId);
          }
          console.log(
            "🔒 Updated proofSetReady status after auth:",
            data.proofSetReady
          );
        } else {
          console.warn(
            "⚠️ Could not fetch status after authentication to update proofSetReady"
          );
          setProofSetReady(false); // Assume not ready if status check fails
        }
      } catch (statusError) {
        console.error(
          "🚨 Error fetching status after authentication:",
          statusError
        );
        setProofSetReady(false);
      }

      return token;
    } catch (error) {
      console.error("❌ Authentication error:", error);
      throw error;
    }
  }, []);

  const handleAccountsChanged = useCallback(
    async (newAccounts: string[]) => {
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
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
        setError("");
        setAccount("");
        router.push("/");
        return;
      }

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
            data.address.toLowerCase() === newAccount.toLowerCase()
          ) {
            console.log("✅ Already authenticated with this account");
            setProofSetReady(data.proofSetReady);
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
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      }
    },
    [authenticateWithBackend, router]
  );

  const handleDisconnect = useCallback(() => {
    console.log("🔌 Wallet disconnected");
    setAccount("");
    setProofSetReady(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JWT_STORAGE_KEY);
    fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => console.error("Error logging out:", err));
    setError("");
    router.push("/");
  }, [router]);

  const checkConnection = useCallback(async () => {
    console.log("⏳ Checking connection status...");
    if (account === "") {
      setIsLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/status`, {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setAccount(data.address);
        localStorage.setItem(STORAGE_KEY, "true");
        setProofSetReady(data.proofSetReady);
        if (data.proofSetId) {
          console.log("✅ Setting proof set ID:", data.proofSetId);
          setUserProofSetId(data.proofSetId);
        }
        console.log(
          "✅ Authenticated via cookie session for address:",
          data.address,
          "Proof Set Ready:",
          data.proofSetReady,
          "Proof Set ID:",
          data.proofSetId
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
  }, [authenticateWithBackend, account]);

  useEffect(() => {
    const initialCheck = async () => {
      await checkConnection();
    };

    initialCheck();

    if (window.ethereum) {
      const accountsChangedHandler = (accounts: string[]) => {
        if (!isConnectionLocked) {
          handleAccountsChanged(accounts);
        }
      };

      const disconnectHandler = () => {
        handleDisconnect();
      };

      window.ethereum.on("accountsChanged", accountsChangedHandler);
      window.ethereum.on("disconnect", disconnectHandler);

      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener(
            "accountsChanged",
            accountsChangedHandler
          );
          window.ethereum.removeListener("disconnect", disconnectHandler);
        }
      };
    }
  }, [
    isConnectionLocked,
    checkConnection,
    handleAccountsChanged,
    handleDisconnect,
  ]);

  const connectWallet = async () => {
    if (isConnectionLocked) {
      console.log("🔒 Connection locked, please wait...");
      toast.error("Please complete the pending wallet connection request.");
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

    const isMetaMask = window.ethereum.isMetaMask;
    if (!isMetaMask) {
      setError("Please use MetaMask as your wallet provider.");
      setIsConnecting(false);
      setIsConnectionLocked(false);
      return;
    }

    const providers = window.ethereum.providers;
    if (providers && providers.length > 1) {
      const metaMaskProvider = providers.find(
        (p: EthereumProvider) => p.isMetaMask
      );
      if (!metaMaskProvider) {
        setError("Please use MetaMask as your wallet provider.");
        setIsConnecting(false);
        setIsConnectionLocked(false);
        return;
      }
      window.ethereum = metaMaskProvider;
    }

    try {
      console.log("🦊 Requesting MetaMask accounts...");
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask");
      }

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
            setProofSetReady(data.proofSetReady);
            setAccount(accounts[0]);
            localStorage.setItem(STORAGE_KEY, "true");
            setIsLoading(false);
            router.push("/dashboard");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
      }

      await authenticateWithBackend(accounts[0]);
      setAccount(accounts[0]);
      localStorage.setItem(STORAGE_KEY, "true");
      router.push("/dashboard");
    } catch (error: unknown) {
      console.error("❌ Connection error:", error);

      // Handle specific MetaMask errors
      if (error && typeof error === "object" && "code" in error) {
        const metamaskError = error as { code: number };
        if (metamaskError.code === -32002) {
          toast.error(
            "MetaMask is already processing a connection request. Please check your MetaMask popup."
          );
          setError(
            "Please check your MetaMask popup to complete the connection."
          );
        } else if (metamaskError.code === 4001) {
          toast.error("You rejected the connection request.");
          setError("Connection request was rejected. Please try again.");
        } else {
          toast.error("Failed to connect wallet. Please try again.");
          setError("Failed to connect wallet. Please try again.");
        }
      } else {
        toast.error("Failed to connect wallet. Please try again.");
        setError("Failed to connect wallet. Please try again.");
      }

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
    } finally {
      setIsConnecting(false);
      setTimeout(() => {
        setIsConnectionLocked(false);
      }, 1000);
    }
  };

  const disconnectWallet = async () => {
    console.log("🔌 Disconnecting wallet");
    setAccount("");
    setProofSetReady(false);
    setUserProofSetId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JWT_STORAGE_KEY);
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Error logging out:", err);
    }
    setError("");
    router.push("/");
  };

  const handleAccountSwitch = async () => {
    if (!window.ethereum) {
      toast.error(
        "MetaMask not found! Please install MetaMask to use this app."
      );
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      console.log("🔄 Account switch requested");
    } catch (error) {
      console.error("Error switching account:", error);
      toast.error("Failed to switch account. Please try again.");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        account: account || null,
        isConnected: !!account,
        isConnecting,
        isLoading,
        error,
        proofSetReady,
        proofSetId: userProofSetId,
        userProofSetId,
        connectWallet,
        disconnectWallet,
        updateUserProofSetId: setUserProofSetId,
        handleAccountSwitch,
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

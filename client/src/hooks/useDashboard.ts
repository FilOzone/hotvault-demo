import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TokenData, Rail } from "@/types/dashboard";
import toast from "react-hot-toast";
import { ethers } from "ethers";

export const useDashboard = () => {
  console.log("🎯 Initializing useDashboard hook");
  const { account } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRails, setIsLoadingRails] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [userTokens, setUserTokens] = useState<TokenData[]>([]);
  const [depositedAmounts, setDepositedAmounts] = useState<{
    [key: string]: string;
  }>({});
  const [rails, setRails] = useState<Rail[]>([]);

  console.log("📊 Current state:", {
    account,
    isLoading,
    isLoadingRails,
    userTokensLength: userTokens.length,
    depositedAmountsKeys: Object.keys(depositedAmounts),
    railsLength: rails.length,
  });

  // Initialize with some sample data
  useEffect(() => {
    console.log("🔄 Dashboard useEffect triggered", { account });

    if (!account) {
      console.log("❌ No account found, setting loading to false");
      setIsLoading(false);
      return;
    }

    const initializeDashboard = async () => {
      console.log("🚀 Initializing dashboard data");
      try {
        // Sample token data for testing
        const sampleTokens: TokenData[] = [
          {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "FIL",
            decimals: 18,
            balance: BigInt(0),
            allowance: BigInt(0),
          },
        ];

        console.log("📝 Setting sample tokens:", sampleTokens);
        setUserTokens(sampleTokens);

        const initialDepositedAmounts = {
          "0x0000000000000000000000000000000000000000": "0",
        };
        console.log(
          "💰 Setting initial deposited amounts:",
          initialDepositedAmounts
        );
        setDepositedAmounts(initialDepositedAmounts);

        console.log("🛤️ Setting empty rails");
        setRails([]);
      } catch (error) {
        console.error("❌ Error initializing dashboard:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        console.log("✅ Setting loading to false");
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, [account]);

  const calculateTotalDeposited = (tokenAddress: string) => {
    console.log("💭 Calculating total deposited for:", tokenAddress);
    const amount = depositedAmounts[tokenAddress] || "0";
    console.log("💰 Amount found:", amount);
    return parseFloat(amount);
  };

  const calculateTotalLocked = (tokenAddress: string) => {
    console.log("🔒 Calculating total locked for:", tokenAddress);
    // For now, return 0 as we haven't implemented rail locking
    return 0;
  };

  const calculateWithdrawable = (tokenAddress: string) => {
    console.log("🏧 Calculating withdrawable for:", tokenAddress);
    const deposited = calculateTotalDeposited(tokenAddress);
    const locked = calculateTotalLocked(tokenAddress);
    const withdrawable = Math.max(0, deposited - locked);
    console.log("💳 Withdrawable amount:", withdrawable);
    return withdrawable;
  };

  const handleWithdraw = async (tokenAddress: string, amount: string) => {
    console.log("💸 Handling withdrawal", { tokenAddress, amount });
    try {
      const currentAmount = parseFloat(depositedAmounts[tokenAddress] || "0");
      const withdrawAmount = parseFloat(amount);

      console.log("📊 Withdrawal details:", {
        currentAmount,
        withdrawAmount,
        tokenAddress,
      });

      if (withdrawAmount > currentAmount) {
        console.error("❌ Insufficient balance for withdrawal");
        throw new Error("Insufficient balance");
      }

      const newAmount = (currentAmount - withdrawAmount).toString();
      console.log("💰 Setting new amount:", newAmount);

      setDepositedAmounts((prev) => ({
        ...prev,
        [tokenAddress]: newAmount,
      }));

      toast.success("Withdrawal successful!");
    } catch (error) {
      console.error("❌ Withdrawal failed:", error);
      toast.error(error instanceof Error ? error.message : "Withdrawal failed");
    }
  };

  const addToken = async () => {
    console.log("➕ Adding new token:", newTokenAddress);
    try {
      if (!window.ethereum || !account) {
        console.error("❌ No wallet connection found");
        throw new Error("Wallet not connected");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      console.log("🔌 Connected to provider");

      const tokenContract = new ethers.Contract(
        newTokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)",
        ],
        provider
      );

      console.log("📝 Fetching token details");
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);

      console.log("✅ Token details fetched:", { symbol, decimals });

      const newToken: TokenData = {
        address: newTokenAddress,
        symbol,
        decimals,
        balance: BigInt(0),
        allowance: BigInt(0),
      };

      console.log("📝 Adding new token to list:", newToken);
      setUserTokens((prev) => [...prev, newToken]);

      console.log("💰 Initializing deposited amount for new token");
      setDepositedAmounts((prev) => ({
        ...prev,
        [newTokenAddress]: "0",
      }));

      setNewTokenAddress("");
      toast.success(`Added ${symbol} token`);
    } catch (error) {
      console.error("❌ Failed to add token:", error);
      toast.error(
        "Failed to add token. Please check the address and try again."
      );
    }
  };

  const handleCreateRail = async () => {
    // Implementation
  };

  const handleTerminate = async () => {
    // Implementation
  };

  return {
    newTokenAddress,
    setNewTokenAddress,
    userTokens: userTokens || [], // Ensure we always return an array
    depositedAmounts,
    isLoading,
    rails,
    isLoadingRails,
    addToken,
    handleCreateRail,
    handleTerminate,
    calculateTotalDeposited,
    calculateTotalLocked,
    calculateWithdrawable,
    handleWithdraw,
  };
};

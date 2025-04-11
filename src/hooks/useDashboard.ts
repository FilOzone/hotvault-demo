import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BrowserProvider, Contract, JsonRpcProvider, ethers } from "ethers";
import {
  CONTRACTS,
  ERC20_ABI,
  PAYMENTS_ABI,
  isValidERC20,
  TokenData,
  isKnownFEVMToken,
  getKnownTokenInfo,
  switchToFilecoinCalibration,
  discoverTokens,
  getDepositedAmounts,
} from "@/contracts";
import toast from "react-hot-toast";
import { Rail } from "../types";

export const useDashboard = () => {
  const { account } = useAuth();
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [userTokens, setUserTokens] = useState<TokenData[]>([]);
  const [depositedAmounts, setDepositedAmounts] = useState<{
    [address: string]: string;
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [rails, setRails] = useState<Rail[]>([]);
  const [isLoadingRails, setIsLoadingRails] = useState(false);

  // Function to handle rail termination
  const handleTerminate = async (rail: Rail) => {
    if (!window.ethereum || !account) return;

    try {
      await switchToFilecoinCalibration();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const paymentsContract = new Contract(
        CONTRACTS.PAYMENTS_PROXY,
        PAYMENTS_ABI,
        signer
      );

      toast.loading("Terminating rail...");
      const tx = await paymentsContract.terminateRail(rail.id);
      await tx.wait();
      toast.success("Rail terminated successfully!");

      // Refresh rails after termination
      await fetchRails();
    } catch (error) {
      console.error("Error terminating rail:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to terminate rail"
      );
    }
  };

  // Function to fetch rails
  const fetchRails = async () => {
    if (!window.ethereum || !account) return;

    try {
      setIsLoadingRails(true);
      await switchToFilecoinCalibration();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const paymentsContract = new Contract(
        CONTRACTS.PAYMENTS_PROXY,
        PAYMENTS_ABI,
        signer
      );

      // We'll fetch rails by trying incrementing IDs until we get an invalid rail
      const fetchedRails: Rail[] = [];
      let railId = 0;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3; // Stop after 3 consecutive failures

      while (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        try {
          console.log(`Fetching rail ${railId}...`);
          const rail = await paymentsContract.getRail(railId);
          console.log(`Rail ${railId} data:`, rail);

          // Only add rails where the current user is involved
          if (
            rail.from.toLowerCase() === account.toLowerCase() ||
            rail.to.toLowerCase() === account.toLowerCase() ||
            rail.operator.toLowerCase() === account.toLowerCase()
          ) {
            fetchedRails.push({
              id: railId,
              token: rail.token,
              from: rail.from,
              to: rail.to,
              operator: rail.operator,
              arbiter: rail.arbiter,
              paymentRate: BigInt(rail.paymentRate.toString()),
              lockupPeriod: BigInt(rail.lockupPeriod.toString()),
              lockupFixed: BigInt(rail.lockupFixed.toString()),
              settledUpTo: BigInt(rail.settledUpTo.toString()),
              terminationEpoch: BigInt(rail.terminationEpoch.toString()),
            });
            consecutiveFailures = 0; // Reset failure counter on success
          }
          railId++;
        } catch (error) {
          console.log(`Error fetching rail ${railId}:`, error);
          consecutiveFailures++;

          // If we get a specific error about the rail not existing, break
          if (
            error instanceof Error &&
            (error.message.includes("rail does not exist") ||
              error.message.includes("rail is inactive"))
          ) {
            break;
          }
          railId++; // Still increment railId to try the next one
        }
      }

      console.log("Fetched rails:", fetchedRails);
      setRails(fetchedRails);
    } catch (err) {
      console.error("Error in fetchRails:", err);
      handleError(err);
    } finally {
      setIsLoadingRails(false);
    }
  };

  // Function to add a new token
  const addToken = async () => {
    if (
      !newTokenAddress ||
      !window.ethereum ||
      userTokens.some((token) => token.address === newTokenAddress)
    ) {
      return;
    }

    try {
      await switchToFilecoinCalibration();
      const provider = new BrowserProvider(window.ethereum);
      const contract = new Contract(newTokenAddress, ERC20_ABI, provider);

      // Check if it's a known FEVM token
      if (isKnownFEVMToken(newTokenAddress)) {
        const tokenInfo = getKnownTokenInfo(newTokenAddress);
        if (!tokenInfo) return;

        const balance = await contract.balanceOf(account);
        const newToken: TokenData = {
          address: newTokenAddress,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          balance: ethers.formatUnits(balance, tokenInfo.decimals),
          decimals: tokenInfo.decimals,
        };

        setUserTokens([...userTokens, newToken]);
        setNewTokenAddress("");
        toast.success(`Added ${tokenInfo.symbol} token`);
        return;
      }

      // If not a known token, verify it's a valid ERC20
      if (!(await isValidERC20(contract))) {
        toast.error("Invalid or unsupported token on FEVM");
        return;
      }

      // Get token data with better error handling
      const [symbol, name, decimals, balance] = await Promise.all([
        contract.symbol().catch(() => "UNKNOWN"),
        contract.name().catch(() => "Unknown Token"),
        contract.decimals().catch(() => 18),
        contract.balanceOf(account).catch(() => BigInt(0)),
      ]);

      const newToken: TokenData = {
        address: newTokenAddress,
        symbol,
        name,
        balance: ethers.formatUnits(balance, decimals),
        decimals,
      };

      setUserTokens([...userTokens, newToken]);
      setNewTokenAddress("");
      toast.success(`Added ${symbol} token`);
    } catch (error) {
      console.error("Error adding token:", error);
      toast.error("Failed to add token");
    }
  };

  // Function to create a new rail
  const handleCreateRail = async (params: {
    token: string;
    to: string;
    arbiter?: string;
  }) => {
    if (!window.ethereum || !account) return;

    try {
      await switchToFilecoinCalibration();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Get the token contract
      const tokenContract = new Contract(params.token, ERC20_ABI, signer);
      const paymentsContract = new Contract(
        CONTRACTS.PAYMENTS_PROXY,
        PAYMENTS_ABI,
        signer
      );

      // First check token approval for the Payments contract
      const tokenAllowance = await tokenContract.allowance(
        account,
        CONTRACTS.PAYMENTS_PROXY
      );
      if (tokenAllowance === BigInt(0)) {
        toast.loading("Approving token usage...");
        const approveTx = await tokenContract.approve(
          CONTRACTS.PAYMENTS_PROXY,
          "115792089237316195423570985008687907853269984665640564039457584007913129639935" // max uint256
        );
        await approveTx.wait();
        toast.success("Token approved successfully!");
      }

      // Check operator approval
      const approval = await paymentsContract.operatorApprovals(
        params.token,
        account,
        account
      );

      if (!approval.isApproved) {
        toast.loading("Setting operator approval...");
        try {
          // Set operator approval first
          const approveTx = await paymentsContract.setOperatorApproval(
            params.token,
            account, // operator is the same as the account
            true, // approved
            "115792089237316195423570985008687907853269984665640564039457584007913129639935", // max uint256 for rate allowance
            "115792089237316195423570985008687907853269984665640564039457584007913129639935" // max uint256 for lockup allowance
          );
          await approveTx.wait();
          toast.success("Operator approved successfully!");
        } catch (error) {
          console.error("Error setting operator approval:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to approve operator"
          );
          throw error;
        }
      }

      // Create the rail with proper gas estimation
      toast.loading("Creating payment rail...");
      try {
        // Estimate gas for the transaction
        const gasEstimate = await paymentsContract.createRail.estimateGas(
          params.token,
          account,
          params.to,
          params.arbiter || "0x0000000000000000000000000000000000000000"
        );

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

        const tx = await paymentsContract.createRail(
          params.token,
          account,
          params.to,
          params.arbiter || "0x0000000000000000000000000000000000000000",
          {
            gasLimit,
          }
        );

        // Wait for transaction with better error handling
        const receipt = await tx.wait();

        if (receipt.status === 0) {
          throw new Error("Transaction failed");
        }

        toast.success("Rail created successfully!");
      } catch (error) {
        console.error("Error creating rail:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create rail"
        );
        throw error;
      }

      // After successful creation, fetch rails again
      await fetchRails();
    } catch (error) {
      console.error("Error creating rail:", error);
      // Extract the revert reason if available
      const revertReason =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to create rail: ${revertReason}`);
      throw error;
    }
  };

  // Function to handle errors
  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      toast(err.message);
    } else {
      toast("An error occurred");
    }
  };

  // Effect to fetch tokens when account changes
  useEffect(() => {
    const fetchTokens = async () => {
      if (!account || !window.ethereum) return;

      try {
        setIsLoading(true);
        await switchToFilecoinCalibration();

        const provider = new BrowserProvider(window.ethereum);

        // Get native FIL balance
        const filBalance = await provider.getBalance(account);
        const formattedFilBalance = ethers.formatUnits(filBalance, 18);

        // Add FIL as the first token
        const tokenList: TokenData[] = [
          {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "tFIL",
            name: "Filecoin",
            balance: formattedFilBalance,
            decimals: 18,
          },
        ];

        // Discover all FEVM tokens
        const discoveredTokens = await discoverTokens(
          provider as unknown as JsonRpcProvider,
          account
        );
        const allTokens = [...tokenList, ...discoveredTokens];

        // Filter out tokens with zero balance
        const tokensWithBalance = allTokens.filter(
          (token) => parseFloat(token.balance) > 0
        );

        setUserTokens(tokensWithBalance);

        // Get deposited amounts
        const deposits = await getDepositedAmounts(
          provider as unknown as JsonRpcProvider,
          account,
          tokensWithBalance
        );
        setDepositedAmounts(deposits);
      } catch (error) {
        console.error("Error fetching tokens:", error);
        toast.error("Failed to load tokens");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTokens();
  }, [account]);

  // Effect to fetch rails when account changes
  useEffect(() => {
    if (account) {
      fetchRails();
    }
  }, [account]);

  // Calculate total deposited amount for a specific token
  const calculateTotalDeposited = (tokenAddress: string) => {
    return parseFloat(depositedAmounts[tokenAddress] || "0");
  };

  // Calculate total locked amount for a specific token
  const calculateTotalLocked = (tokenAddress: string) => {
    const relevantRails = rails.filter(
      (rail) =>
        rail.token.toLowerCase() === tokenAddress.toLowerCase() &&
        rail.from.toLowerCase() === account?.toLowerCase() &&
        rail.terminationEpoch === BigInt(0)
    );

    return relevantRails.reduce((total, rail) => {
      const lockupFixed = Number(rail.lockupFixed);
      const lockupPeriod = Number(rail.lockupPeriod);
      const paymentRate = Number(rail.paymentRate);
      return total + lockupFixed + paymentRate * lockupPeriod;
    }, 0);
  };

  // Calculate total withdrawable amount for a specific token
  const calculateWithdrawable = (tokenAddress: string) => {
    const deposited = calculateTotalDeposited(tokenAddress);
    const locked = calculateTotalLocked(tokenAddress);
    return Math.max(0, deposited - locked);
  };

  // Handle withdrawal of tokens
  const handleWithdraw = async (
    tokenAddress: string,
    amount: string,
    recipientAddress?: string
  ) => {
    if (!window.ethereum || !account) return;

    try {
      await switchToFilecoinCalibration();
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const paymentsContract = new Contract(
        CONTRACTS.PAYMENTS_PROXY,
        PAYMENTS_ABI,
        signer
      );

      const token = userTokens.find((t) => t.address === tokenAddress);
      if (!token) throw new Error("Token not found");

      toast.loading("Withdrawing tokens...");
      const tx = recipientAddress
        ? await paymentsContract.withdrawTo(
            tokenAddress,
            recipientAddress,
            ethers.parseUnits(amount, token.decimals)
          )
        : await paymentsContract.withdraw(
            tokenAddress,
            ethers.parseUnits(amount, token.decimals)
          );
      await tx.wait();
      toast.success("Tokens withdrawn successfully!");

      // Refresh deposited amounts
      const discoveredTokens = await discoverTokens(
        provider as unknown as JsonRpcProvider,
        account
      );
      setUserTokens(discoveredTokens);
      const newDepositedAmounts = await getDepositedAmounts(
        provider as unknown as JsonRpcProvider,
        account,
        discoveredTokens
      );
      setDepositedAmounts(newDepositedAmounts);
    } catch (error) {
      console.error("Error withdrawing tokens:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to withdraw tokens"
      );
    }
  };

  return {
    newTokenAddress,
    setNewTokenAddress,
    userTokens,
    depositedAmounts,
    isLoading,
    rails,
    isLoadingRails,
    handleTerminate,
    addToken,
    handleCreateRail,
    calculateTotalDeposited,
    calculateTotalLocked,
    calculateWithdrawable,
    handleWithdraw,
  };
};

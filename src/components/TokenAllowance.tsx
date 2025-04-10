import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { ERC20_ABI, PAYMENTS_ABI } from "@/contracts";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

interface TokenAllowanceProps {
  tokenAddress: string;
  paymentsAddress: string;
  account: string;
}

type TransactionStatus =
  | "idle"
  | "awaiting_approval"
  | "pending"
  | "mining"
  | "success"
  | "error";

type Mode = "deposit" | "allowance";

export default function TokenAllowance({
  tokenAddress,
  paymentsAddress,
  account,
}: TokenAllowanceProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{
    symbol: string;
    balance: string;
    allowance: string;
    decimals: number;
  } | null>(null);
  const [txStatus, setTxStatus] = useState<TransactionStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("deposit");

  const loadTokenInfo = useCallback(async () => {
    if (!window.ethereum) return;
    setError(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );

      // First check if contract implements basic ERC20 functions
      try {
        await Promise.all([
          tokenContract.symbol(),
          tokenContract.decimals(),
          tokenContract.balanceOf(account),
          tokenContract.allowance(account, paymentsAddress),
        ]);
      } catch {
        setError(
          "This contract does not implement the ERC20 interface correctly"
        );
        return;
      }

      const [symbol, decimals, balance, allowance] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.balanceOf(account),
        tokenContract.allowance(account, paymentsAddress),
      ]);

      setTokenInfo({
        symbol,
        decimals,
        balance: ethers.formatUnits(balance, decimals),
        allowance: ethers.formatUnits(allowance, decimals),
      });
    } catch (err) {
      console.error("Error loading token info:", err);
      setError("Failed to load token information");
    }
  }, [account, paymentsAddress, tokenAddress]);

  const handleTransaction = async () => {
    if (!window.ethereum || !tokenInfo || !amount) return;

    try {
      setLoading(true);
      setTxStatus("awaiting_approval");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals);

      if (mode === "allowance") {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          signer
        );

        // First check if the amount is valid
        try {
          const currentAllowance = await tokenContract.allowance(
            account,
            paymentsAddress
          );
          // If current allowance is not zero, we need to reset it first
          if (currentAllowance > 0) {
            const resetTx = await tokenContract.approve(paymentsAddress, 0);
            await resetTx.wait();
          }
        } catch (err) {
          console.error("Error checking/resetting allowance:", err);
          throw new Error(
            "Failed to check current allowance. The token contract might be paused or restricted."
          );
        }

        try {
          const tx = await tokenContract.approve(paymentsAddress, amountWei);
          setTxHash(tx.hash);
          setTxStatus("pending");

          toast.loading(
            <div className="flex flex-col gap-1">
              <p className="font-medium">Approving {tokenInfo.symbol}</p>
              <p className="text-xs text-gray-500">Transaction pending...</p>
            </div>
          );

          const receipt = await tx.wait();
          setTxStatus("mining");

          if (receipt.status === 1) {
            setTxStatus("success");
            toast.success(
              <div className="flex flex-col gap-1">
                <p className="font-medium">Approval Successful!</p>
                <p className="text-xs text-gray-500">
                  New allowance set to {amount} {tokenInfo.symbol}
                </p>
              </div>
            );
            await loadTokenInfo();
            setAmount("");
          } else {
            throw new Error("Transaction failed");
          }
        } catch (approveErr: unknown) {
          console.error("Approval error:", approveErr);
          // Handle specific error cases
          if (
            approveErr &&
            typeof approveErr === "object" &&
            "code" in approveErr &&
            approveErr.code === "CALL_EXCEPTION"
          ) {
            throw new Error(
              "Token approval failed. The token contract might be paused or restricted."
            );
          }
          // Re-throw the original error if it's not a known case
          if (approveErr instanceof Error) {
            throw approveErr;
          }
          throw new Error("An unknown error occurred");
        }
      } else {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          signer
        );

        try {
          // Check balance
          const balance = await tokenContract.balanceOf(account);
          if (balance < amountWei) {
            throw new Error(
              `Insufficient balance. You have ${ethers.formatUnits(
                balance,
                tokenInfo.decimals
              )} ${tokenInfo.symbol}`
            );
          }

          // Check allowance
          const allowance = await tokenContract.allowance(
            account,
            paymentsAddress
          );
          if (allowance < amountWei) {
            throw new Error(
              `Insufficient allowance. Switch to Allowance mode to approve ${amount} ${tokenInfo.symbol}`
            );
          }

          const paymentsContract = new ethers.Contract(
            paymentsAddress,
            PAYMENTS_ABI,
            signer
          );

          // First estimate gas to check if the transaction will fail
          let gasLimit;
          try {
            gasLimit = await paymentsContract.deposit.estimateGas(
              tokenAddress,
              account,
              amountWei
            );
          } catch (gasErr: unknown) {
            console.error("Gas estimation error:", gasErr);
            if (gasErr && typeof gasErr === "object") {
              // Check for specific error messages in the error object
              const errorString = JSON.stringify(gasErr).toLowerCase();
              if (errorString.includes("insufficient")) {
                throw new Error("Insufficient funds to cover gas costs");
              } else if (errorString.includes("revert")) {
                throw new Error(
                  "Transaction would fail - the contract rejected the operation"
                );
              }
            }
            throw new Error(
              "Failed to estimate gas. The transaction might not be possible at this time."
            );
          }

          const tx = await paymentsContract.deposit(
            tokenAddress,
            account,
            amountWei,
            {
              gasLimit: (gasLimit * BigInt(120)) / BigInt(100),
              // Add maxFeePerGas and maxPriorityFeePerGas for better gas handling
              maxFeePerGas: null, // Let MetaMask suggest the gas price
              maxPriorityFeePerGas: null,
            }
          );

          setTxHash(tx.hash);
          setTxStatus("pending");

          toast.loading(
            <div className="flex flex-col gap-1">
              <p className="font-medium">Depositing {tokenInfo.symbol}</p>
              <p className="text-xs text-gray-500">Transaction pending...</p>
            </div>
          );

          const receipt = await tx.wait();
          setTxStatus("mining");

          if (receipt.status === 1) {
            setTxStatus("success");
            toast.success(
              <div className="flex flex-col gap-1">
                <p className="font-medium">Deposit Successful!</p>
                <p className="text-xs text-gray-500">
                  Tokens have been deposited
                </p>
              </div>
            );
            await loadTokenInfo();
            setAmount("");
          } else {
            throw new Error("Transaction failed");
          }
        } catch (depositErr: unknown) {
          console.error("Deposit error:", depositErr);

          // Handle specific error cases
          if (depositErr && typeof depositErr === "object") {
            const errorString = JSON.stringify(depositErr).toLowerCase();

            if ("code" in depositErr) {
              switch (depositErr.code) {
                case -32603:
                  throw new Error(
                    "The transaction was rejected. This might be due to insufficient funds or contract restrictions."
                  );
                case "UNPREDICTABLE_GAS_LIMIT":
                  throw new Error(
                    "Unable to estimate gas. The transaction might fail or the contract might be paused."
                  );
                case "CALL_EXCEPTION":
                  throw new Error(
                    "The contract rejected the transaction. It might be paused or the operation is not allowed."
                  );
                default:
                  if (errorString.includes("user rejected")) {
                    throw new Error("Transaction was rejected by user");
                  }
              }
            }
          }

          // If it's a regular error, just throw it
          if (depositErr instanceof Error) {
            throw depositErr;
          }

          // Fallback error
          throw new Error(
            "Transaction failed. Please try again or contact support if the issue persists."
          );
        }
      }
    } catch (err) {
      console.error("Error:", err);
      setTxStatus("error");
      const errorMessage =
        err instanceof Error ? err.message : "Transaction failed";
      toast.error(
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {mode === "allowance" ? "Approval" : "Deposit"} Failed
          </p>
          <p className="text-xs text-gray-500">{errorMessage}</p>
        </div>
      );
    } finally {
      setLoading(false);
      setTxHash(null);
    }
  };

  useEffect(() => {
    loadTokenInfo();
  }, [tokenAddress, account, paymentsAddress, loadTokenInfo]);

  useEffect(() => {
    if (tokenInfo && Number(tokenInfo.allowance) <= 0 && mode === "deposit") {
      setMode("allowance");
    }
  }, [tokenInfo, mode]);

  if (error) {
    return (
      <motion.div
        className="p-4 border border-red-100 bg-red-50 rounded-lg"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
      >
        <p className="text-sm text-red-600">{error}</p>
        <motion.button
          onClick={() => loadTokenInfo()}
          className="mt-2 text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Retry
        </motion.button>
      </motion.div>
    );
  }

  if (!tokenInfo) {
    return (
      <motion.div
        className="p-4 border border-gray-100 rounded-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 rounded animate-pulse w-1/4"></div>
          <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2"></div>
        </div>
      </motion.div>
    );
  }

  const isTransacting = txStatus === "pending" || txStatus === "mining";
  const buttonColor = mode === "allowance" ? "bg-black" : "bg-blue-500";
  const buttonHoverColor =
    mode === "allowance" ? "hover:bg-gray-800" : "hover:bg-blue-600";
  const disabledColor = mode === "allowance" ? "bg-gray-300" : "bg-blue-300";

  return (
    <motion.div
      className="p-4 border border-gray-100 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div
            className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md"
            whileHover={{ scale: 1.02 }}
          >
            <span className="text-sm font-medium text-gray-700">
              {Number(tokenInfo.balance).toFixed(4)}
            </span>
            <span className="text-sm text-gray-500">{tokenInfo.symbol}</span>
          </motion.div>
          <motion.button
            onClick={() => loadTokenInfo()}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50"
            whileHover={{ rotate: 180, backgroundColor: "rgb(249 250 251)" }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </motion.button>
        </div>
        <motion.div
          className="inline-flex bg-gray-100 rounded-lg p-0.5"
          initial={false}
        >
          {["deposit", "allowance"].map((m) => {
            if (m === "deposit" && Number(tokenInfo.allowance) <= 0) {
              return null;
            }
            return (
              <motion.button
                key={m}
                onClick={() => {
                  setMode(m as Mode);
                  setAmount("");
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                whileHover={{ scale: mode === m ? 1 : 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <motion.div
          className="text-sm text-gray-500 flex items-center gap-2"
          initial={false}
        >
          <span className="text-gray-400">Current Allowance:</span>
          <span
            className={`font-medium ${
              mode === "allowance" ? "text-black" : ""
            }`}
          >
            {Number(tokenInfo.allowance).toFixed(4)} {tokenInfo.symbol}
          </span>
        </motion.div>
      </div>

      <div className="relative">
        <motion.div
          className="relative group"
          whileHover={{ y: -1 }}
          transition={{ type: "spring", stiffness: 500 }}
        >
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${
              mode === "allowance"
                ? "Set new allowance"
                : "Enter deposit amount"
            } in ${tokenInfo.symbol}`}
            disabled={isTransacting}
            className="w-full px-3 py-2 pr-24 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm group-hover:border-gray-400 transition-all disabled:bg-gray-50 disabled:text-gray-500"
          />
          <motion.button
            onClick={handleTransaction}
            disabled={loading || !amount || isTransacting}
            className={`absolute right-1 top-1 bottom-1 px-4 text-white text-sm font-medium rounded-md disabled:cursor-not-allowed shadow-sm ${buttonColor} ${buttonHoverColor} disabled:${disabledColor}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isTransacting ? (
              <motion.span
                className="inline-flex items-center gap-1"
                animate={{ opacity: [1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <svg
                  className="w-3 h-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {txStatus === "pending" ? "Confirming" : "Mining"}
              </motion.span>
            ) : mode === "allowance" ? (
              "Approve"
            ) : (
              "Deposit"
            )}
          </motion.button>
        </motion.div>

        <AnimatePresence>
          {txStatus === "pending" && txHash && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-center gap-2 text-xs text-gray-500"
            >
              <motion.div
                className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <a
                href={`https://calibration.filfox.info/en/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 truncate hover:underline"
              >
                View Transaction
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

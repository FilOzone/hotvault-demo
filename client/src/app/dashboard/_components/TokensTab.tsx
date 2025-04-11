"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { TokenData } from "@/contracts";
import TokenAllowance from "@/components/TokenAllowance";
import { CONTRACTS } from "@/contracts";
import { useAuth } from "@/contexts/AuthContext";
import Skeleton from "react-loading-skeleton";
import { Typography } from "@/components/ui/typography";

interface TokensTabProps {
  isLoading: boolean;
  userTokens: TokenData[];
  depositedAmounts: { [address: string]: string };
  newTokenAddress: string;
  setNewTokenAddress: (address: string) => void;
  addToken: () => void;
}

export const TokensTab: React.FC<TokensTabProps> = ({
  isLoading,
  userTokens,
  depositedAmounts,
  newTokenAddress,
  setNewTokenAddress,
  addToken,
}) => {
  const { account } = useAuth();

  if (!account) return null;

  return (
    <motion.div
      key="tokens"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <Typography variant="h2" className="text-xl font-mono">
            FEVM Token Allowances
          </Typography>
          <Typography variant="body" className="text-gray-500 mt-1">
            Manage token allowances for the Payments contract on FEVM
          </Typography>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 md:w-auto">
          <div className="sm:max-w-md">
            <Input
              value={newTokenAddress}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewTokenAddress(e.target.value)
              }
              placeholder="Enter FEVM token address"
              className="flex w-70 min-w-0 bg-background border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background/5"
            />
          </div>
          <Button
            onClick={addToken}
            disabled={!newTokenAddress}
          >
            Add Token
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-xl border border-gray-200">
              <Skeleton height={100} />
            </div>
          ))}
        </div>
      ) : userTokens.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {userTokens.map((token, index) => (
            <motion.div
              key={token.address}
              className="p-6 rounded-xl border border-gray-200 hover:border-blue-200 transition-all"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{
                y: -2,
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <Typography
                    variant="h3"
                    className="text-lg font-mono truncate"
                  >
                    {token.symbol}
                  </Typography>
                  <Typography
                    variant="small"
                    className="text-gray-500 truncate"
                  >
                    {token.name}
                  </Typography>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 ml-4">
                  <Typography variant="small" className="font-mono text-base">
                    {parseFloat(token.balance).toFixed(4)}
                  </Typography>
                  <Typography variant="small" className="text-gray-500 text-sm">
                    Deposited:{" "}
                    {parseFloat(depositedAmounts[token.address] || "0").toFixed(
                      4
                    )}
                  </Typography>
                </div>
              </div>
              {/* Only show TokenAllowance for non-FIL tokens */}
              {token.address !==
                "0x0000000000000000000000000000000000000000" && (
                <TokenAllowance
                  tokenAddress={token.address}
                  paymentsAddress={CONTRACTS.PAYMENTS_PROXY}
                  account={account}
                />
              )}
              {/* Show message for FIL */}
              {token.address ===
                "0x0000000000000000000000000000000000000000" && (
                <Typography variant="small" className="text-sm text-gray-500 mt-2">
                  Native FIL does not require allowance. Use WFIL for payments.
                </Typography>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          className="text-center py-12 rounded-xl border-2 border-dashed border-gray-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <Typography variant="body" className="text-gray-500">
            No FEVM tokens found. Add a token to get started.
          </Typography>
        </motion.div>
      )}
    </motion.div>
  );
};

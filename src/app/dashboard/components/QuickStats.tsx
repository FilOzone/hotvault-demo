"use client";

import { Text } from "@/theme/components";
import { motion } from "framer-motion";
import { TokenData } from "@/contracts";
import { Rail } from "../types";
import Skeleton from "react-loading-skeleton";
import { useState } from "react";
import { WithdrawalModal } from "./WithdrawalModal";

interface QuickStatsProps {
  userTokens: TokenData[];
  rails: Rail[];
  isLoading: boolean;
  calculateTotalDeposited: (tokenAddress: string) => number;
  calculateTotalLocked: (tokenAddress: string) => number;
  calculateWithdrawable: (tokenAddress: string) => number;
  handleWithdraw: (tokenAddress: string, amount: string) => Promise<void>;
}

export const QuickStats: React.FC<QuickStatsProps> = ({
  userTokens,
  rails,
  isLoading,
  calculateTotalDeposited,
  calculateTotalLocked,
  calculateWithdrawable,
  handleWithdraw,
}) => {
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);

  const quickStats = [
    {
      id: "deposited",
      label: "Token Deposits",
      value: userTokens
        .map(
          (token) =>
            `${token.symbol}: ${calculateTotalDeposited(token.address).toFixed(
              4
            )}`
        )
        .join("\n"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2"
          />
        </svg>
      ),
    },
    {
      id: "locked",
      label: "Total Locked",
      value: userTokens
        .map(
          (token) =>
            `${token.symbol}: ${calculateTotalLocked(token.address).toFixed(4)}`
        )
        .join("\n"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
    },
    {
      id: "withdrawable",
      label: "Withdrawable",
      value: userTokens
        .map(
          (token) =>
            `${token.symbol}: ${calculateWithdrawable(token.address).toFixed(
              4
            )}`
        )
        .join("\n"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
    },
    {
      id: "rails",
      label: "Active Rails",
      value: rails
        .filter((r) => r.terminationEpoch === BigInt(0))
        .length.toString(),
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
  ];

  return (
    <>
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {quickStats.map((stat, index) => (
          <motion.div
            key={stat.id}
            className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-200/80 hover:border-blue-200 transition-all"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <Text
                  variant="small"
                  className="text-gray-500 font-medium truncate"
                >
                  {stat.label}
                </Text>
                {["deposited", "locked", "withdrawable"].includes(stat.id) ? (
                  <div className="mt-2 space-y-1">
                    {isLoading ? (
                      <Skeleton count={3} />
                    ) : userTokens.length > 0 ? (
                      userTokens.map((token) => {
                        const amount =
                          stat.id === "deposited"
                            ? calculateTotalDeposited(token.address)
                            : stat.id === "locked"
                            ? calculateTotalLocked(token.address)
                            : calculateWithdrawable(token.address);

                        return (
                          <div
                            key={token.address}
                            className="flex justify-between items-center"
                          >
                            <Text variant="small" className="font-mono">
                              {token.symbol}:
                            </Text>
                            <div className="flex items-center gap-2">
                              <Text variant="small" className="font-mono">
                                {amount.toFixed(4)}
                              </Text>
                              {stat.id === "withdrawable" && amount > 0 && (
                                <button
                                  onClick={() => {
                                    setSelectedToken(token);
                                    setIsWithdrawalModalOpen(true);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <Text variant="small" className="text-gray-500">
                        No tokens available
                      </Text>
                    )}
                  </div>
                ) : (
                  <Text
                    variant="h3"
                    className="text-lg font-mono mt-1 truncate font-medium"
                  >
                    {isLoading ? <Skeleton width={100} /> : stat.value}
                  </Text>
                )}
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-500 flex-shrink-0 ml-4">
                {stat.icon}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {selectedToken && (
        <WithdrawalModal
          isOpen={isWithdrawalModalOpen}
          onClose={() => {
            setIsWithdrawalModalOpen(false);
            setSelectedToken(null);
          }}
          token={selectedToken}
          withdrawable={calculateWithdrawable(selectedToken.address)}
          onSubmit={handleWithdraw}
        />
      )}
    </>
  );
};

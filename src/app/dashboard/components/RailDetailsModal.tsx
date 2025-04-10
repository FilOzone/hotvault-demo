"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Text } from "@/theme/components";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { RailDetailsModalProps, BUTTON_STYLES } from "../types";

export const RailDetailsModal: React.FC<RailDetailsModalProps> = ({
  isOpen,
  onClose,
  rail,
  tokens,
}) => {
  const { account } = useAuth();

  if (!isOpen || !rail || !account) return null;

  const token = tokens.find(
    (t) => t?.address?.toLowerCase() === rail?.token?.toLowerCase()
  );
  const isTerminated = rail.terminationEpoch !== BigInt(0);
  const isActive = !isTerminated;

  const formatEpochDuration = (epochs: bigint): string => {
    const epochsNum = Number(epochs);
    if (epochsNum === 0) return "0 epochs";
    if (epochsNum === 1) return "1 epoch";
    return `${epochsNum} epochs`;
  };

  const userRole = (() => {
    const addr = account.toLowerCase();
    if (rail.from.toLowerCase() === addr) return "Payer";
    if (rail.to.toLowerCase() === addr) return "Recipient";
    if (rail.operator.toLowerCase() === addr) return "Operator";
    if (rail.arbiter.toLowerCase() === addr) return "Arbiter";
    return null;
  })();

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4"
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Close button */}
        <motion.button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors z-10"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </motion.button>

        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Text variant="h2" className="text-2xl font-mono">
                  Rail #{rail.id}
                </Text>
                <motion.div
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-green-50 text-green-600 border border-green-200"
                      : "bg-red-50 text-red-600 border border-red-200"
                  }`}
                  whileHover={{ scale: 1.05 }}
                >
                  {isActive ? "Active" : "Terminated"}
                </motion.div>
              </div>
              <Text variant="body" className="text-gray-500">
                {token?.symbol || "Unknown"} Payment Rail
              </Text>
            </div>
            <div className="flex items-center gap-2">
              {userRole && (
                <motion.div
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-medium border border-blue-100"
                  whileHover={{ scale: 1.05 }}
                >
                  {userRole}
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Content - Make scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {/* Payment Details */}
            <div className="space-y-6">
              <div>
                <Text
                  variant="small"
                  className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-4"
                >
                  Payment Details
                </Text>
                <div className="space-y-4">
                  <motion.div
                    className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Text variant="small" className="text-gray-400 text-xs">
                        Rate
                      </Text>
                      <motion.div
                        className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        whileHover={{ scale: 1.05 }}
                      >
                        Per Epoch
                      </motion.div>
                    </div>
                    <Text variant="body" className="font-mono text-base">
                      {ethers.formatUnits(
                        rail.paymentRate,
                        token?.decimals || 18
                      )}{" "}
                      {token?.symbol || "Unknown"}
                    </Text>
                  </motion.div>

                  <motion.div
                    className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Text variant="small" className="text-gray-400 text-xs">
                        Lockup Period
                      </Text>
                      <motion.div
                        className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        whileHover={{ scale: 1.05 }}
                      >
                        Duration
                      </motion.div>
                    </div>
                    <Text variant="body" className="font-mono text-base">
                      {formatEpochDuration(rail.lockupPeriod)}
                    </Text>
                  </motion.div>

                  <motion.div
                    className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Text variant="small" className="text-gray-400 text-xs">
                        Fixed Lockup
                      </Text>
                      <motion.div
                        className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        whileHover={{ scale: 1.05 }}
                      >
                        Amount
                      </motion.div>
                    </div>
                    <Text variant="body" className="font-mono text-base">
                      {ethers.formatUnits(
                        rail.lockupFixed,
                        token?.decimals || 18
                      )}{" "}
                      {token?.symbol || "Unknown"}
                    </Text>
                  </motion.div>
                </div>
              </div>

              <div>
                <Text
                  variant="small"
                  className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-4"
                >
                  Token Info
                </Text>
                <motion.div
                  className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Text variant="small" className="text-gray-400 text-xs">
                      Contract Address
                    </Text>
                    <motion.button
                      onClick={() => {
                        navigator.clipboard.writeText(rail.token);
                        toast.success("Address copied to clipboard!");
                      }}
                      className="text-blue-500 hover:text-blue-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                        />
                      </svg>
                      Copy
                    </motion.button>
                  </div>
                  <Text variant="body" className="font-mono text-sm break-all">
                    {rail.token}
                  </Text>
                </motion.div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div>
                <Text
                  variant="small"
                  className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-4"
                >
                  Participants
                </Text>
                <div className="space-y-4">
                  {[
                    { role: "Payer", address: rail.from },
                    { role: "Recipient", address: rail.to },
                    { role: "Operator", address: rail.operator },
                    ...(rail.arbiter !== ethers.ZeroAddress
                      ? [{ role: "Arbiter", address: rail.arbiter }]
                      : []),
                  ].map(({ role, address }) => (
                    <motion.div
                      key={role}
                      className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                      whileHover={{ y: -2 }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Text
                            variant="small"
                            className="text-gray-400 text-xs"
                          >
                            {role}
                          </Text>
                          {address.toLowerCase() === account.toLowerCase() && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                              You
                            </span>
                          )}
                        </div>
                        <motion.button
                          onClick={() => {
                            navigator.clipboard.writeText(address);
                            toast.success("Address copied to clipboard!");
                          }}
                          className="text-blue-500 hover:text-blue-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                            />
                          </svg>
                          Copy
                        </motion.button>
                      </div>
                      <Text
                        variant="body"
                        className="font-mono text-sm break-all"
                      >
                        {address}
                      </Text>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Settlement Status */}
              <div>
                <Text
                  variant="small"
                  className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-4"
                >
                  Settlement Status
                </Text>
                <div className="space-y-4">
                  <motion.div
                    className="p-4 bg-gray-50 rounded-xl group hover:bg-gray-100/80 transition-colors"
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Text variant="small" className="text-gray-400 text-xs">
                        Settled Up To
                      </Text>
                      <motion.div
                        className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        whileHover={{ scale: 1.05 }}
                      >
                        Block Number
                      </motion.div>
                    </div>
                    <Text variant="body" className="font-mono text-base">
                      {rail.settledUpTo.toString()}
                    </Text>
                  </motion.div>

                  {isTerminated && (
                    <motion.div
                      className="p-4 bg-red-50 rounded-xl group hover:bg-red-100/80 transition-colors"
                      whileHover={{ y: -2 }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Text variant="small" className="text-red-400 text-xs">
                          Termination Block
                        </Text>
                        <motion.div
                          className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          whileHover={{ scale: 1.05 }}
                        >
                          Final Block
                        </motion.div>
                      </div>
                      <Text
                        variant="body"
                        className="font-mono text-base text-red-600"
                      >
                        {rail.terminationEpoch.toString()}
                      </Text>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl flex justify-end flex-shrink-0">
          <motion.button
            onClick={onClose}
            className={`${BUTTON_STYLES.base} ${BUTTON_STYLES.secondary} min-w-[100px]`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Close
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

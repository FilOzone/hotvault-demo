"use client";

import { Typography } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { TokenData } from "@/contracts";
import { Rail } from "@/types/dashboard";
import { useState } from "react";
import Skeleton from "react-loading-skeleton";
import { RailDetailsModal } from "@/app/dashboard/_components/RailDetailsModal";
import { RailCreationModal } from "@/app/dashboard/_components/RailCreationModal";

interface RailsTabProps {
  isLoading: boolean;
  rails: Rail[];
  userTokens: TokenData[];
  handleCreateRail: (params: {
    token: string;
    to: string;
    arbiter?: string;
  }) => Promise<void>;
  handleTerminate: (rail: Rail) => Promise<void>;
}

export const RailsTab: React.FC<RailsTabProps> = ({
  isLoading,
  rails,
  userTokens,
  handleCreateRail,
  handleTerminate,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState<Rail | null>(null);
  const [activeView, setActiveView] = useState<"active" | "terminated">(
    "active"
  );

  const activeRails = rails.filter((rail) => !rail.terminationEpoch);
  const terminatedRails = rails.filter((rail) => rail.terminationEpoch);

  const handleCreateRailSubmit = async (
    token: string,
    recipient: string,
    arbiter: string
  ) => {
    await handleCreateRail({
      token,
      to: recipient,
      arbiter: arbiter || undefined,
    });
  };

  const handleTerminateRail = async (railId: string) => {
    const rail = rails.find((r) => r.id.toString() === railId);
    if (rail) {
      await handleTerminate(rail);
    }
  };

  const formatEpochDuration = (epochs: bigint): string => {
    const epochsNum = Number(epochs);
    if (epochsNum === 0) return "0 epochs";
    if (epochsNum === 1) return "1 epoch";
    return `${epochsNum} epochs`;
  };

  const RailCard = ({ rail, index }: { rail: Rail; index: number }) => (
    <motion.div
      key={rail.id}
      className={`p-6 rounded-xl border transition-all cursor-pointer ${
        rail.terminationEpoch
          ? "border-gray-200 hover:border-red-200 bg-gray-50"
          : "border-gray-200 hover:border-blue-200"
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{
        y: -2,
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
      onClick={() => setSelectedRail(rail)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Typography variant="h3" className="text-lg font-mono truncate">
              Rail #{rail.id}
            </Typography>
            {rail.terminationEpoch && (
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-600 rounded-full">
                Terminated
              </span>
            )}
            {!rail.terminationEpoch && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-600 rounded-full">
                Active
              </span>
            )}
          </div>
          <Typography variant="small" className="text-gray-500 truncate">
            {rail.token}
          </Typography>
        </div>
        <div className="flex flex-col items-end flex-shrink-0 ml-4">
          <Typography variant="small" className="font-mono text-base">
            {rail.paymentRate.toString()} / epoch
          </Typography>
          <Typography variant="small" className="text-gray-500 text-sm">
            Settled up to: {rail.settledUpTo.toString()}
          </Typography>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            From:
          </Typography>
          <Typography
            variant="small"
            className="font-mono text-sm truncate max-w-[200px]"
          >
            {rail.from}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            To:
          </Typography>
          <Typography
            variant="small"
            className="font-mono text-sm truncate max-w-[200px]"
          >
            {rail.to}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            Lockup Period:
          </Typography>
          <Typography variant="small" className="font-mono text-sm">
            {formatEpochDuration(rail.lockupPeriod)}
          </Typography>
        </div>
        <div className="flex justify-between items-center">
          <Typography variant="small" className="text-gray-500">
            Fixed Lockup:
          </Typography>
          <Typography variant="small" className="font-mono text-sm">
            {rail.lockupFixed.toString()}
          </Typography>
        </div>
        {rail.terminationEpoch && (
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
            <Typography variant="small" className="text-gray-500">
              Terminated at:
            </Typography>
            <Typography
              variant="small"
              className="font-mono text-sm text-red-600"
            >
              Epoch {rail.terminationEpoch.toString()}
            </Typography>
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <motion.div
      key="rails"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <Typography variant="h2" className="text-xl font-mono">
            Payment Rails
          </Typography>
          <Typography variant="body" className="text-gray-500 mt-1">
            View and manage your payment rails
          </Typography>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg border border-gray-200 p-1 shadow-sm">
            <button
              onClick={() => setActiveView("active")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeView === "active"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Active ({activeRails.length})
            </button>
            <button
              onClick={() => setActiveView("terminated")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeView === "terminated"
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Terminated ({terminatedRails.length})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              Create New Rail
            </Button>
          </div>
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
      ) : rails.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(activeView === "active" ? activeRails : terminatedRails).map(
            (rail, index) => (
              <RailCard key={rail.id} rail={rail} index={index} />
            )
          )}
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
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <Typography variant="body" className="text-gray-500">
            No payment rails found. Create a new rail to get started.
          </Typography>
        </motion.div>
      )}

      <RailCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tokens={userTokens}
        onSubmit={handleCreateRailSubmit}
      />

      {selectedRail && (
        <RailDetailsModal
          isOpen={!!selectedRail}
          onClose={() => setSelectedRail(null)}
          rail={selectedRail}
          tokens={userTokens}
          onTerminate={handleTerminateRail}
        />
      )}
    </motion.div>
  );
};

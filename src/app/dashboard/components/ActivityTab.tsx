"use client";

import { Text } from "@/theme/components";
import { motion } from "framer-motion";
import Skeleton from "react-loading-skeleton";

interface ActivityTabProps {
  isLoading: boolean;
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ isLoading }) => {
  // This is a placeholder component that will be implemented later
  // when we add activity tracking functionality
  return (
    <motion.div
      key="activity"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <Text variant="h2" className="text-xl font-mono">
            Recent Activity
          </Text>
          <Text variant="body" className="text-gray-500 mt-1">
            Track your recent transactions and rail updates
          </Text>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-200">
              <Skeleton height={24} />
              <Skeleton height={20} width={200} className="mt-2" />
            </div>
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <Text className="text-gray-500">
            Activity tracking coming soon. Stay tuned!
          </Text>
        </motion.div>
      )}
    </motion.div>
  );
};

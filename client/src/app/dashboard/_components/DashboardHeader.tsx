"use client";

import { Typography } from "@/components/ui/typography";
import { motion, AnimatePresence } from "framer-motion";
// import { TABS, type TabItem } from "@/lib/constants"; // Removed unused import
// import { DashboardSection, DASHBOARD_SECTIONS } from "@/types/dashboard"; // Removed unused import
// import { DashboardSection } from "@/types/dashboard"; // Removed unused import

interface DashboardHeaderProps {
  account: string;
  isAccountMenuOpen: boolean;
  setIsAccountMenuOpen: (isOpen: boolean) => void;
  handleAccountSwitch: () => void;
  disconnectWallet: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  account,
  isAccountMenuOpen,
  setIsAccountMenuOpen,
  handleAccountSwitch,
  disconnectWallet,
}) => {
  return (
    <motion.header
      className="w-full border-b border-gray-200/80 fixed top-0 bg-white/80 backdrop-blur-md z-50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
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
            <Typography
              variant="h1"
              className="text-xl font-mono tracking-tight"
            >
              Hot Vault
            </Typography>
          </motion.div>

          {/* Navigation - Removed as there's only one tab */}
          {/*
          <nav className="hidden md:flex items-center gap-6">
            {TABS.filter((tab) => tab.id !== DASHBOARD_SECTIONS.ACTIVITY).map((tab: TabItem) => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                    ${
                      activeTab === tab.id
                        ? "text-blue-600 bg-blue-50"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <tab.icon />
                {tab.label}
              </motion.button>
            ))}
          </nav>
          */}

          {/* Account Menu */}
          <div className="relative">
            <motion.button
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <Typography variant="small" className="font-mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </Typography>
            </motion.button>

            <AnimatePresence>
              {isAccountMenuOpen && (
                <motion.div
                  className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <div className="p-4 border-b border-gray-100">
                    <Typography variant="small" className="text-gray-500">
                      Connected Account
                    </Typography>
                    <Typography
                      variant="small"
                      className="font-mono text-sm mt-1"
                    >
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </Typography>
                  </div>
                  <div className="p-2">
                    <motion.button
                      onClick={handleAccountSwitch}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 rounded-lg flex items-center gap-2"
                      whileHover={{ x: 4 }}
                    >
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      <Typography variant="small">Switch Account</Typography>
                    </motion.button>
                    <motion.button
                      onClick={disconnectWallet}
                      className="w-full px-4 py-2 text-left hover:bg-red-50 rounded-lg flex items-center gap-2 text-red-600"
                      whileHover={{ x: 4 }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      <Typography variant="small">Disconnect</Typography>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

"use client";

import { Typography } from "@/components/ui/typography";
import { motion, AnimatePresence } from "framer-motion";
import { DASHBOARD_SECTIONS, DashboardSection } from "@/types/dashboard";
import { Dispatch, SetStateAction } from "react";
import { Files, Wallet } from "lucide-react";
import { PaymentBalanceHeader } from "./PaymentBalanceHeader";
import Image from "next/image";

interface DashboardHeaderProps {
  account: string;
  activeTab: DashboardSection;
  setActiveTab: Dispatch<SetStateAction<DashboardSection>>;
  isAccountMenuOpen: boolean;
  setIsAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  handleAccountSwitch: () => void;
  disconnectWallet: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  account,
  activeTab,
  setActiveTab,
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
          <div className="flex items-center gap-10">
            <motion.div
              className="flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-8 h-8 relative">
                <Image
                  src="/logo.png"
                  alt="Hot Vault Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <Typography
                variant="h1"
                className="text-xl font-mono tracking-tight"
              >
                Hot Vault
              </Typography>
            </motion.div>

            <nav className="flex items-center space-x-1">
              <button
                onClick={() => setActiveTab(DASHBOARD_SECTIONS.FILES)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === DASHBOARD_SECTIONS.FILES
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Files size={16} />
                Files
              </button>

              <button
                onClick={() => setActiveTab(DASHBOARD_SECTIONS.PAYMENTS)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === DASHBOARD_SECTIONS.PAYMENTS
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Wallet size={16} />
                Payment Setup
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <PaymentBalanceHeader />

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
      </div>
    </motion.header>
  );
};

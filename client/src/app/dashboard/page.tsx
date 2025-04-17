"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { DASHBOARD_SECTIONS, DashboardSection, Rail } from "@/types/dashboard";
import { useDashboard } from "@/hooks/useDashboard";
import { DashboardHeader } from "./_components/DashboardHeader";
import { QuickStats } from "./_components/QuickStats";
import { TokensTab } from "./_components/TokensTab";
import { RailsTab } from "./_components/RailsTab";
import { ActivityTab } from "./_components/ActivityTab";

export default function Dashboard() {
  const { account, handleAccountSwitch, disconnectWallet } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardSection>(
    DASHBOARD_SECTIONS.TOKENS
  );
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const {
    newTokenAddress,
    setNewTokenAddress,
    userTokens,
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
  } = useDashboard();

  if (!account) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader
        account={account}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAccountMenuOpen={isAccountMenuOpen}
        setIsAccountMenuOpen={setIsAccountMenuOpen}
        handleAccountSwitch={handleAccountSwitch}
        disconnectWallet={disconnectWallet}
      />

      <div className="pt-16">
        <main className="container mx-auto px-4 py-8">
          <QuickStats isLoading={isLoading || isLoadingRails} />

          <div className="mt-8 bg-white rounded-xl shadow-sm overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === DASHBOARD_SECTIONS.TOKENS && (
                <TokensTab
                  isLoading={isLoading}
                  userTokens={userTokens}
                  depositedAmounts={depositedAmounts}
                  newTokenAddress={newTokenAddress}
                  setNewTokenAddress={setNewTokenAddress}
                  addToken={addToken}
                />
              )}

              {activeTab === DASHBOARD_SECTIONS.RAILS && (
                <RailsTab isLoading={isLoadingRails} />
              )}

              {activeTab === DASHBOARD_SECTIONS.ACTIVITY && (
                <ActivityTab isLoading={isLoadingRails} />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

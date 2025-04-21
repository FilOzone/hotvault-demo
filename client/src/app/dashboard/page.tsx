"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { DASHBOARD_SECTIONS, DashboardSection } from "@/types/dashboard";
import { DashboardHeader } from "./_components/DashboardHeader";
import { FilesTab } from "./_components/FilesTab";
import { PaymentSetupTab } from "./_components/PaymentSetupTab";
import { ProofSetBanner } from "@/components/ui/proof-set-banner";

export default function Dashboard() {
  const { account, handleAccountSwitch, disconnectWallet } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardSection>(
    DASHBOARD_SECTIONS.FILES
  );
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLoading] = useState(false);

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

      <ProofSetBanner />

      <div className="pt-16">
        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === DASHBOARD_SECTIONS.FILES && (
                <FilesTab isLoading={isLoading} />
              )}
              {activeTab === DASHBOARD_SECTIONS.PAYMENTS && <PaymentSetupTab />}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

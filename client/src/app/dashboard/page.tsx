"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { DASHBOARD_SECTIONS, DashboardSection } from "@/types/dashboard";
import { DashboardHeader } from "./_components/DashboardHeader";
import { FilesTab } from "./_components/FilesTab";
import { PaymentSetupTab } from "./_components/PaymentSetupTab";
import { usePayment } from "@/contexts/PaymentContext";

export default function Dashboard() {
  const { account, handleAccountSwitch, disconnectWallet } = useAuth();
  const { refreshPaymentSetupStatus } = usePayment();
  const [activeTab, setActiveTab] = useState<DashboardSection>(
    DASHBOARD_SECTIONS.FILES
  );
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLoading] = useState(false);

  const handleTabChange = (tab: string) => {
    if (tab === "payment") {
      setActiveTab(DASHBOARD_SECTIONS.PAYMENTS);
    } else if (tab === "files") {
      setActiveTab(DASHBOARD_SECTIONS.FILES);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && account) {
        console.log(
          "[Dashboard] Tab became visible, refreshing payment status"
        );
        refreshPaymentSetupStatus()
          .then(() => {
            console.log(
              "[Dashboard] Payment status refreshed after visibility change"
            );
          })
          .catch((error) => {
            console.error(
              "[Dashboard] Error refreshing payment status on visibility change:",
              error
            );
          });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [account, refreshPaymentSetupStatus]);

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
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === DASHBOARD_SECTIONS.FILES && (
                <FilesTab isLoading={isLoading} onTabChange={handleTabChange} />
              )}
              {activeTab === DASHBOARD_SECTIONS.PAYMENTS && (
                <PaymentSetupTab setActiveTab={setActiveTab} />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

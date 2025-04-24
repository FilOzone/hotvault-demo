import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/constants";

export const ProofSetBanner: React.FC = () => {
  const [proofSetStatus, setProofSetStatus] = useState<
    "idle" | "pending" | "ready"
  >("idle");
  const [hasInitiated, setHasInitiated] = useState(false);

  useEffect(() => {
    // Only poll if we're in a pending state or we haven't checked yet
    if (proofSetStatus === "pending" || proofSetStatus === "idle") {
      const checkProofSetStatus = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/auth/status`, {
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();

            if (data.proofSetReady) {
              setProofSetStatus("ready");
              console.log("[ProofSetBanner] Proof set is ready");
            } else if (data.proofSetInitiated) {
              setHasInitiated(true);
              setProofSetStatus("pending");
              console.log("[ProofSetBanner] Proof set is pending");
            } else {
              setProofSetStatus("idle");
              console.log("[ProofSetBanner] Proof set not initiated");
            }
          }
        } catch (error) {
          console.error(
            "[ProofSetBanner] Error checking proof set status:",
            error
          );
        }
      };

      // Check immediately on mount
      checkProofSetStatus();

      // Set up polling every 15 seconds
      const interval = setInterval(checkProofSetStatus, 15000);

      return () => clearInterval(interval);
    }
  }, [proofSetStatus]);

  // Only show banner if proof set creation has been initiated and is pending
  if (!hasInitiated || proofSetStatus !== "pending") return null;

  return (
    <motion.div
      className="fixed top-16 inset-x-0 z-40"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-3 bg-blue-50 border border-blue-200 shadow-md rounded-md text-blue-700 flex items-center gap-3">
          <div className="flex-shrink-0 bg-blue-100 p-2 rounded-full">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              Proof Set Creation in Progress
            </p>
            <p className="text-xs">
              Your proof set is being created on FWS. This process typically
              takes few minutes to complete.{" "}
              <span className="font-semibold">
                File uploads are temporarily disabled
              </span>{" "}
              and will become available once the proof set is ready.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

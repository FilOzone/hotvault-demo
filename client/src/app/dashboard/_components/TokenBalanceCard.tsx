import { usePayment } from "@/contexts/PaymentContext";
import * as Constants from "@/lib/constants";
import { RefreshCw } from "lucide-react";

export const TokenBalanceCard = () => {
  const { paymentStatus, refreshBalance } = usePayment();
  const { usdcBalance, hasMinimumBalance, isLoading, error } = paymentStatus;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
      <div className="p-5 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-800">USDFC Balance</h3>
          <button
            onClick={() => refreshBalance()}
            className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors"
            disabled={isLoading}
            aria-label="Refresh balance"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {error ? (
          <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm mb-4">
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex items-baseline mb-3">
          <span className="text-3xl font-bold text-gray-800">
            {usdcBalance}
          </span>
          <span className="ml-2 text-gray-500 font-medium">USDFC</span>
        </div>

        {!hasMinimumBalance ? (
          <div className="flex items-center p-3 bg-amber-50 text-amber-700 rounded-md text-sm">
            <div className="flex-1">
              You need at least{" "}
              <span className="font-semibold">
                {Constants.MINIMUM_USDFC_BALANCE} USDFC
              </span>{" "}
              to create a proof set.
            </div>
          </div>
        ) : (
          <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm">
            <span className="font-medium">✓</span> You have sufficient USDFC for
            creating proof sets.
          </div>
        )}
      </div>
    </div>
  );
};

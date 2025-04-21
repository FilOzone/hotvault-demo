import { usePayment } from "@/contexts/PaymentContext";
import * as Constants from "@/lib/constants";

export const USDFCBalanceDisplay = () => {
  const { paymentStatus, refreshBalance } = usePayment();
  const { usdcBalance, hasMinimumBalance, isLoading, error } = paymentStatus;

  return (
    <div className="bg-white rounded-md shadow-sm p-4 mb-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">USDFC Balance</h3>
        <button
          onClick={() => refreshBalance()}
          className="text-blue-500 hover:text-blue-700 text-sm"
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="mt-2 text-red-500 text-sm">Error: {error}</div>}

      <div className="mt-3 flex items-center">
        <span className="text-2xl font-semibold">{usdcBalance}</span>
        <span className="ml-2 text-gray-500">USDFC</span>
      </div>

      {!hasMinimumBalance && (
        <div className="mt-2 text-amber-600 text-sm">
          You need at least {Constants.MINIMUM_USDFC_BALANCE} USDFC to create a
          proof set.
        </div>
      )}

      {hasMinimumBalance && (
        <div className="mt-2 text-green-600 text-sm">
          You have sufficient USDFC for creating proof sets.
        </div>
      )}
    </div>
  );
};

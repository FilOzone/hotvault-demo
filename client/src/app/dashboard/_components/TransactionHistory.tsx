import { useEffect, useState } from "react";
import { usePayment, TransactionRecord } from "@/contexts/PaymentContext";
import {
  ExternalLink,
  Check,
  AlertCircle,
  Loader,
  RotateCcw,
} from "lucide-react";
import { getExplorerUrl } from "@/lib/utils";

export const TransactionHistory = () => {
  const { transactions } = usePayment();
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);

  // Reset visible count when transactions change
  useEffect(() => {
    setVisibleCount(3);
  }, [transactions.length]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTransactionTypeLabel = (type: TransactionRecord["type"]) => {
    switch (type) {
      case "token_approval":
        return "USDFC Token Approval";
      case "deposit":
        return "USDFC Deposit";
      case "operator_approval":
        return "PDP Service Approval";
      default:
        return "Unknown Transaction";
    }
  };

  const getStatusIcon = (status: TransactionRecord["status"]) => {
    switch (status) {
      case "pending":
        return <Loader size={16} className="text-yellow-500 animate-spin" />;
      case "success":
        return <Check size={16} className="text-green-500" />;
      case "failed":
        return <AlertCircle size={16} className="text-red-500" />;
    }
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 3);
  };

  if (transactions.length === 0) {
    return null;
  }

  const visibleTransactions = isExpanded
    ? transactions.slice(0, visibleCount)
    : transactions.slice(0, 3);

  const hasMore = isExpanded && visibleCount < transactions.length;

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div
        className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-sm font-medium text-gray-700">
          Transaction History ({transactions.length})
        </h3>
        <button className="text-blue-500 text-xs font-medium">
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {isExpanded && (
        <div className="p-3">
          <div className="space-y-2">
            {visibleTransactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3 bg-gray-50 rounded border border-gray-200 text-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {getStatusIcon(tx.status)}
                    <span className="font-medium ml-2">
                      {getTransactionTypeLabel(tx.type)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(tx.timestamp)}
                  </span>
                </div>

                {tx.amount && (
                  <div className="text-xs text-gray-600 mb-1">
                    Amount: {tx.amount}
                  </div>
                )}

                {tx.txHash ? (
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-gray-600 font-mono truncate max-w-[200px]">
                      {tx.txHash.substring(0, 12)}...
                      {tx.txHash.substring(tx.txHash.length - 6)}
                    </span>
                    <a
                      href={getExplorerUrl(tx.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-500 hover:text-blue-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ) : (
                  tx.status === "pending" && (
                    <div className="text-xs text-gray-600 animate-pulse">
                      Waiting for transaction hash...
                    </div>
                  )
                )}

                {tx.status === "failed" && tx.error && (
                  <div className="mt-1 text-xs text-red-600">
                    Error: {tx.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-2 text-center">
              <button
                className="text-xs text-blue-500 flex items-center justify-center mx-auto"
                onClick={handleLoadMore}
              >
                <RotateCcw size={12} className="mr-1" />
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

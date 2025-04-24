import { useEffect, useState } from "react";
import { usePayment, TransactionRecord } from "@/contexts/PaymentContext";
import {
  ExternalLink,
  Check,
  AlertCircle,
  Loader,
  RotateCcw,
  Upload,
  Download,
  Shield,
  CheckCircle,
} from "lucide-react";
import { getExplorerUrl } from "@/lib/utils";

export const TransactionHistory = () => {
  const { transactions } = usePayment();
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    setVisibleCount(5);
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
      case "withdraw":
        return "USDFC Withdrawal";
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

  const getTransactionTypeIcon = (type: TransactionRecord["type"]) => {
    switch (type) {
      case "token_approval":
        return <CheckCircle size={16} className="text-blue-500" />;
      case "deposit":
        return <Upload size={16} className="text-green-500" />;
      case "operator_approval":
        return <Shield size={16} className="text-purple-500" />;
      case "withdraw":
        return <Download size={16} className="text-orange-500" />;
      default:
        return null;
    }
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 5);
  };

  if (transactions.length === 0) {
    return (
      <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 mr-2 text-gray-500"
            >
              <path d="M8 7h12" />
              <path d="M8 12h12" />
              <path d="M8 17h12" />
              <path d="M3 7h1" />
              <path d="M3 12h1" />
              <path d="M3 17h1" />
            </svg>
            Transaction History
          </h3>
        </div>
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">No transactions yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Transactions will appear here when you approve tokens, deposit
            funds, set allowances, or withdraw USDFC
          </p>
        </div>
      </div>
    );
  }

  const visibleTransactions = isExpanded
    ? transactions.slice(0, visibleCount)
    : transactions.slice(0, 5);

  const hasMore = isExpanded && visibleCount < transactions.length;

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      <div
        className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 mr-2 text-gray-500"
          >
            <path d="M8 7h12" />
            <path d="M8 12h12" />
            <path d="M8 17h12" />
            <path d="M3 7h1" />
            <path d="M3 12h1" />
            <path d="M3 17h1" />
          </svg>
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
                className={`p-3 rounded border ${
                  tx.status === "success"
                    ? "bg-green-50 border-green-200"
                    : tx.status === "failed"
                    ? "bg-red-50 border-red-200"
                    : "bg-gray-50 border-gray-200"
                } text-sm`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {getStatusIcon(tx.status)}
                    <div className="flex items-center ml-2">
                      <span className="mr-1">
                        {getTransactionTypeIcon(tx.type)}
                      </span>
                      <span className="font-medium">
                        {getTransactionTypeLabel(tx.type)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(tx.timestamp)}
                  </span>
                </div>

                {tx.amount && (
                  <div className="text-xs text-gray-600 mb-1 flex items-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${
                        tx.type === "deposit"
                          ? "bg-green-100 text-green-800"
                          : tx.type === "withdraw"
                          ? "bg-orange-100 text-orange-800"
                          : tx.type === "token_approval"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {tx.type === "deposit"
                        ? "Deposit"
                        : tx.type === "withdraw"
                        ? "Withdraw"
                        : tx.type === "token_approval"
                        ? "Approve"
                        : "Operator"}
                    </span>
                    {tx.type === "operator_approval" ? (
                      <span title={tx.amount}>
                        Service allowances: {tx.amount.split(",")[0].trim()}
                      </span>
                    ) : tx.type === "withdraw" ? (
                      <span>Withdrawn: {tx.amount} USDFC</span>
                    ) : (
                      <span>
                        Amount: {tx.amount}{" "}
                        {tx.type === "deposit" || tx.type === "token_approval"
                          ? "USDFC"
                          : ""}
                      </span>
                    )}
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

import { Card } from "@/components/ui/card";
import { Typography } from "@/components/ui/typography";
import {
  DollarSign,
  Lock,
  HardDrive,
  Calculator,
  ChevronDown,
  ChevronUp,
  Upload,
  InfoIcon,
} from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePayment } from "@/contexts/PaymentContext";
import * as Constants from "@/lib/constants";

interface FileInfo {
  id: number;
  filename: string;
  size: number;
}

interface CostBannerProps {
  fileSizeGB?: number;
  existingFiles?: FileInfo[];
  onSelectFile?: () => void;
}

export const CostBanner: React.FC<CostBannerProps> = ({
  fileSizeGB = 0,
  existingFiles = [],
  onSelectFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const {
    paymentStatus,
    approveToken,
    depositFunds,
    approveServiceOperator,
    refreshPaymentSetupStatus,
    initiateProofSetCreation,
  } = usePayment();

  // Use the same constants as defined in the smart contract
  const costPerGBPerMonth = Constants.STORAGE_RATE_PER_GB || 2;
  const lockPeriodDays = Constants.LOCK_PERIOD_DAYS || 10;
  const daysInMonth = 30;

  // Convert bytes to GB for calculations
  const bytesToGB = (bytes: number) => bytes / (1024 * 1024 * 1024);

  // Calculate costs using the same method as the smart contract
  const calculateMonthlyCost = (sizeGB: number) => {
    if (!sizeGB) return "0";
    // Convert to the same precision as used in the smart contract
    return (sizeGB * costPerGBPerMonth).toFixed(5);
  };

  const calculateLockedAmount = (sizeGB: number) => {
    const monthlyCost = parseFloat(calculateMonthlyCost(sizeGB));
    // Use the same calculation method as in the smart contract
    return ((monthlyCost * lockPeriodDays) / daysInMonth).toFixed(5);
  };

  const monthlyCost = calculateMonthlyCost(fileSizeGB);
  const lockedAmount = calculateLockedAmount(fileSizeGB);

  const existingFilesTotalSizeGB = existingFiles.reduce((acc, file) => {
    return acc + bytesToGB(file.size);
  }, 0);

  const existingFilesTotalMonthlyCost = calculateMonthlyCost(
    existingFilesTotalSizeGB
  );
  const existingFilesTotalLocked = calculateLockedAmount(
    existingFilesTotalSizeGB
  );

  const totalSizeGB = existingFilesTotalSizeGB + fileSizeGB;
  const totalMonthlyCost = (
    parseFloat(existingFilesTotalMonthlyCost) + parseFloat(monthlyCost)
  ).toFixed(5);


  return (
    <Card className="mb-6 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border-blue-200">
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Calculator className="w-6 h-6 text-blue-600" />
          <div>
            <Typography variant="h4" className="text-blue-900 font-semibold">
              Storage Cost Calculator
            </Typography>
            {!isExpanded && totalSizeGB > 0 && (
              <Typography variant="small" className="text-blue-700">
                Total: {formatFileSize(totalSizeGB * 1024 * 1024 * 1024)} •{" "}
                {totalMonthlyCost} USDFC/month
              </Typography>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-blue-600 hover:text-blue-800"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4 bg-white/50 border-blue-100">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-green-600 mt-1" />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-2">Base Rates</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Storage Rate:</span>
                      <span className="font-medium text-gray-900">
                        {costPerGBPerMonth} USDFC / GiB / month
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Lockup Period:</span>
                      <span className="font-medium text-gray-900">
                        {lockPeriodDays} days 
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">
                        Current FWS Balance:
                      </span>
                      <span className="font-medium text-gray-900">
                        {paymentStatus.accountFunds} USDFC
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">
                        Current Locked Funds:
                      </span>
                      <span className="font-medium text-gray-900">
                        {paymentStatus.lockedFunds.current} USDFC
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card
              className={`p-4 ${
                fileSizeGB > 0 ? "bg-blue-100/50" : "bg-white/50"
              } border-blue-100 transition-colors duration-300`}
            >
              <div className="flex items-start gap-3">
                <Upload className="w-5 h-5 text-blue-600 mt-1" />
                <div className="w-full">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Selected File{" "}
                    {fileSizeGB > 0 && (
                      <span className="text-sm font-normal text-blue-600">
                        (Not yet uploaded)
                      </span>
                    )}
                  </h3>
                  {fileSizeGB > 0 ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Size:</span>
                        <span className="font-medium text-gray-900">
                          {formatFileSize(fileSizeGB * 1024 * 1024 * 1024)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Monthly Cost:</span>
                        <span className="font-medium text-gray-900">
                          {monthlyCost} USDFC
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Required Lock:</span>
                        <span className="font-medium text-gray-900">
                          {lockedAmount} USDFC
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-500">
                        No file selected
                      </div>
                      {onSelectFile && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={onSelectFile}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Select File
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {totalSizeGB > 0 && (
            <div className="mt-6">
              <Card className="p-4 bg-gradient-to-r from-blue-100/50 to-indigo-100/50 border-blue-200">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-600 mt-1" />
                  <div className="w-full">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Total Storage Summary
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-3 bg-white/80 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">
                          Total Size
                        </div>
                        <div className="font-semibold text-gray-900">
                          {formatFileSize(totalSizeGB * 1024 * 1024 * 1024)}
                        </div>
                      </div>
                      <div className="p-3 bg-white/80 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">
                          Monthly Cost
                        </div>
                        <div className="font-semibold text-gray-900">
                          {totalMonthlyCost} USDFC
                        </div>
                      </div>
                      <div className="p-3 bg-white/80 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">
                          Total Locked
                        </div>
                        <div className="font-semibold text-blue-900">
                          {parseFloat(
                            paymentStatus.lockedFunds.current
                          ).toFixed(5)}{" "}
                          USDFC
                        </div>
                      </div>
                      <div className="p-3 bg-white/80 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">
                          Total Files
                        </div>
                        <div className="font-semibold text-blue-900">
                          {existingFiles.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div className="bg-white/70 rounded-lg border border-blue-100 p-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <InfoIcon className="w-4 h-4 text-blue-500" />
              How Costs Are Calculated
            </h3>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <span className="font-medium text-gray-700">Monthly Cost:</span>{" "}
                Each GB costs {costPerGBPerMonth} USDFC per month.
              </p>
              <p>
                <span className="font-medium text-gray-700">Lockup Amount:</span>{" "}
                {lockPeriodDays} days worth of storage costs are locked (
                {((lockPeriodDays / daysInMonth) * 100).toFixed(0)}% of monthly
                cost).
              </p>
              <p className="text-xs text-gray-500 italic">
                Example: A 5GB file costs 10 USDFC per month, with{" "}
                {((10 * lockPeriodDays) / daysInMonth).toFixed(2)} USDFC locked
                amount.
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

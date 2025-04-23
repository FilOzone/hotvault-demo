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
} from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FileInfo {
  id: number;
  filename: string;
  size: number;
}

interface CostBannerProps {
  fileSizeGB?: number;
  existingFiles?: FileInfo[];
  onSelectFile?: () => void; // Optional callback for file selection
}

export const CostBanner: React.FC<CostBannerProps> = ({
  fileSizeGB = 0,
  existingFiles = [],
  onSelectFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const costPerGBPerMonth = 2; // 2 USDFC per GB per month
  const lockPeriodDays = 10; // 10 days worth of epochs

  const calculateMonthlyCost = (sizeGB: number) => {
    return sizeGB * costPerGBPerMonth;
  };

  const calculateLockedAmount = (sizeGB: number) => {
    return (calculateMonthlyCost(sizeGB) * lockPeriodDays) / 30; // pro-rated for 10 days
  };

  const monthlyCost = calculateMonthlyCost(fileSizeGB);
  const lockedAmount = calculateLockedAmount(fileSizeGB);

  // Calculate totals for existing files
  const existingFilesTotalSizeGB = existingFiles.reduce((acc, file) => {
    return acc + file.size / (1024 * 1024 * 1024); // Convert bytes to GB
  }, 0);

  const existingFilesTotalMonthlyCost = calculateMonthlyCost(
    existingFilesTotalSizeGB
  );
  const existingFilesTotalLocked = calculateLockedAmount(
    existingFilesTotalSizeGB
  );

  // Calculate combined totals
  const totalSizeGB = existingFilesTotalSizeGB + fileSizeGB;
  const totalMonthlyCost = existingFilesTotalMonthlyCost + monthlyCost;
  const totalLockedAmount = existingFilesTotalLocked + lockedAmount;

  return (
    <Card className="mb-4 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border-blue-200">
      {/* Header - Always visible */}
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
                {totalMonthlyCost.toFixed(2)} USDFC/month
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

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-6">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Base Rates Card */}
            <Card className="p-4 bg-white/50 border-blue-100">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-green-600 mt-1" />
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Base Rates</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Storage Rate:</span>
                      <span className="font-medium text-gray-900">
                        {costPerGBPerMonth} USDFC/GB/month
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Lock Period:</span>
                      <span className="font-medium text-gray-900">
                        {lockPeriodDays} days
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Existing Files Card */}
            <Card className="p-4 bg-white/50 border-blue-100">
              <div className="flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-blue-600 mt-1" />
                <div className="w-full">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Current Storage ({existingFiles.length} files)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Size:</span>
                      <span className="font-medium text-gray-900">
                        {formatFileSize(
                          existingFilesTotalSizeGB * 1024 * 1024 * 1024
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Monthly Cost:</span>
                      <span className="font-medium text-gray-900">
                        {existingFilesTotalMonthlyCost.toFixed(2)} USDFC
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Locked Amount:</span>
                      <span className="font-medium text-gray-900">
                        {existingFilesTotalLocked.toFixed(2)} USDFC
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Selected File Card */}
            <Card
              className={`p-4 ${
                fileSizeGB > 0 ? "bg-blue-100/50" : "bg-white/50"
              } border-blue-100 transition-colors duration-300`}
            >
              <div className="flex items-start gap-3">
                <Upload className="w-5 h-5 text-blue-600 mt-1" />
                <div className="w-full">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Selected File
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
                          {monthlyCost.toFixed(2)} USDFC
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Required Lock:</span>
                        <span className="font-medium text-gray-900">
                          {lockedAmount.toFixed(2)} USDFC
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

          {/* Total Summary - Only show if there are files or a file is selected */}
          {totalSizeGB > 0 && (
            <div className="border-t border-blue-200/50 pt-4 mt-4">
              <Card className="p-4 bg-gradient-to-r from-blue-100/50 to-indigo-100/50 border-blue-200">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-600 mt-1" />
                  <div className="w-full">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Total Storage Summary
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div className="space-y-1">
                        <div className="text-gray-600">Total Size</div>
                        <div className="font-semibold text-gray-900">
                          {formatFileSize(totalSizeGB * 1024 * 1024 * 1024)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-gray-600">Monthly Cost</div>
                        <div className="font-semibold text-gray-900">
                          {totalMonthlyCost.toFixed(2)} USDFC
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-gray-600">Total Locked Amount</div>
                        <div className="font-semibold text-gray-900">
                          {totalLockedAmount.toFixed(2)} USDFC
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

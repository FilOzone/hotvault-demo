import { DASHBOARD_SECTIONS } from "@/types/dashboard";
import type { FC } from "react";

export interface TabItem {
  id: (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS];
  label: string;
  icon: FC;
}

export const TABS: TabItem[] = [
  {
    id: DASHBOARD_SECTIONS.FILES,
    label: "Files",
    icon: () => (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    id: DASHBOARD_SECTIONS.ACTIVITY,
    label: "Activity",
    icon: () => (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
];

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008/";

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const tabVariants = {
  active: { scale: 1.05, backgroundColor: "#EEF2FF" },
  inactive: { scale: 1, backgroundColor: "#ffffff" },
};

export const getStatusText = (status: string) => {
  switch (status) {
    case "starting":
      return "Starting upload...";
    case "preparing":
      return "Preparing file...";
    case "uploading":
      return "Uploading...";
    case "finalizing":
      return "Finalizing...";
    case "adding_root":
      return "Adding to proof set...";
    case "complete":
      return "Upload complete!";
    case "error":
      return "Upload failed";
    case "warning":
      return "Warning";
    case "cancelled":
      return "Upload cancelled";
    default:
      return status;
  }
};

export const statusColors = {
  error: "text-red-500 bg-red-50 border-red-200",
  warning: "text-amber-500 bg-amber-50 border-amber-200",
  complete: "text-green-500 bg-green-50 border-green-200",
  uploading: "text-blue-500 bg-blue-50 border-blue-200",
  preparing: "text-indigo-500 bg-indigo-50 border-indigo-200",
  starting: "text-gray-500 bg-gray-50 border-gray-200",
  cancelled: "text-gray-500 bg-gray-50 border-gray-200",
  finalizing: "text-emerald-500 bg-emerald-50 border-emerald-200",
  adding_root: "text-purple-500 bg-purple-50 border-purple-200",
};
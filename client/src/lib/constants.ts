import { DASHBOARD_SECTIONS } from "@/types/dashboard";
import type { FC } from "react";

export interface TabItem {
  id: (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS];
  label: string;
  icon: FC;
}

export const TABS: TabItem[] = [
  {
    id: DASHBOARD_SECTIONS.RAILS,
    label: "Upload",
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
];

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008/api/v1";

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const tabVariants = {
  active: { scale: 1.05, backgroundColor: "#EEF2FF" },
  inactive: { scale: 1, backgroundColor: "#ffffff" },
};

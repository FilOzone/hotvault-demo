import { DASHBOARD_SECTIONS } from "../types";
import { TokenIcon, RailIcon, ActivityIcon } from "../components/icons";
import type { FC } from "react";

export interface TabItem {
  id: (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS];
  label: string;
  icon: FC;
}

export const TABS: readonly TabItem[] = [
  {
    id: DASHBOARD_SECTIONS.TOKENS,
    label: "Token Allowances",
    icon: TokenIcon,
  },
  {
    id: DASHBOARD_SECTIONS.RAILS,
    label: "Payment Rails",
    icon: RailIcon,
  },
  {
    id: DASHBOARD_SECTIONS.ACTIVITY,
    label: "Recent Activity",
    icon: ActivityIcon,
  },
] as const;

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const tabVariants = {
  active: { scale: 1.05, backgroundColor: "#EEF2FF" },
  inactive: { scale: 1, backgroundColor: "#ffffff" },
};

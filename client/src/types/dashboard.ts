export interface TokenData {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  allowance: bigint;
}

export interface Rail {
  id: number;
  token: string;
  from: string;
  to: string;
  operator: string;
  arbiter: string;
  paymentRate: bigint;
  lockupPeriod: bigint;
  lockupFixed: bigint;
  settledUpTo: bigint;
  terminationEpoch: bigint;
}

export interface RailCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenData[];
  onSubmit: (
    token: string,
    recipient: string,
    arbiter: string,
    paymentRate: string,
    lockupPeriod: string,
    lockupFixed: string
  ) => Promise<void>;
}

export interface RailDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rail: Rail;
  tokens: TokenData[];
  onTerminate: (railId: string) => Promise<void>;
}

export const DASHBOARD_SECTIONS = {
  TOKENS: "tokens",
  RAILS: "rails",
  ACTIVITY: "activity",
} as const;

export type DashboardSection =
  (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS];

export const BUTTON_STYLES = {
  primary:
    "bg-blue-500 hover:bg-blue-600 text-white shadow-sm disabled:bg-blue-300",
  secondary:
    "bg-white hover:bg-gray-50 text-gray-900 border-gray-300 shadow-sm",
  danger: "bg-red-50 hover:bg-red-100 text-red-600 border-red-200 shadow-sm",
  base: "px-3 py-2 rounded-md text-sm font-medium transition-all border disabled:cursor-not-allowed flex items-center justify-center gap-2",
} as const;

export const INPUT_STYLES = {
  base: "w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm hover:border-gray-400 transition-all disabled:bg-gray-50 disabled:text-gray-500",
} as const;

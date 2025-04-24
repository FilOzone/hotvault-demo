export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (
    eventName: "accountsChanged" | "disconnect",
    handler: (accounts: string[]) => void
  ) => void;
  removeListener: (
    eventName: "accountsChanged" | "disconnect",
    handler: (accounts: string[]) => void
  ) => void;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};

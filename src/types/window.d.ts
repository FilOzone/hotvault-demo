import { EthereumProvider } from "@/contracts";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
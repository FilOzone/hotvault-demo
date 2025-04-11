import "dotenv/config";
import { Contract, JsonRpcProvider, InterfaceAbi } from "ethers";
import { formatUnits } from "ethers";

// Network Configuration for Filecoin Calibration (FEVM)
export const NETWORK = {
  name: process.env.NETWORK_NAME || "Filecoin Calibration",
  chainId: Number(process.env.NETWORK_CHAIN_ID) || 314159,
  rpcUrl:
    process.env.NETWORK_RPC_URL ||
    "https://api.calibration.node.glif.io/rpc/v1",
  blockExplorer:
    process.env.NETWORK_BLOCK_EXPLORER || "https://calibration.filfox.info/en",
  nativeCurrency: {
    name: process.env.NETWORK_CURRENCY_NAME || "Filecoin",
    symbol: process.env.NETWORK_CURRENCY_SYMBOL || "tFIL",
    decimals: Number(process.env.NETWORK_CURRENCY_DECIMALS) || 18,
  },
} as const;

// Known FEVM tokens on Calibration network
export const FEVM_TOKENS = {
  WFIL: {
    address:
      process.env.TOKEN_WFIL || "0x3bA8b5466F8624C744925D548D59c36CD829AF3D",
    name: "Mock Token",
    symbol: "MTK",
    decimals: 18,
  },
  USDC: {
    address:
      process.env.TOKEN_USDC || "0x0a3BB08b3a15A19b4De82F8932B8c844C8F66A56",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
  },
  // Add more verified tokens here
} as const;

// Contract addresses on FEVM
export const CONTRACTS = {
  PAYMENTS:
    process.env.CONTRACT_PAYMENTS ||
    "0xe06343731baf7aA1c0dB9056FAe6969D4252B8d1",
  PAYMENTS_PROXY:
    process.env.CONTRACT_PAYMENTS_PROXY ||
    "0x8e0178D1d72C6248E3bf13cD59BB1751e637F7a4",
  WFIL: process.env.TOKEN_WFIL || "0x3bA8b5466F8624C744925D548D59c36CD829AF3D",
} as const;

// ERC20 ABI for token interactions (FEVM compatible)
export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string)",
  // Add fallback functions for bytes32 returns (some FEVM tokens might use this)
  "function symbol() view returns (bytes32)",
  "function name() view returns (bytes32)",
  // WFIL specific functions
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
] as const;

// Full Payments contract ABI
export const PAYMENTS_ABI = [
  // View functions
  "function accounts(address, address) view returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)",
  "function getRail(uint256 railId) view returns (tuple(address token, address from, address to, address operator, address arbiter, uint256 paymentRate, uint256 lockupPeriod, uint256 lockupFixed, uint256 settledUpTo, uint256 terminationEpoch))",
  "function operatorApprovals(address, address, address) view returns (bool isApproved, uint256 rateAllowance, uint256 lockupAllowance, uint256 rateUsage, uint256 lockupUsage)",
  "function owner() view returns (address)",

  // State-changing functions
  "function createRail(address token, address from, address to, address arbiter) returns (uint256)",
  "function deposit(address token, address to, uint256 amount)",
  "function withdraw(address token, uint256 amount)",
  "function withdrawTo(address token, address to, uint256 amount)",
  "function modifyRailLockup(uint256 railId, uint256 period, uint256 lockupFixed)",
  "function modifyRailPayment(uint256 railId, uint256 newRate, uint256 oneTimePayment)",
  "function settleRail(uint256 railId, uint256 untilEpoch) returns (uint256 totalSettledAmount, uint256 finalSettledEpoch, string note)",
  "function settleTerminatedRailWithoutArbitration(uint256 railId) returns (uint256 totalSettledAmount, uint256 finalSettledEpoch, string note)",
  "function terminateRail(uint256 railId)",
  "function setOperatorApproval(address token, address operator, bool approved, uint256 rateAllowance, uint256 lockupAllowance)",

  // Events
  "event Initialized(uint64 version)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Upgraded(address indexed implementation)",
] as const;

// Get FEVM provider instance
export const getProvider = () => {
  return new JsonRpcProvider(NETWORK.rpcUrl);
};

// Get contract instance with provider
export const getContract = (
  address: string,
  abi: InterfaceAbi,
  provider: JsonRpcProvider
) => {
  return new Contract(address, abi, provider);
};

// Utility function to validate ERC20 contract on FEVM
export const isValidERC20 = async (contract: Contract): Promise<boolean> => {
  try {
    // Try to call basic ERC20 functions
    await Promise.all([
      contract.symbol().catch(() => null),
      contract.decimals().catch(() => null),
      contract.name().catch(() => null),
      contract.balanceOf(contract.target).catch(() => null),
    ]);
    return true;
  } catch {
    return false;
  }
};

// Check if address is a known FEVM token
export const isKnownFEVMToken = (address: string): boolean => {
  return Object.values(FEVM_TOKENS).some(
    (token) => token.address.toLowerCase() === address.toLowerCase()
  );
};

// Get token info if it's a known FEVM token
export const getKnownTokenInfo = (address: string) => {
  return Object.values(FEVM_TOKENS).find(
    (token) => token.address.toLowerCase() === address.toLowerCase()
  );
};

interface AddEthereumChainParameter {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

// Add FEVM network to MetaMask
export const addNetworkToMetaMask = async () => {
  if (!window.ethereum) throw new Error("MetaMask not installed");

  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${NETWORK.chainId.toString(16)}`,
          chainName: NETWORK.name,
          nativeCurrency: NETWORK.nativeCurrency,
          rpcUrls: [NETWORK.rpcUrl],
          blockExplorerUrls: [NETWORK.blockExplorer],
        } as AddEthereumChainParameter,
      ],
    });
  } catch (error) {
    console.error("Error adding FEVM network to MetaMask:", error);
    throw error;
  }
};

interface SwitchEthereumChainParameter {
  chainId: string;
}

// Switch to FEVM Calibration network
export const switchToFilecoinCalibration = async () => {
  if (!window.ethereum) throw new Error("MetaMask not installed");

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [
        {
          chainId: `0x${NETWORK.chainId.toString(16)}`,
        } as SwitchEthereumChainParameter,
      ],
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 4902
    ) {
      // Network not added, add it
      await addNetworkToMetaMask();
    } else {
      console.error("Error switching to FEVM network:", error);
      throw error;
    }
  }
};

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
}

// Rail data structure matching the contract's RailView struct
export interface RailData {
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

// Ethereum provider interface
interface RequestArguments {
  method: string;
  params?: unknown[];
}

export interface EthereumProvider {
  request(args: RequestArguments): Promise<unknown>;
  on(eventName: string, handler: (param: unknown) => void): void;
  removeListener(eventName: string, handler: (param: unknown) => void): void;
}

// Enhanced token discovery function
export const discoverTokens = async (
  provider: JsonRpcProvider,
  account: string
): Promise<TokenData[]> => {
  const knownTokens = Object.values(FEVM_TOKENS);
  const tokenPromises = knownTokens.map(async (token) => {
    try {
      const contract = new Contract(token.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(account);

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        balance: formatUnits(balance, token.decimals),
        decimals: token.decimals,
      } as TokenData;
    } catch (error) {
      console.warn(`Error loading token ${token.symbol}:`, error);
      return null;
    }
  });

  const tokens = await Promise.all(tokenPromises);
  return tokens.filter((token): token is TokenData => token !== null);
};

// Function to get deposited amounts for tokens
export const getDepositedAmounts = async (
  provider: JsonRpcProvider,
  account: string,
  tokens: TokenData[]
): Promise<{ [address: string]: string }> => {
  const paymentsContract = new Contract(
    CONTRACTS.PAYMENTS_PROXY,
    PAYMENTS_ABI,
    provider
  );
  const depositedAmounts: { [address: string]: string } = {};

  for (const token of tokens) {
    try {
      const { funds } = await paymentsContract.accounts(token.address, account);
      depositedAmounts[token.address] = formatUnits(funds, token.decimals);
    } catch (error) {
      console.warn(
        `Error getting deposited amount for ${token.symbol}:`,
        error
      );
      depositedAmounts[token.address] = "0";
    }
  }

  return depositedAmounts;
};

import { ethers } from "ethers";

// Simple ERC20 ABI with just the functions we need
const ERC20_ABI = [
  // Read-only functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  // Write functions
  "function approve(address spender, uint256 value) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

/**
 * Gets the balance of USDFC tokens for a specific address
 * @param provider - Ethereum provider
 * @param tokenAddress - USDFC token address
 * @param walletAddress - Wallet address to check balance for
 * @returns Balance as a formatted string with 6 decimals
 */
export async function getUSDFCBalance(
  provider: ethers.Provider,
  tokenAddress: string,
  walletAddress: string
): Promise<{
  rawBalance: bigint;
  formattedBalance: string;
  hasMinimumBalance: boolean;
}> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );

    // Get token decimals
    const decimals = await tokenContract.decimals();

    // Get raw balance
    const rawBalance = await tokenContract.balanceOf(walletAddress);

    // Format the balance with proper decimals
    const formattedBalance = ethers.formatUnits(rawBalance, decimals);

    // Check if balance meets minimum requirement (10 USDFC)
    const minimumBalance = ethers.parseUnits("10", decimals);
    const hasMinimumBalance = rawBalance >= minimumBalance;

    return {
      rawBalance,
      formattedBalance,
      hasMinimumBalance,
    };
  } catch (error) {
    console.error("Error getting USDFC balance:", error);
    throw error;
  }
}

/**
 * Approves the Payment contract to spend USDFC tokens
 * @param signer - Connected wallet signer
 * @param tokenAddress - USDFC token address
 * @param spenderAddress - Payment contract address
 * @param amount - Amount to approve (in USDFC)
 * @returns Transaction response
 */
export async function approveUSDFCSpending(
  signer: ethers.Signer,
  tokenAddress: string,
  spenderAddress: string,
  amount: string
) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const decimals = await tokenContract.decimals();

    // Convert amount to token units with proper decimals
    const amountInWei = ethers.parseUnits(amount, decimals);

    // Send approval transaction
    const tx = await tokenContract.approve(spenderAddress, amountInWei);
    return await tx.wait();
  } catch (error) {
    console.error("Error approving USDFC spending:", error);
    throw error;
  }
}

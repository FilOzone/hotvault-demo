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
    // Wait for transaction to be mined
    const receipt = await tx.wait();

    // Return transaction details including hash
    return {
      hash: tx.hash,
      receipt,
    };
  } catch (error) {
    console.error("Error approving USDFC spending:", error);
    throw error;
  }
}

// Payments contract ABI with just the functions we need
const PAYMENTS_ABI = [
  // Read-only functions
  "function accounts(address token, address owner) view returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)",
  "function operatorApprovals(address token, address client, address operator) view returns (bool isApproved, uint256 rateAllowance, uint256 lockupAllowance, uint256 rateUsage, uint256 lockupUsage)",
  // Write functions
  "function deposit(address token, address to, uint256 amount)",
  "function setOperatorApproval(address token, address operator, bool approved, uint256 rateAllowance, uint256 lockupAllowance)",
];

/**
 * Deposits USDFC tokens into the Payments contract
 * @param signer - Connected wallet signer
 * @param paymentsAddress - Payments contract address
 * @param tokenAddress - USDFC token address
 * @param amount - Amount to deposit (in USDFC)
 * @returns Transaction response
 */
export async function depositUSDFC(
  signer: ethers.Signer,
  paymentsAddress: string,
  tokenAddress: string,
  amount: string
) {
  try {
    const paymentsContract = new ethers.Contract(
      paymentsAddress,
      PAYMENTS_ABI,
      signer
    );

    // Get the signer's address
    const signerAddress = await signer.getAddress();

    // Get token decimals to convert amount
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const decimals = await tokenContract.decimals();

    // Convert amount to token units with proper decimals
    const amountInWei = ethers.parseUnits(amount, decimals);

    // Send deposit transaction - deposit to self
    const tx = await paymentsContract.deposit(
      tokenAddress,
      signerAddress,
      amountInWei
    );

    // Wait for transaction to be mined
    const receipt = await tx.wait();

    // Return transaction details including hash
    return {
      hash: tx.hash,
      receipt,
    };
  } catch (error) {
    console.error("Error depositing USDFC:", error);
    throw error;
  }
}

/**
 * Approve the PDP Service as an operator in the Payments contract
 * @param signer - Connected wallet signer
 * @param paymentsAddress - Payments contract address
 * @param tokenAddress - USDFC token address
 * @param operatorAddress - PDP Service operator address
 * @param rateAllowance - Maximum rate allowance (in USDFC)
 * @param lockupAllowance - Maximum lockup allowance (in USDFC)
 * @returns Transaction response
 */
export async function approveOperator(
  signer: ethers.Signer,
  paymentsAddress: string,
  tokenAddress: string,
  operatorAddress: string,
  rateAllowance: string,
  lockupAllowance: string
) {
  try {
    const paymentsContract = new ethers.Contract(
      paymentsAddress,
      PAYMENTS_ABI,
      signer
    );

    // Get token decimals to convert amount
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const decimals = await tokenContract.decimals();

    // Convert amounts to token units with proper decimals
    const rateInWei = ethers.parseUnits(rateAllowance, decimals);
    const lockupInWei = ethers.parseUnits(lockupAllowance, decimals);

    // Send approval transaction
    const tx = await paymentsContract.setOperatorApproval(
      tokenAddress,
      operatorAddress,
      true, // approved
      rateInWei,
      lockupInWei
    );

    // Wait for transaction to be mined
    const receipt = await tx.wait();

    // Return transaction details including hash
    return {
      hash: tx.hash,
      receipt,
    };
  } catch (error) {
    console.error("Error approving operator:", error);
    throw error;
  }
}

/**
 * Gets the account status from the Payments contract
 * @param provider - Ethereum provider
 * @param paymentsAddress - Payments contract address
 * @param tokenAddress - USDFC token address
 * @param walletAddress - Wallet address to check
 * @returns Account status with fund values
 */
export async function getAccountStatus(
  provider: ethers.Provider,
  paymentsAddress: string,
  tokenAddress: string,
  walletAddress: string
) {
  try {
    const paymentsContract = new ethers.Contract(
      paymentsAddress,
      PAYMENTS_ABI,
      provider
    );

    // Get token decimals
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
    const decimals = await tokenContract.decimals();

    // Get account details from the payments contract
    const account = await paymentsContract.accounts(
      tokenAddress,
      walletAddress
    );

    return {
      funds: ethers.formatUnits(account.funds, decimals),
      lockupCurrent: ethers.formatUnits(account.lockupCurrent, decimals),
      lockupRate: ethers.formatUnits(account.lockupRate, decimals),
      lockupLastSettledAt: account.lockupLastSettledAt.toString(),
    };
  } catch (error) {
    console.error("Error getting account status:", error);
    throw error;
  }
}

/**
 * Gets the operator approval status from the Payments contract
 * @param provider - Ethereum provider
 * @param paymentsAddress - Payments contract address
 * @param tokenAddress - USDFC token address
 * @param walletAddress - Wallet address (client)
 * @param operatorAddress - Operator address to check
 * @returns Operator approval status
 */
export async function getOperatorApproval(
  provider: ethers.Provider,
  paymentsAddress: string,
  tokenAddress: string,
  walletAddress: string,
  operatorAddress: string
) {
  try {
    const paymentsContract = new ethers.Contract(
      paymentsAddress,
      PAYMENTS_ABI,
      provider
    );

    // Get token decimals
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
    const decimals = await tokenContract.decimals();

    // Get operator approval details
    const approval = await paymentsContract.operatorApprovals(
      tokenAddress,
      walletAddress,
      operatorAddress
    );

    return {
      isApproved: approval.isApproved,
      rateAllowance: ethers.formatUnits(approval.rateAllowance, decimals),
      lockupAllowance: ethers.formatUnits(approval.lockupAllowance, decimals),
      rateUsage: ethers.formatUnits(approval.rateUsage, decimals),
      lockupUsage: ethers.formatUnits(approval.lockupUsage, decimals),
    };
  } catch (error) {
    console.error("Error getting operator approval:", error);
    throw error;
  }
}

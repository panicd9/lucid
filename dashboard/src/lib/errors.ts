/**
 * Human-readable error mapping for Lucid program custom errors.
 * Error codes match programs/lucid/src/state/errors.rs
 */

interface LucidError {
  message: string;
  recovery: string;
}

const LUCID_ERRORS: Record<number, LucidError> = {
  100: {
    message: 'This intent has been deactivated.',
    recovery: 'Choose a different intent or ask a wallet admin to reactivate it.',
  },
  101: {
    message: 'This wallet is frozen \u2014 new intents cannot be added.',
    recovery: 'Use an existing intent or create a new wallet.',
  },
  102: {
    message: 'Proposal index mismatch \u2014 another proposal was created first.',
    recovery: 'Close this modal and try again. The index will refresh automatically.',
  },
  103: {
    message: 'This proposal is no longer active.',
    recovery: 'It may have been cancelled or already executed. Refresh the page to see the current status.',
  },
  104: {
    message: 'You have already approved this proposal.',
    recovery: 'No action needed \u2014 your approval is recorded.',
  },
  105: {
    message: 'You have already cancelled this proposal.',
    recovery: 'If you changed your mind, approve the proposal to reverse your cancellation.',
  },
  106: {
    message: 'This proposal has not reached the approval threshold yet.',
    recovery: 'Wait for more approvers to sign before executing.',
  },
  107: {
    message: 'Timelock has not elapsed yet.',
    recovery: 'Wait for the timelock countdown to finish, then try executing again.',
  },
  108: {
    message: 'Signed message does not match on-chain state.',
    recovery: 'The proposal parameters or wallet state may have changed. Refresh and sign again.',
  },
  109: {
    message: 'Your wallet is not an authorized signer for this intent.',
    recovery: 'Connect a wallet that is listed as a proposer or approver.',
  },
  110: {
    message: 'Account mismatch \u2014 resolved accounts do not match expected addresses.',
    recovery: 'Refresh the page and try again. On-chain state may have changed.',
  },
  111: {
    message: 'Parameter constraint violated.',
    recovery: 'Check the parameter limits on this intent and adjust your values.',
  },
  112: {
    message: 'Invalid Ed25519 signature instruction.',
    recovery: 'Ensure your wallet supports signMessage. Try reconnecting your wallet.',
  },
  113: {
    message: 'Signature has expired.',
    recovery: 'Sign again with a longer expiry window.',
  },
  114: {
    message: 'Wallet name is too long (max 32 characters).',
    recovery: 'Choose a shorter name for the wallet.',
  },
  115: {
    message: 'At least one signer is required.',
    recovery: 'Add at least one proposer and one approver.',
  },
  116: {
    message: 'Invalid threshold value.',
    recovery: 'Threshold must be between 1 and the number of signers.',
  },
  117: {
    message: 'Wallet is not frozen.',
    recovery: 'This operation requires a frozen wallet.',
  },
  118: {
    message: 'Cannot modify this intent \u2014 it has active proposals.',
    recovery: 'Wait for active proposals to be executed, cancelled, or cleaned up first.',
  },
  119: {
    message: 'Wallet is already frozen.',
    recovery: 'No action needed \u2014 the wallet is already frozen.',
  },
  120: {
    message: 'Batch too large (max 10 intents per transaction).',
    recovery: 'Split your intents into smaller batches.',
  },
  121: {
    message: 'This intent is already active.',
    recovery: 'No action needed.',
  },
  122: {
    message: 'Invalid intent type.',
    recovery: 'Check the intent definition format.',
  },
  123: {
    message: 'Proposal has expired.',
    recovery: 'Create a new proposal \u2014 this one can no longer be acted on.',
  },
  124: {
    message: 'Invalid offchain message header.',
    recovery: 'Ensure your wallet supports Solana offchain message signing (V0 format).',
  },
  125: {
    message: 'Arithmetic overflow in computation.',
    recovery: 'Check parameter values for extremely large numbers.',
  },
  126: {
    message: 'This operation is only allowed during setup (before wallet is frozen).',
    recovery: 'Freeze the wallet after adding all intents.',
  },
  127: {
    message: 'PDA derivation recursion depth exceeded.',
    recovery: 'Simplify the intent account structure.',
  },
  128: {
    message: 'Program ID mismatch in CPI accounts.',
    recovery: 'Verify the intent definition targets the correct program.',
  },
  129: {
    message: 'Too many signers (max 16).',
    recovery: 'Reduce the number of proposers or approvers.',
  },
};

/**
 * Extract a custom error code from a Solana transaction error message.
 * Matches patterns like "custom program error: 0x6c" or "Custom(108)".
 */
function extractErrorCode(errorMsg: string): number | null {
  // Match hex: "custom program error: 0x6c"
  const hexMatch = errorMsg.match(/custom program error:\s*0x([0-9a-fA-F]+)/i);
  if (hexMatch) return parseInt(hexMatch[1], 16);

  // Match decimal: "Custom(108)"
  const decMatch = errorMsg.match(/Custom\((\d+)\)/);
  if (decMatch) return parseInt(decMatch[1], 10);

  // Match "Error Code: 108"
  const codeMatch = errorMsg.match(/Error Code:\s*(\d+)/i);
  if (codeMatch) return parseInt(codeMatch[1], 10);

  return null;
}

/**
 * Parse a raw error into a human-readable message + recovery suggestion.
 * Falls back gracefully for non-Lucid errors.
 */
export function parseTransactionError(err: unknown): LucidError {
  const raw = err instanceof Error ? err.message : String(err);

  // Check for user rejection
  if (raw.includes('User rejected') || raw.includes('user rejected') || raw.includes('Approval Denied')) {
    return { message: 'Transaction was rejected.', recovery: 'Sign the message when prompted to continue.' };
  }

  // Check for Ledger-specific errors
  if (raw.includes('TransportOpenUserCancelled') || raw.includes('No device selected')) {
    return { message: 'Ledger device not connected.', recovery: 'Plug in your Ledger, unlock it, and open the Solana app.' };
  }
  if (raw.includes('0x6985') || raw.includes('Conditions not satisfied')) {
    return { message: 'Signing rejected on Ledger.', recovery: 'Approve the message on your Ledger device to continue.' };
  }
  if (raw.includes('0x6a80') || raw.includes('blind signing')) {
    return { message: 'Ledger requires blind signing to be enabled.', recovery: 'Enable blind signing in the Solana app settings on your Ledger.' };
  }

  // Check for known Lucid program errors
  const code = extractErrorCode(raw);
  if (code !== null && LUCID_ERRORS[code]) {
    return LUCID_ERRORS[code];
  }

  // Check for common Solana errors
  if (raw.includes('Blockhash not found') || raw.includes('blockhash')) {
    return { message: 'Transaction expired before confirmation.', recovery: 'Try again \u2014 blockhash was too old.' };
  }
  if (raw.includes('insufficient funds') || raw.includes('Insufficient')) {
    return { message: 'Insufficient SOL for transaction fees.', recovery: 'Add SOL to your wallet to cover the transaction fee.' };
  }
  if (raw.includes('AccountNotFound') || raw.includes('Account does not exist')) {
    return { message: 'Required account not found on-chain.', recovery: 'The wallet or proposal may not exist yet. Verify the address and try again.' };
  }

  // Fallback: truncate raw message
  const truncated = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
  return { message: truncated, recovery: 'Check the browser console for details and try again.' };
}

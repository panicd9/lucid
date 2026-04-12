import type { AnchorInstruction } from '../types.js';
import type { RiskLevel } from '../types.js';

const CRITICAL_NAME_PATTERNS = /admin|authority|owner|upgrade|freeze_program|close_program/i;
const CRITICAL_ARG_PATTERNS = /^(new_admin|new_authority|new_owner)$/i;

const HIGH_NAME_PATTERNS = /withdraw|transfer|mint|burn|oracle|fee/i;
const HIGH_VAULT_ACCOUNT_PATTERNS = /vault|treasury/i;

const MEDIUM_NAME_PATTERNS = /^(add|remove|update|set|config)/i;

/**
 * Classify the risk level of an instruction based on its name, args, and accounts.
 */
export function classifyRisk(ix: AnchorInstruction): RiskLevel {
  // CRITICAL checks
  if (CRITICAL_NAME_PATTERNS.test(ix.name)) {
    return 'critical';
  }
  if (ix.args.some((a) => CRITICAL_ARG_PATTERNS.test(a.name))) {
    return 'critical';
  }

  // HIGH checks
  if (HIGH_NAME_PATTERNS.test(ix.name)) {
    return 'high';
  }
  // amount: u64 arg + vault/treasury account
  const hasAmountU64 = ix.args.some(
    (a) => a.name === 'amount' && resolveArgType(a.type) === 'u64'
  );
  const hasVaultAccount = ix.accounts.some((acc) =>
    HIGH_VAULT_ACCOUNT_PATTERNS.test(acc.name)
  );
  if (hasAmountU64 && hasVaultAccount) {
    return 'high';
  }

  // MEDIUM checks
  if (MEDIUM_NAME_PATTERNS.test(ix.name)) {
    return 'medium';
  }

  // LOW: everything else
  return 'low';
}

/**
 * Default timelock in seconds based on risk level.
 */
export function defaultTimelock(risk: RiskLevel): number {
  switch (risk) {
    case 'critical':
      return 86400; // 24h
    case 'high':
      return 3600; // 1h
    case 'medium':
      return 0;
    case 'low':
      return 0;
  }
}

function resolveArgType(type: string | Record<string, any>): string {
  if (typeof type === 'string') return type;
  return 'complex';
}

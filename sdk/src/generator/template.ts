import type { AnchorInstruction } from '../types.js';

/** Convert snake_case to space-separated words */
function snakeToWords(s: string): string {
  return s.replace(/_/g, ' ');
}

/** Pattern-based heuristic templates for common instruction shapes */
interface TemplatePattern {
  test: (ix: AnchorInstruction) => boolean;
  generate: (ix: AnchorInstruction) => string;
}

const PATTERNS: TemplatePattern[] = [
  // update_admin(new_admin: Pubkey) -> "change admin authority to {new_admin}"
  {
    test: (ix) =>
      /^(update|set|change)_?(admin|authority|owner)$/i.test(ix.name) &&
      ix.args.length >= 1 &&
      /admin|authority|owner/i.test(ix.args[0].name),
    generate: (ix) => `change admin authority to {${ix.args[0].name}}`,
  },
  // withdraw(amount, recipient) -> "withdraw {amount} to {recipient}"
  {
    test: (ix) =>
      /withdraw/i.test(ix.name) &&
      ix.args.some((a) => a.name === 'amount') &&
      ix.args.some((a) => /recipient|destination|to/i.test(a.name)),
    generate: (ix) => {
      const recipientArg = ix.args.find((a) => /recipient|destination|to/i.test(a.name));
      return `withdraw {amount} to {${recipientArg!.name}}`;
    },
  },
  // withdraw(amount) -> "withdraw {amount}"
  {
    test: (ix) =>
      /withdraw/i.test(ix.name) &&
      ix.args.some((a) => a.name === 'amount'),
    generate: (_ix) => `withdraw {amount}`,
  },
  // transfer(amount, ...) -> "transfer {amount}"
  {
    test: (ix) =>
      /transfer/i.test(ix.name) &&
      ix.args.some((a) => a.name === 'amount'),
    generate: (_ix) => `transfer {amount}`,
  },
  // set_paused(paused: bool) -> "set paused to {paused}"
  {
    test: (ix) =>
      /^set_/i.test(ix.name) &&
      ix.args.length === 1,
    generate: (ix) => {
      const words = snakeToWords(ix.name);
      return `${words} to {${ix.args[0].name}}`;
    },
  },
  // add_market(market_index, oracle) -> "add market {market_index} with oracle {oracle}"
  {
    test: (ix) =>
      /^add_/i.test(ix.name) &&
      ix.args.length >= 2 &&
      ix.args.some((a) => /oracle/i.test(a.name)),
    generate: (ix) => {
      const indexArg = ix.args.find((a) => /index/i.test(a.name));
      const oracleArg = ix.args.find((a) => /oracle/i.test(a.name));
      if (indexArg && oracleArg) {
        return `add market {${indexArg.name}} with oracle {${oracleArg.name}}`;
      }
      // fallback for add with oracle
      return `${snakeToWords(ix.name)} with oracle {${oracleArg!.name}}`;
    },
  },
];

/**
 * Generate a human-readable template string from an Anchor instruction.
 * Uses heuristic patterns for common shapes, falls back to listing all args.
 */
export function generateTemplate(ix: AnchorInstruction): string {
  // Try each pattern
  for (const pattern of PATTERNS) {
    if (pattern.test(ix)) {
      return pattern.generate(ix);
    }
  }

  // Fallback: "instruction name: {arg1}, {arg2}"
  const words = snakeToWords(ix.name);
  if (ix.args.length === 0) {
    return words;
  }
  const argList = ix.args.map((a) => `{${a.name}}`).join(', ');
  return `${words}: ${argList}`;
}

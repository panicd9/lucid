/**
 * Parameter encoding/decoding for Lucid intent proposals.
 *
 * Matches on-chain format in programs/lucid/src/state/message.rs and
 * CLI format in cli/src/commands/propose.rs / approve.rs.
 */
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  PARAM_TYPE_ADDRESS,
  PARAM_TYPE_U64,
  PARAM_TYPE_I64,
  PARAM_TYPE_STRING,
  PARAM_TYPE_BOOL,
  PARAM_TYPE_U8,
  PARAM_TYPE_U16,
  PARAM_TYPE_U32,
  PARAM_TYPE_U128,
} from './constants';
import type { ParamEntry } from './deserialize';

/** Format a bigint with display_decimals scaling (e.g., 1500000000n with decimals=9 → "1.5"). */
function formatWithDecimals(val: bigint, decimals: number): string {
  if (decimals === 0) return val.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = val / divisor;
  const frac = val % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/** Byte size for a fixed-size param type. Returns 0 for variable-length (string). */
export function paramTypeSize(paramType: number): number {
  switch (paramType) {
    case PARAM_TYPE_ADDRESS:
      return 32;
    case PARAM_TYPE_U64:
    case PARAM_TYPE_I64:
      return 8;
    case PARAM_TYPE_STRING:
      return 0; // variable
    case PARAM_TYPE_BOOL:
    case PARAM_TYPE_U8:
      return 1;
    case PARAM_TYPE_U16:
      return 2;
    case PARAM_TYPE_U32:
      return 4;
    case PARAM_TYPE_U128:
      return 16;
    default:
      return 0;
  }
}

/**
 * Decode raw params_data bytes into an array of display strings.
 * Index-aligned with the intent's params array.
 */
export function decodeParamsData(
  paramsData: Uint8Array,
  intentParams: ParamEntry[]
): string[] {
  const values: string[] = [];
  let offset = 0;
  const view = new DataView(
    paramsData.buffer,
    paramsData.byteOffset,
    paramsData.byteLength
  );

  for (const param of intentParams) {
    switch (param.paramType) {
      case PARAM_TYPE_ADDRESS: {
        const bytes = paramsData.slice(offset, offset + 32);
        values.push(bs58.encode(bytes));
        offset += 32;
        break;
      }
      case PARAM_TYPE_U64: {
        const val = view.getBigUint64(offset, true);
        values.push(formatWithDecimals(val, param.displayDecimals));
        offset += 8;
        break;
      }
      case PARAM_TYPE_I64: {
        const val = view.getBigInt64(offset, true);
        values.push(val.toString());
        offset += 8;
        break;
      }
      case PARAM_TYPE_STRING: {
        const len = view.getUint16(offset, true);
        offset += 2;
        const strBytes = paramsData.slice(offset, offset + len);
        values.push(new TextDecoder().decode(strBytes));
        offset += len;
        break;
      }
      case PARAM_TYPE_BOOL: {
        values.push(paramsData[offset] !== 0 ? 'true' : 'false');
        offset += 1;
        break;
      }
      case PARAM_TYPE_U8: {
        values.push(paramsData[offset].toString());
        offset += 1;
        break;
      }
      case PARAM_TYPE_U16: {
        values.push(view.getUint16(offset, true).toString());
        offset += 2;
        break;
      }
      case PARAM_TYPE_U32: {
        values.push(view.getUint32(offset, true).toString());
        offset += 4;
        break;
      }
      case PARAM_TYPE_U128: {
        // Read as two u64s (little-endian)
        const lo = view.getBigUint64(offset, true);
        const hi = view.getBigUint64(offset + 8, true);
        const val = (hi << 64n) | lo;
        values.push(val.toString());
        offset += 16;
        break;
      }
      default:
        values.push('<unknown>');
        break;
    }
  }

  return values;
}

/**
 * Encode user-provided string values into binary params_data.
 * Index-aligned with the intent's params array.
 */
export function encodeParamsData(
  values: string[],
  intentParams: ParamEntry[]
): Uint8Array {
  const parts: Uint8Array[] = [];

  for (let i = 0; i < intentParams.length; i++) {
    const param = intentParams[i];
    const val = values[i] ?? '';

    switch (param.paramType) {
      case PARAM_TYPE_ADDRESS: {
        const pk = new PublicKey(val);
        parts.push(pk.toBytes());
        break;
      }
      case PARAM_TYPE_U64: {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setBigUint64(0, BigInt(val), true);
        parts.push(new Uint8Array(buf));
        break;
      }
      case PARAM_TYPE_I64: {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setBigInt64(0, BigInt(val), true);
        parts.push(new Uint8Array(buf));
        break;
      }
      case PARAM_TYPE_STRING: {
        const strBytes = new TextEncoder().encode(val);
        const lenBuf = new ArrayBuffer(2);
        new DataView(lenBuf).setUint16(0, strBytes.length, true);
        parts.push(new Uint8Array(lenBuf));
        parts.push(strBytes);
        break;
      }
      case PARAM_TYPE_BOOL: {
        parts.push(new Uint8Array([val === 'true' ? 1 : 0]));
        break;
      }
      case PARAM_TYPE_U8: {
        parts.push(new Uint8Array([parseInt(val, 10)]));
        break;
      }
      case PARAM_TYPE_U16: {
        const buf = new ArrayBuffer(2);
        new DataView(buf).setUint16(0, parseInt(val, 10), true);
        parts.push(new Uint8Array(buf));
        break;
      }
      case PARAM_TYPE_U32: {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, parseInt(val, 10), true);
        parts.push(new Uint8Array(buf));
        break;
      }
      case PARAM_TYPE_U128: {
        const n = BigInt(val);
        const buf = new ArrayBuffer(16);
        const dv = new DataView(buf);
        dv.setBigUint64(0, n & 0xFFFFFFFFFFFFFFFFn, true);
        dv.setBigUint64(8, n >> 64n, true);
        parts.push(new Uint8Array(buf));
        break;
      }
    }
  }

  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

/**
 * Render an intent template by replacing both positional ({0}, {1})
 * and named ({amount}, {to}) placeholders with decoded param values.
 */
export function renderTemplate(
  template: string,
  decodedValues: string[],
  intentParams?: ParamEntry[]
): string {
  let result = template;
  for (let i = 0; i < decodedValues.length; i++) {
    result = result.replaceAll(`{${i}}`, decodedValues[i]);
    if (intentParams && intentParams[i]?.name) {
      result = result.replaceAll(`{${intentParams[i].name}}`, decodedValues[i]);
    }
  }
  return result;
}

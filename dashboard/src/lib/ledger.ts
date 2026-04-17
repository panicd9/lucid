/**
 * Direct Ledger communication via WebHID.
 *
 * The Ledger Solana app v1.12+ requires the V0 off-chain message format
 * (with appDomain + signer pubkey), not the legacy format. The old
 * @ledgerhq/hw-app-solana library only sends legacy format, so we build
 * the V0 envelope and send the APDU ourselves.
 *
 * IMPORTANT: TransportWebHID.create() must be called in a user-gesture
 * context (e.g. a click handler).
 */
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import type Transport from '@ledgerhq/hw-transport';
import Solana from '@ledgerhq/hw-app-solana';
import bs58 from 'bs58';
import { OFFCHAIN_HEADER_LEN_LEGACY, buildV0Envelope } from './message';

const MAX_ACCOUNT_SCAN = 10;
const LEDGER_CLA = 0xe0;
const INS_SIGN_OFFCHAIN = 0x07;
const P1_CONFIRM = 0x01;
const P2_INIT = 0x00;
const P2_EXTEND = 0x01;
const P2_MORE = 0x02;
const MAX_PAYLOAD = 255;

function derivationPath(accountIndex: number): string {
  return `44'/501'/${accountIndex}'`;
}

/** Build BIP32 path buffer: [pathLen, ...components(4 bytes BE each)] */
function buildPathBuffer(path: string): Buffer {
  const parts = path.split('/').map((p) => {
    const hardened = p.endsWith("'");
    const num = parseInt(hardened ? p.slice(0, -1) : p, 10);
    return hardened ? (num | 0x80000000) >>> 0 : num;
  });
  const buf = Buffer.alloc(1 + parts.length * 4);
  buf.writeUInt8(parts.length, 0);
  parts.forEach((n, i) => buf.writeUInt32BE(n, 1 + i * 4));
  return buf;
}

/** Send APDU with chunking (same protocol as the Ledger SDK). */
async function sendChunked(
  transport: Transport,
  ins: number,
  p1: number,
  payload: Buffer
): Promise<Buffer> {
  let offset = 0;
  let p2 = P2_INIT;

  while (payload.length - offset > MAX_PAYLOAD) {
    const chunk = payload.subarray(offset, offset + MAX_PAYLOAD);
    offset += MAX_PAYLOAD;
    await transport.send(LEDGER_CLA, ins, p1, p2 | P2_MORE, chunk);
    p2 |= P2_EXTEND;
  }

  const lastChunk = payload.subarray(offset);
  return transport.send(LEDGER_CLA, ins, p1, p2, lastChunk);
}

export async function signWithLedger(
  legacyEnvelope: Uint8Array,
  expectedAddress: string
): Promise<{ signature: Uint8Array; publicKey: Uint8Array; v0Envelope: Uint8Array }> {
  const transport = await TransportWebHID.create();
  try {
    const solana = new Solana(transport);

    const config = await solana.getAppConfiguration();
    console.log('[Ledger] Solana app version:', config.version, 'blindSigning:', config.blindSigningEnabled);

    // Find derivation path
    let matchedPath: string | null = null;
    let pubkeyBytes: Uint8Array | null = null;

    for (let i = 0; i < MAX_ACCOUNT_SCAN; i++) {
      const path = derivationPath(i);
      const result = await solana.getAddress(path, false);
      const addr = bs58.encode(result.address);
      if (addr === expectedAddress) {
        matchedPath = path;
        pubkeyBytes = new Uint8Array(result.address);
        break;
      }
    }

    if (!matchedPath || !pubkeyBytes) {
      throw new Error(
        `Could not find Ledger derivation path for ${expectedAddress}. ` +
        `Scanned accounts 0-${MAX_ACCOUNT_SCAN - 1}. Make sure the Solana app is open.`
      );
    }

    const body = legacyEnvelope.slice(OFFCHAIN_HEADER_LEN_LEGACY);

    // Build V0 envelope (what Ledger app v1.12+ expects)
    const v0Envelope = buildV0Envelope(body, pubkeyBytes);

    // Build APDU payload: [1(numSigners), pathBuffer, v0Envelope]
    const pathBuf = buildPathBuffer(matchedPath);
    const numSigners = Buffer.from([1]);
    const payload = Buffer.concat([numSigners, pathBuf, Buffer.from(v0Envelope)]);

    console.log('[Ledger] V0 envelope:', v0Envelope.length, 'bytes | APDU payload:', payload.length, 'bytes');
    console.log('[Ledger] Path:', matchedPath, '| Body:', body.length, 'bytes');

    // Send via INS 0x07 with chunking
    const response = await sendChunked(transport, INS_SIGN_OFFCHAIN, P1_CONFIRM, payload);

    // Last 2 bytes are status word
    const sw = response.readUInt16BE(response.length - 2);
    console.log('[Ledger] Response status: 0x' + sw.toString(16));

    if (sw !== 0x9000) {
      throw new Error(`Ledger returned 0x${sw.toString(16)}`);
    }

    const signature = response.subarray(0, response.length - 2);
    console.log('[Ledger] Signature:', signature.length, 'bytes');

    return {
      signature: new Uint8Array(signature),
      publicKey: pubkeyBytes,
      v0Envelope,
    };
  } finally {
    await transport.close().catch(() => {});
  }
}

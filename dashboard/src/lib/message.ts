/**
 * Off-chain message building for Lucid — sRFC 38 v1 (Anza, Dec 2025).
 *
 * Body format (must produce byte-for-byte identical output to on-chain
 * build_message in programs/lucid/src/state/message.rs):
 *
 *   {action} {rendered_template} | wallet: {name} ({pda_b58}); proposal: #{index}; expires: {DD Mon YYYY HH:MM:SS}
 *
 * The wallet PDA in base58 prevents cross-wallet signature replay between two
 * wallets that share a name.
 *
 * sRFC 38 v1 envelope (single-signer, 50-byte header):
 *   0..16  : "\xffsolana offchain"
 *   16     : version = 0x01
 *   17     : numSigners = 0x01
 *   18..50 : signer pubkey (32 bytes)
 *   50..end: UTF-8 body (no length prefix, trailing variable-length)
 *
 * The envelope-embedded signer pubkey provides a complementary binding to the
 * wallet-PDA-in-body for defense-in-depth replay protection.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Build the human-readable message body. */
export function buildMessageBody(
  action: string,
  rendered: string,
  walletName: string,
  walletPdaB58: string,
  proposalIndex: bigint | number | string,
  expiryStr: string
): string {
  return `${action} ${rendered} | wallet: ${walletName} (${walletPdaB58}); proposal: #${proposalIndex}; expires: ${expiryStr}`;
}

/** sRFC 38 v1 single-signer envelope: prefix(16) + version(1) + numSigners(1) + pubkey(32) = 50 bytes. */
export const OFFCHAIN_HEADER_LEN_V1 = 50;
/** V0 envelope: prefix(16) + version(0) + appDomain(32) + format(1) + numSigners(1) + pubkey(32) + length(2) = 85 bytes. */
export const OFFCHAIN_HEADER_LEN_V0 = 85;

/** Module-level constants — encoded once, reused across every envelope build. */
const PREFIX_BYTES = new TextEncoder().encode('solana offchain'); // 15 bytes
/** 32-byte appDomain whose base58 reads "Luc1dMu1t1s1g111...111". */
const V0_APP_DOMAIN = new Uint8Array([
  0x05, 0x19, 0x83, 0xb5, 0xba, 0xd3, 0x97, 0x02, 0x71, 0x2c, 0x2d, 0xef, 0x47, 0xbf, 0x2c, 0xdc,
  0x4c, 0x48, 0xfd, 0x4e, 0x1f, 0xd3, 0xf7, 0x56, 0x9d, 0x37, 0x78, 0x79, 0xc0, 0x00, 0x00, 0x00,
]);

/** Write the 16-byte "\xffsolana offchain" prefix to `buf` at offset 0. */
function writePrefix(buf: Uint8Array): void {
  buf[0] = 0xff;
  buf.set(PREFIX_BYTES, 1);
}

function requireSignerPubkey(signerPubkey: Uint8Array): void {
  if (signerPubkey.length !== 32) {
    throw new Error(`signerPubkey must be 32 bytes, got ${signerPubkey.length}`);
  }
}

/**
 * Wrap a body in a sRFC 38 v1 single-signer offchain message envelope.
 *
 * The on-chain reader accepts v1, but the released Ledger Solana app
 * (v1.12.x) does not support v1 yet — for Ledger signing use buildV0Envelope.
 */
export function buildV1Envelope(body: Uint8Array, signerPubkey: Uint8Array): Uint8Array {
  requireSignerPubkey(signerPubkey);
  const buf = new Uint8Array(OFFCHAIN_HEADER_LEN_V1 + body.length);
  writePrefix(buf);
  buf[16] = 0x01; // version
  buf[17] = 0x01; // numSigners
  buf.set(signerPubkey, 18);
  buf.set(body, OFFCHAIN_HEADER_LEN_V1);
  return buf;
}

/**
 * Wrap a body in a V0 offchain message envelope. The released Ledger Solana
 * app (v1.12.x) signs this format; the on-chain reader accepts V0 alongside
 * v1 until Ledger ships sRFC 38 support.
 *
 * Layout:
 *   0..16  : "\xffsolana offchain"
 *   16     : version = 0x00
 *   17..49 : application domain (32 bytes)
 *   49     : format = 0x00 (ASCII)
 *   50     : numSigners = 0x01
 *   51..83 : signer pubkey (32 bytes)
 *   83..85 : body length (u16 LE)
 *   85..end: body
 */
export function buildV0Envelope(body: Uint8Array, signerPubkey: Uint8Array): Uint8Array {
  requireSignerPubkey(signerPubkey);
  const buf = new Uint8Array(OFFCHAIN_HEADER_LEN_V0 + body.length);
  writePrefix(buf);
  buf[16] = 0x00;            // version
  buf.set(V0_APP_DOMAIN, 17);
  buf[49] = 0x00;            // format = ASCII
  buf[50] = 0x01;            // numSigners
  buf.set(signerPubkey, 51);
  buf[83] = body.length & 0xff;
  buf[84] = (body.length >> 8) & 0xff;
  buf.set(body, OFFCHAIN_HEADER_LEN_V0);
  return buf;
}

/**
 * Format an expiry timestamp as "DD Mon YYYY HH:MM:SS" (UTC).
 * Exactly 20 characters.
 *
 * @param secondsFromNow - seconds from current time until expiry
 */
export function formatExpiry(secondsFromNow: number): string {
  const d = new Date(Date.now() + secondsFromNow * 1000);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
}

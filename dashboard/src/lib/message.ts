/**
 * Off-chain message building for Lucid.
 *
 * Must produce byte-for-byte identical output to the on-chain build_message()
 * in programs/lucid/src/state/message.rs.
 *
 * Body format:
 *   {action} {rendered_template} | wallet: {name}; proposal: #{index}; expires: {DD Mon YYYY HH:MM:SS}
 *
 * Envelope:
 *   \xffsolana offchain (16 bytes) + version(0) + format(0) + body_len(u16 LE) + body
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
  proposalIndex: bigint | number | string,
  expiryStr: string
): string {
  return `${action} ${rendered} | wallet: ${walletName}; proposal: #${proposalIndex}; expires: ${expiryStr}`;
}

/** Legacy offchain envelope header: prefix(16) + version(1) + format(1) + length(2) */
export const OFFCHAIN_HEADER_LEN_LEGACY = 20;
/** V0 offchain envelope header: prefix(16) + version(1) + appDomain(32) + format(1) + numSigners(1) + pubkey(32) + length(2) */
export const OFFCHAIN_HEADER_LEN_V0 = 85;

/**
 * Wrap a message body in the Solana off-chain message envelope.
 *
 * Layout:
 *   0xFF + "solana offchain" (15 bytes) = 16 bytes prefix
 *   version: 0x00
 *   format:  0x00 (ASCII)
 *   length:  u16 LE (body byte length)
 *   body:    ASCII bytes
 */
export function buildOffchainEnvelope(body: string): Uint8Array {
  const bodyBytes = new TextEncoder().encode(body);
  const headerLen = OFFCHAIN_HEADER_LEN_LEGACY;
  const buf = new Uint8Array(headerLen + bodyBytes.length);

  // \xffsolana offchain (16 bytes)
  buf[0] = 0xff;
  const prefix = new TextEncoder().encode('solana offchain');
  buf.set(prefix, 1); // 15 bytes

  // version = 0
  buf[16] = 0x00;
  // format = 0 (ASCII)
  buf[17] = 0x00;

  // body length as u16 LE
  buf[18] = bodyBytes.length & 0xff;
  buf[19] = (bodyBytes.length >> 8) & 0xff;

  // body
  buf.set(bodyBytes, headerLen);

  return buf;
}

/**
 * Build V0 off-chain message envelope (Solana off-chain signing proposal, full spec).
 *
 * Layout:
 *   \xffsolana offchain (16 bytes)
 *   version: 0x00 (1 byte)
 *   appDomain: 32 bytes ("lucid-multisig", zero-padded)
 *   format: 0x00 = ASCII (1 byte)
 *   numSigners: 0x01 (1 byte)
 *   signerPubkey: 32 bytes
 *   bodyLength: u16 LE (2 bytes)
 *   body: N bytes
 */
export function buildV0Envelope(body: Uint8Array, signerPubkey: Uint8Array): Uint8Array {
  const buf = new Uint8Array(OFFCHAIN_HEADER_LEN_V0 + body.length);
  let pos = 0;

  buf[pos++] = 0xff;
  const prefix = new TextEncoder().encode('solana offchain');
  buf.set(prefix, pos); pos += 15;

  buf[pos++] = 0x00; // version

  // appDomain: 32 bytes whose base58 encoding reads "Luc1dMu1t1s1g111...111"
  buf.set([
    0x05, 0x19, 0x83, 0xb5, 0xba, 0xd3, 0x97, 0x02, 0x71, 0x2c, 0x2d, 0xef, 0x47, 0xbf, 0x2c, 0xdc,
    0x4c, 0x48, 0xfd, 0x4e, 0x1f, 0xd3, 0xf7, 0x56, 0x9d, 0x37, 0x78, 0x79, 0xc0, 0x00, 0x00, 0x00,
  ], pos);
  pos += 32;

  buf[pos++] = 0x00; // format = ASCII
  buf[pos++] = 0x01; // numSigners

  buf.set(signerPubkey, pos); pos += 32;

  buf[pos++] = body.length & 0xff;
  buf[pos++] = (body.length >> 8) & 0xff;

  buf.set(body, pos);
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

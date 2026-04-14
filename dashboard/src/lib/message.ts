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
  const headerLen = 20; // 16 prefix + 1 version + 1 format + 2 length
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

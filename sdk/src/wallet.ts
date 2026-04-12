import type { IntentDefinition, WalletInfo } from './types.js';

/**
 * LucidWallet: thin wrapper over the Codama-generated @lucid/client.
 *
 * Provides a high-level API for wallet lifecycle operations:
 * create, show, freeze, and addIntents.
 *
 * The actual transaction building uses the Codama-generated instruction builders
 * from @lucid/client. This class demonstrates the SDK's API surface.
 */
export class LucidWallet {
  private rpc: any;
  private payer: any;

  constructor(rpc: any, payer: any) {
    this.rpc = rpc;
    this.payer = payer;
  }

  /**
   * Create a new Lucid multisig wallet on-chain.
   *
   * @returns The wallet PDA address as a base58 string.
   */
  async create(opts: {
    name: string;
    proposers: string[];
    approvers: string[];
    approvalThreshold: number;
    cancellationThreshold: number;
    timelockSeconds: number;
  }): Promise<string> {
    // Derive wallet PDA from name
    // Seeds: ["wallet", name_bytes]
    const nameBytes = new TextEncoder().encode(opts.name);

    // In a full implementation, we would:
    // 1. Derive the wallet PDA: findProgramAddressSync(["wallet", nameBytes], LUCID_PROGRAM)
    // 2. Derive the vault PDA: findProgramAddressSync(["vault", walletPda], LUCID_PROGRAM)
    // 3. Derive meta-intent PDAs for add/remove/update
    // 4. Build & send the createWallet instruction via @lucid/client
    // 5. Build & send addProposer/addApprover instructions for each member

    // Placeholder: compute a deterministic address from the name
    const { createHash } = await import('node:crypto');
    const walletHash = createHash('sha256')
      .update(Buffer.concat([Buffer.from('wallet'), nameBytes]))
      .digest();

    // Use first 32 bytes as a placeholder address representation
    const walletAddress = this.bytesToBase58(walletHash.subarray(0, 32));

    // In production, this would send the actual transaction:
    // const ix = getCreateWalletInstruction({ wallet, vault, metaIntentAdd, ... payer });
    // const txSig = await sendAndConfirmTransaction(this.rpc, tx, [this.payer]);

    return walletAddress;
  }

  /**
   * Read on-chain wallet state.
   */
  async show(walletAddress: string): Promise<WalletInfo> {
    // In a full implementation:
    // const walletAccount = await fetchWallet(this.rpc, walletAddress as Address);
    // Then decode the on-chain data using the Codama-generated decoder.

    // For now, we build the RPC call structure:
    try {
      const accountInfo = await this.rpc
        .getAccountInfo(walletAddress, { encoding: 'base64' })
        .send();

      if (!accountInfo?.value) {
        throw new Error(`Wallet not found: ${walletAddress}`);
      }

      const raw = Buffer.from(accountInfo.value.data[0], 'base64');

      // Skip 2-byte prefix (discriminator + version) to reach struct data
      // On-chain layout after prefix:
      // proposalIndex: u64 (8 bytes)
      // intentCount:   u8  (1 byte)
      // frozen:        u8  (1 byte)
      // bump:          u8  (1 byte)
      // nameLen:       u8  (1 byte)
      // reserved:      [u8; 4] (4 bytes)
      // name:          [u8; 32] (32 bytes)
      const PREFIX_LEN = 2;
      const data = raw.subarray(PREFIX_LEN);
      const proposalIndex = data.readBigUInt64LE(0);
      const intentCount = data[8];
      const frozen = data[9];
      const bump = data[10];
      const nameLen = data[11];
      // skip 4 bytes reserved
      const nameRaw = data.subarray(16, 16 + nameLen);
      const name = new TextDecoder().decode(nameRaw);

      return {
        address: walletAddress,
        name,
        proposalIndex,
        intentCount,
        frozen: frozen !== 0,
        bump,
      };
    } catch (err: any) {
      throw new Error(`Failed to read wallet: ${err.message}`);
    }
  }

  /**
   * Freeze a wallet, preventing new proposals.
   *
   * @returns Transaction signature.
   */
  async freeze(walletAddress: string): Promise<string> {
    // In production:
    // const ix = getFreezeWalletInstruction({ wallet: walletAddress, authority: this.payer });
    // return sendAndConfirmTransaction(this.rpc, tx, [this.payer]);

    // Placeholder: build the instruction and return a mock sig
    const txSig = `freeze_${walletAddress.slice(0, 8)}_${Date.now()}`;
    return txSig;
  }

  /**
   * Register intent definitions on-chain for a wallet.
   * Each intent becomes an IntentHeader PDA.
   *
   * @returns Array of transaction signatures (one per intent or batched).
   */
  async addIntents(
    walletAddress: string,
    intents: IntentDefinition[]
  ): Promise<string[]> {
    // In production, we would:
    // 1. Serialize each IntentDefinition to the on-chain format
    // 2. Derive IntentHeader PDAs: ["intent", wallet, u8(index)]
    // 3. Build addIntent or addIntentsBatch instructions
    // 4. Send transactions

    const txSigs: string[] = [];

    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i];
      // Serialize the intent to the on-chain binary format:
      // This would use the Codama-generated addIntent instruction
      const txSig = `add_intent_${walletAddress.slice(0, 8)}_${i}_${Date.now()}`;
      txSigs.push(txSig);
    }

    return txSigs;
  }

  /**
   * Simple base58 encoding (sufficient for demo/hackathon).
   */
  private bytesToBase58(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }
    let result = '';
    while (num > BigInt(0)) {
      const remainder = Number(num % BigInt(58));
      num = num / BigInt(58);
      result = ALPHABET[remainder] + result;
    }
    // Handle leading zeros
    for (const byte of bytes) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }
    return result || '1';
  }
}

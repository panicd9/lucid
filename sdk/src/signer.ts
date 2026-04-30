/**
 * IntentSigner: builds and signs intent-based multisig proposals.
 *
 * Handles the full proposal lifecycle: propose, approve, cancel, execute.
 * Each action produces a human-readable message suitable for Ledger display.
 */
export class IntentSigner {
  private rpc: any;
  private walletAddress: string;

  constructor(rpc: any, walletAddress: string) {
    this.rpc = rpc;
    this.walletAddress = walletAddress;
  }

  /**
   * Create a new proposal for an intent.
   *
   * @param opts.intentIndex - The on-chain intent index to propose against
   * @param opts.params - Key-value map of param names to values
   * @param opts.expirySeconds - Seconds from now until the proposal expires
   * @param opts.proposerKeypair - The proposer's signing keypair
   * @returns proposalIndex and transaction signature
   */
  async propose(opts: {
    intentIndex: number;
    params: Record<string, any>;
    expirySeconds: number;
    proposerKeypair: any;
  }): Promise<{ proposalIndex: bigint; txSig: string }> {
    // In production:
    // 1. Fetch the wallet to get the next proposalIndex
    // 2. Derive the proposal PDA: ["proposal", wallet, u64_le(proposalIndex)]
    // 3. Derive the intent PDA: ["intent", wallet, u8(intentIndex)]
    // 4. Serialize params into the proposal data
    // 5. Build the Ed25519 signed message
    // 6. Send propose instruction with Ed25519 pre-instruction

    // Build the human-readable message for signing
    const proposalIndex = BigInt(Date.now()); // placeholder — real impl reads from wallet
    const expiry = new Date(Date.now() + opts.expirySeconds * 1000).toISOString();
    const message = this.buildMessage(
      `intent #${opts.intentIndex}`,
      opts.params,
      this.walletAddress.slice(0, 8),
      this.walletAddress,
      proposalIndex,
      'propose',
      expiry
    );

    // In production, we would:
    // const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
    //   privateKey: opts.proposerKeypair.secretKey,
    //   message: Buffer.from(message),
    // });
    // const proposeIx = getProposeInstruction({ wallet, intent, proposal, payer });
    // const txSig = await sendTransaction(this.rpc, [ed25519Ix, proposeIx], [opts.proposerKeypair]);

    const txSig = `propose_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;

    return { proposalIndex, txSig };
  }

  /**
   * Approve an existing proposal.
   *
   * @param proposalIndex - The proposal to approve
   * @param opts.approverKeypair - The approver's signing keypair
   * @param opts.expirySeconds - Seconds from now for the approval signature expiry
   * @returns Transaction signature
   */
  async approve(
    proposalIndex: bigint,
    opts: { approverKeypair: any; expirySeconds: number }
  ): Promise<string> {
    const expiry = new Date(Date.now() + opts.expirySeconds * 1000).toISOString();
    const message = this.buildMessage(
      '',
      {},
      this.walletAddress.slice(0, 8),
      this.walletAddress,
      proposalIndex,
      'approve',
      expiry
    );

    // In production:
    // const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({ ... message });
    // const approveIx = getApproveInstruction({ wallet, proposal, instructionsSysvar });
    // return sendTransaction(this.rpc, [ed25519Ix, approveIx], [opts.approverKeypair]);

    return `approve_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;
  }

  /**
   * Cancel an existing proposal.
   *
   * @param proposalIndex - The proposal to cancel
   * @param opts.cancellerKeypair - The canceller's signing keypair
   * @param opts.expirySeconds - Seconds from now for the cancellation signature expiry
   * @returns Transaction signature
   */
  async cancel(
    proposalIndex: bigint,
    opts: { cancellerKeypair: any; expirySeconds: number }
  ): Promise<string> {
    const expiry = new Date(Date.now() + opts.expirySeconds * 1000).toISOString();
    const message = this.buildMessage(
      '',
      {},
      this.walletAddress.slice(0, 8),
      this.walletAddress,
      proposalIndex,
      'cancel',
      expiry
    );

    // In production:
    // const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({ ... message });
    // const cancelIx = getCancelInstruction({ wallet, proposal, instructionsSysvar });
    // return sendTransaction(this.rpc, [ed25519Ix, cancelIx], [opts.cancellerKeypair]);

    return `cancel_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;
  }

  /**
   * Execute an approved proposal after its timelock has elapsed.
   *
   * @param proposalIndex - The proposal to execute
   * @returns Transaction signature
   */
  async execute(proposalIndex: bigint): Promise<string> {
    // In production:
    // 1. Fetch the proposal to get its intent and params
    // 2. Fetch the intent to get the instruction layout
    // 3. Reconstruct the target CPI instruction from intent + params
    // 4. Build the execute instruction with all required accounts
    // 5. Send the transaction (anyone can crank this)

    // const proposal = await fetchProposal(this.rpc, proposalPda);
    // const intent = await fetchIntentHeader(this.rpc, intentPda);
    // const executeIx = getExecuteInstruction({ wallet, proposal, intent, vault, ... });
    // return sendTransaction(this.rpc, [executeIx], [cranker]);

    return `execute_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;
  }

  /**
   * Build the human-readable message body that is Ed25519-signed.
   * This is the message that would appear on a Ledger screen.
   *
   * On-chain format (matches programs/lucid/src/state/message.rs):
   *   {action} {rendered_template} | wallet: {name} ({pda_b58}); proposal: #{index}; expires: {timestamp}
   *
   * The wallet PDA in base58 binds the signature to a specific wallet identity
   * — without it, a victim's signature can replay across two wallets that
   * happen to share a name.
   *
   * The full signed payload wraps this body in a Solana offchain message envelope
   * (\xffsolana offchain + version + format + length + body).
   *
   * @param intentTemplate - The intent template string with {param} placeholders
   * @param params - Key-value map to fill into the template
   * @param walletName - Short wallet identifier
   * @param walletPdaB58 - Base58-encoded wallet PDA (32-byte address)
   * @param proposalIndex - The proposal number
   * @param action - "propose" | "approve" | "cancel"
   * @param expiry - Timestamp string (DD Mon YYYY HH:MM:SS, e.g. "12 Apr 2026 18:00:00")
   * @returns The formatted message body string
   */
  buildMessage(
    intentTemplate: string,
    params: Record<string, any>,
    walletName: string,
    walletPdaB58: string,
    proposalIndex: bigint,
    action: string,
    expiry: string
  ): string {
    // Fill template params (escape regex metacharacters in param names)
    const escapeRegExp = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let filled = intentTemplate;
    for (const [key, value] of Object.entries(params)) {
      filled = filled.replace(
        new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g'),
        String(value)
      );
    }

    // "{action} {rendered_template} | wallet: {name} ({pda_b58}); proposal: #{index}; expires: {timestamp}"
    const actionPart = filled ? `${action} ${filled}` : action;
    return `${actionPart} | wallet: ${walletName} (${walletPdaB58}); proposal: #${proposalIndex}; expires: ${expiry}`;
  }
}

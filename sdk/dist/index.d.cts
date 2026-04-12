type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
interface IntentDefinition {
    version: number;
    programId: string;
    instructionName: string;
    discriminator: number[];
    params: ParamDefinition[];
    accounts: AccountDefinition[];
    dataSegments: DataSegmentDefinition[];
    seeds: SeedDefinition[];
    template: string;
    riskLevel: RiskLevel;
    timelockSeconds: number;
    verification: VerificationResult;
}
interface ParamDefinition {
    name: string;
    type: 'address' | 'u64' | 'i64' | 'string' | 'bool' | 'u8' | 'u16' | 'u32' | 'u128';
    label: string;
    constraintType: 'none' | 'less_than_u64' | 'greater_than_u64';
    constraintValue: bigint;
}
interface AccountDefinition {
    index: number;
    name: string;
    source: 'static' | 'param' | 'vault' | 'pda' | 'has_one';
    writable: boolean;
    signer: boolean;
    staticAddress?: string;
    paramIndex?: number;
    seeds?: SeedDefinition[];
    pdaProgram?: string;
    sourceAccountIndex?: number;
    dataOffset?: number;
}
interface DataSegmentDefinition {
    type: 'literal' | 'param';
    value?: number[];
    paramIndex?: number;
    encoding?: string;
}
interface SeedDefinition {
    type: 'literal' | 'param' | 'account';
    value?: number[];
    paramIndex?: number;
    accountIndex?: number;
}
interface VerificationResult {
    status: 'verified' | 'unverified' | 'mismatch';
    tier: 'known_program' | 'idl_structural' | 'unverified';
    confidence: number;
    details?: string;
    intentHash?: string;
}
interface AnchorIdl {
    address: string;
    metadata: {
        name: string;
        version: string;
        spec: string;
    };
    instructions: AnchorInstruction[];
    accounts?: AnchorAccount[];
    types?: AnchorType[];
}
interface AnchorInstruction {
    name: string;
    discriminator: number[];
    accounts: AnchorAccountMeta[];
    args: AnchorArg[];
}
interface AnchorAccountMeta {
    name: string;
    writable?: boolean;
    signer?: boolean;
    pda?: {
        seeds: AnchorSeed[];
    };
    address?: string;
}
interface AnchorSeed {
    kind: 'const' | 'arg' | 'account';
    value?: number[];
    path?: string;
}
interface AnchorArg {
    name: string;
    type: string | {
        defined?: {
            name: string;
        };
        option?: string;
        vec?: string;
        array?: [string, number];
    };
}
interface AnchorAccount {
    name: string;
    discriminator: number[];
}
interface AnchorType {
    name: string;
    type: {
        kind: string;
        fields?: any[];
    };
}
interface WalletInfo {
    address: string;
    name: string;
    proposalIndex: bigint;
    intentCount: number;
    frozen: boolean;
    bump: number;
}
interface KnownInstruction {
    name: string;
    discriminator: number[];
    accounts: {
        name: string;
        writable: boolean;
        signer: boolean;
    }[];
    args: {
        name: string;
        type: ParamDefinition['type'];
    }[];
}
interface KnownProgram {
    name: string;
    address: string;
    instructions: KnownInstruction[];
}

/**
 * IntentGenerator: parses Anchor IDL JSON and produces IntentDefinition[]
 * One IntentDefinition per instruction.
 */
declare class IntentGenerator {
    /**
     * Generate intent definitions from an Anchor IDL.
     * Returns one IntentDefinition per instruction.
     */
    fromIdl(idl: AnchorIdl): IntentDefinition[];
    private generateIntent;
    /**
     * Map IDL args to ParamDefinitions. Only includes args with supported types.
     */
    private mapArgs;
    /**
     * Infer account source from IDL metadata.
     */
    private inferAccountSource;
    /**
     * Map an Anchor PDA seed definition to our SeedDefinition.
     */
    private mapSeed;
    /**
     * Build data segments: discriminator as literal bytes, then each arg as a param segment.
     */
    private buildDataSegments;
    /**
     * Extract all PDA seeds across all accounts in the instruction.
     */
    private extractSeeds;
}

/**
 * VerificationEngine: multi-tier intent verification.
 *
 * Tier 1 — Known programs: hardcoded definitions for System, SPL Token, BPF Loader.
 * Tier 2 — IDL structural: verify against the source Anchor IDL.
 * Tier 3 — Unverified: no data available.
 */
declare class VerificationEngine {
    /**
     * Verify a single intent definition.
     * Tries Tier 1 (known programs) first, then Tier 2 (IDL structural) if IDL provided.
     */
    verify(intent: IntentDefinition, idl?: AnchorIdl): VerificationResult;
    /**
     * Verify all intents in a batch, attaching results to each.
     */
    verifyAll(intents: IntentDefinition[], idl?: AnchorIdl): IntentDefinition[];
}

/**
 * LucidWallet: thin wrapper over the Codama-generated @lucid/client.
 *
 * Provides a high-level API for wallet lifecycle operations:
 * create, show, freeze, and addIntents.
 *
 * The actual transaction building uses the Codama-generated instruction builders
 * from @lucid/client. This class demonstrates the SDK's API surface.
 */
declare class LucidWallet {
    private rpc;
    private payer;
    constructor(rpc: any, payer: any);
    /**
     * Create a new Lucid multisig wallet on-chain.
     *
     * @returns The wallet PDA address as a base58 string.
     */
    create(opts: {
        name: string;
        proposers: string[];
        approvers: string[];
        approvalThreshold: number;
        cancellationThreshold: number;
        timelockSeconds: number;
    }): Promise<string>;
    /**
     * Read on-chain wallet state.
     */
    show(walletAddress: string): Promise<WalletInfo>;
    /**
     * Freeze a wallet, preventing new proposals.
     *
     * @returns Transaction signature.
     */
    freeze(walletAddress: string): Promise<string>;
    /**
     * Register intent definitions on-chain for a wallet.
     * Each intent becomes an IntentHeader PDA.
     *
     * @returns Array of transaction signatures (one per intent or batched).
     */
    addIntents(walletAddress: string, intents: IntentDefinition[]): Promise<string[]>;
    /**
     * Simple base58 encoding (sufficient for demo/hackathon).
     */
    private bytesToBase58;
}

/**
 * IntentSigner: builds and signs intent-based multisig proposals.
 *
 * Handles the full proposal lifecycle: propose, approve, cancel, execute.
 * Each action produces a human-readable message suitable for Ledger display.
 */
declare class IntentSigner {
    private rpc;
    private walletAddress;
    constructor(rpc: any, walletAddress: string);
    /**
     * Create a new proposal for an intent.
     *
     * @param opts.intentIndex - The on-chain intent index to propose against
     * @param opts.params - Key-value map of param names to values
     * @param opts.expirySeconds - Seconds from now until the proposal expires
     * @param opts.proposerKeypair - The proposer's signing keypair
     * @returns proposalIndex and transaction signature
     */
    propose(opts: {
        intentIndex: number;
        params: Record<string, any>;
        expirySeconds: number;
        proposerKeypair: any;
    }): Promise<{
        proposalIndex: bigint;
        txSig: string;
    }>;
    /**
     * Approve an existing proposal.
     *
     * @param proposalIndex - The proposal to approve
     * @param opts.approverKeypair - The approver's signing keypair
     * @param opts.expirySeconds - Seconds from now for the approval signature expiry
     * @returns Transaction signature
     */
    approve(proposalIndex: bigint, opts: {
        approverKeypair: any;
        expirySeconds: number;
    }): Promise<string>;
    /**
     * Cancel an existing proposal.
     *
     * @param proposalIndex - The proposal to cancel
     * @param opts.cancellerKeypair - The canceller's signing keypair
     * @param opts.expirySeconds - Seconds from now for the cancellation signature expiry
     * @returns Transaction signature
     */
    cancel(proposalIndex: bigint, opts: {
        cancellerKeypair: any;
        expirySeconds: number;
    }): Promise<string>;
    /**
     * Execute an approved proposal after its timelock has elapsed.
     *
     * @param proposalIndex - The proposal to execute
     * @returns Transaction signature
     */
    execute(proposalIndex: bigint): Promise<string>;
    /**
     * Build the human-readable message that is Ed25519-signed.
     * This is the message that would appear on a Ledger screen.
     *
     * Format:
     *   lucid:{wallet_name}\n
     *   {action} #{proposal_index}\n
     *   {template with params filled in}\n
     *   exp:{expiry}
     *
     * @param intentTemplate - The intent template string with {param} placeholders
     * @param params - Key-value map to fill into the template
     * @param walletName - Short wallet identifier
     * @param proposalIndex - The proposal number
     * @param action - "propose" | "approve" | "cancel"
     * @param expiry - ISO timestamp string for expiry
     * @returns The formatted message string
     */
    buildMessage(intentTemplate: string, params: Record<string, any>, walletName: string, proposalIndex: bigint, action: string, expiry: string): string;
}

export { type AccountDefinition, type AnchorAccount, type AnchorAccountMeta, type AnchorArg, type AnchorIdl, type AnchorInstruction, type AnchorSeed, type AnchorType, type DataSegmentDefinition, type IntentDefinition, IntentGenerator, IntentSigner, type KnownInstruction, type KnownProgram, LucidWallet, type ParamDefinition, type RiskLevel, type SeedDefinition, VerificationEngine, type VerificationResult, type WalletInfo };

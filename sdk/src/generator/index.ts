import type {
  AnchorIdl,
  AnchorInstruction,
  AnchorAccountMeta,
  AnchorArg,
  AnchorSeed,
  IntentDefinition,
  ParamDefinition,
  AccountDefinition,
  DataSegmentDefinition,
  SeedDefinition,
} from '../types.js';
import { generateTemplate } from './template.js';
import { classifyRisk, defaultTimelock } from './risk.js';

/** Names that indicate an admin/authority account (vault source) */
const ADMIN_NAMES = /^(admin|authority|owner)$/i;

/** Map Anchor IDL type strings to intent param types */
function mapAnchorType(
  type: string | Record<string, any>
): ParamDefinition['type'] | null {
  if (typeof type === 'string') {
    const lower = type.toLowerCase();
    if (lower === 'publickey' || lower === 'pubkey') return 'address';
    if (lower === 'u64') return 'u64';
    if (lower === 'i64') return 'i64';
    if (lower === 'u8') return 'u8';
    if (lower === 'u16') return 'u16';
    if (lower === 'u32') return 'u32';
    if (lower === 'u128') return 'u128';
    if (lower === 'string') return 'string';
    if (lower === 'bool') return 'bool';
    return null; // unsupported
  }
  // Complex/nested types not supported in params
  return null;
}

/**
 * IntentGenerator: parses Anchor IDL JSON and produces IntentDefinition[]
 * One IntentDefinition per instruction.
 */
export class IntentGenerator {
  /**
   * Generate intent definitions from an Anchor IDL.
   * Returns one IntentDefinition per instruction.
   */
  fromIdl(idl: AnchorIdl): IntentDefinition[] {
    if (!idl || !Array.isArray(idl.instructions)) {
      throw new Error('Invalid IDL: instructions must be an array');
    }
    if (!idl.address || typeof idl.address !== 'string') {
      throw new Error('Invalid IDL: address must be a non-empty string');
    }
    return idl.instructions.map((ix) => {
      if (!ix.name || typeof ix.name !== 'string') {
        throw new Error('Invalid IDL instruction: name is required');
      }
      if (!Array.isArray(ix.discriminator) || ix.discriminator.length === 0) {
        throw new Error(
          `Invalid IDL instruction "${ix.name}": discriminator must be non-empty array`
        );
      }
      return this.generateIntent(idl, ix);
    });
  }

  private generateIntent(
    idl: AnchorIdl,
    ix: AnchorInstruction
  ): IntentDefinition {
    // 1. Map IDL args to intent params (skip unsupported types)
    const params = this.mapArgs(ix.args);

    // 2. Map IDL accounts to intent accounts with source inference
    const accounts = ix.accounts.map((acc, i) =>
      this.inferAccountSource(acc, i, ix)
    );

    // 3. Build data segments: 8-byte discriminator literal + args in order
    const dataSegments = this.buildDataSegments(ix, params);

    // 4. Extract seeds from PDA accounts
    const seeds = this.extractSeeds(ix);

    // 5. Generate template
    const template = generateTemplate(ix);

    // 6. Classify risk
    const riskLevel = classifyRisk(ix);

    // 7. Set timelock based on risk
    const timelockSeconds = defaultTimelock(riskLevel);

    return {
      version: 1,
      programId: idl.address,
      instructionName: ix.name,
      discriminator: ix.discriminator,
      params,
      accounts,
      dataSegments,
      seeds,
      template,
      riskLevel,
      timelockSeconds,
      verification: {
        status: 'unverified',
        tier: 'unverified',
        confidence: 0,
      },
    };
  }

  /**
   * Map IDL args to ParamDefinitions. Only includes args with supported types.
   */
  private mapArgs(args: AnchorArg[]): ParamDefinition[] {
    const params: ParamDefinition[] = [];
    for (const arg of args) {
      const mapped = mapAnchorType(arg.type);
      if (mapped === null) continue; // skip unsupported types
      params.push({
        name: arg.name,
        type: mapped,
        label: arg.name.replace(/_/g, ' '),
        constraintType: 'none',
        constraintValue: BigInt(0),
      });
    }
    return params;
  }

  /**
   * Infer account source from IDL metadata.
   */
  private inferAccountSource(
    acc: AnchorAccountMeta,
    index: number,
    ix: AnchorInstruction
  ): AccountDefinition {
    const base: AccountDefinition = {
      index,
      name: acc.name,
      source: 'param',
      writable: acc.writable ?? false,
      signer: acc.signer ?? false,
    };

    // Static address (e.g. system_program = 1111...)
    if (acc.address) {
      return {
        ...base,
        source: 'static',
        staticAddress: acc.address,
      };
    }

    // PDA with seeds
    if (acc.pda && acc.pda.seeds.length > 0) {
      return {
        ...base,
        source: 'pda',
        seeds: acc.pda.seeds.map((s) => this.mapSeed(s, ix)),
        pdaProgram: undefined, // defaults to the program itself
      };
    }

    // Signer in admin-like position (first account or named admin/authority/owner)
    if (acc.signer && (index === 0 || ADMIN_NAMES.test(acc.name))) {
      return {
        ...base,
        source: 'vault',
      };
    }

    // Default: param (user provides at proposal time)
    return base;
  }

  /**
   * Map an Anchor PDA seed definition to our SeedDefinition.
   */
  private mapSeed(seed: AnchorSeed, ix: AnchorInstruction): SeedDefinition {
    switch (seed.kind) {
      case 'const':
        return {
          type: 'literal',
          value: seed.value ? Array.from(seed.value) : [],
        };
      case 'arg': {
        // Find the arg index by path (path is the arg name)
        const argIndex = ix.args.findIndex((a) => a.name === seed.path);
        if (argIndex < 0) {
          throw new Error(
            `PDA seed references non-existent arg "${seed.path}" in instruction "${ix.name}"`
          );
        }
        return {
          type: 'param',
          paramIndex: argIndex,
        };
      }
      case 'account': {
        // Find the account index by path (path is the account name)
        const accIndex = ix.accounts.findIndex((a) => a.name === seed.path);
        if (accIndex < 0) {
          throw new Error(
            `PDA seed references non-existent account "${seed.path}" in instruction "${ix.name}"`
          );
        }
        return {
          type: 'account',
          accountIndex: accIndex,
        };
      }
      default:
        return { type: 'literal', value: [] };
    }
  }

  /**
   * Build data segments: discriminator as literal bytes, then each arg as a param segment.
   */
  private buildDataSegments(
    ix: AnchorInstruction,
    params: ParamDefinition[]
  ): DataSegmentDefinition[] {
    const segments: DataSegmentDefinition[] = [];

    // Discriminator literal (8 bytes for Anchor, or whatever length is in the IDL)
    segments.push({
      type: 'literal',
      value: ix.discriminator,
    });

    // Each supported param as a data segment
    // We need to track which IDL arg index maps to which param index
    let paramIdx = 0;
    for (const arg of ix.args) {
      const mapped = mapAnchorType(arg.type);
      if (mapped === null) {
        // Unsupported type — we skip it in params but still need to note it
        // in data segments if we want a complete layout. For now, skip.
        continue;
      }
      segments.push({
        type: 'param',
        paramIndex: paramIdx,
        encoding: mapped,
      });
      paramIdx++;
    }

    return segments;
  }

  /**
   * Extract all PDA seeds across all accounts in the instruction.
   */
  private extractSeeds(ix: AnchorInstruction): SeedDefinition[] {
    const seeds: SeedDefinition[] = [];
    for (const acc of ix.accounts) {
      if (acc.pda && acc.pda.seeds.length > 0) {
        for (const seed of acc.pda.seeds) {
          seeds.push(this.mapSeed(seed, ix));
        }
      }
    }
    return seeds;
  }
}

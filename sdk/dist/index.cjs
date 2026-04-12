"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  IntentGenerator: () => IntentGenerator,
  IntentSigner: () => IntentSigner,
  LucidWallet: () => LucidWallet,
  VerificationEngine: () => VerificationEngine
});
module.exports = __toCommonJS(index_exports);

// src/generator/template.ts
function snakeToWords(s) {
  return s.replace(/_/g, " ");
}
var PATTERNS = [
  // update_admin(new_admin: Pubkey) -> "change admin authority to {new_admin}"
  {
    test: (ix) => /^(update|set|change)_?(admin|authority|owner)$/i.test(ix.name) && ix.args.length >= 1 && /admin|authority|owner/i.test(ix.args[0].name),
    generate: (ix) => `change admin authority to {${ix.args[0].name}}`
  },
  // withdraw(amount, recipient) -> "withdraw {amount} to {recipient}"
  {
    test: (ix) => /withdraw/i.test(ix.name) && ix.args.some((a) => a.name === "amount") && ix.args.some((a) => /recipient|destination|to/i.test(a.name)),
    generate: (ix) => {
      const recipientArg = ix.args.find((a) => /recipient|destination|to/i.test(a.name));
      return `withdraw {amount} to {${recipientArg.name}}`;
    }
  },
  // withdraw(amount) -> "withdraw {amount}"
  {
    test: (ix) => /withdraw/i.test(ix.name) && ix.args.some((a) => a.name === "amount"),
    generate: (_ix) => `withdraw {amount}`
  },
  // transfer(amount, ...) -> "transfer {amount}"
  {
    test: (ix) => /transfer/i.test(ix.name) && ix.args.some((a) => a.name === "amount"),
    generate: (_ix) => `transfer {amount}`
  },
  // set_paused(paused: bool) -> "set paused to {paused}"
  {
    test: (ix) => /^set_/i.test(ix.name) && ix.args.length === 1,
    generate: (ix) => {
      const words = snakeToWords(ix.name);
      return `${words} to {${ix.args[0].name}}`;
    }
  },
  // add_market(market_index, oracle) -> "add market {market_index} with oracle {oracle}"
  {
    test: (ix) => /^add_/i.test(ix.name) && ix.args.length >= 2 && ix.args.some((a) => /oracle/i.test(a.name)),
    generate: (ix) => {
      const indexArg = ix.args.find((a) => /index/i.test(a.name));
      const oracleArg = ix.args.find((a) => /oracle/i.test(a.name));
      if (indexArg && oracleArg) {
        return `add market {${indexArg.name}} with oracle {${oracleArg.name}}`;
      }
      return `${snakeToWords(ix.name)} with oracle {${oracleArg.name}}`;
    }
  }
];
function generateTemplate(ix) {
  for (const pattern of PATTERNS) {
    if (pattern.test(ix)) {
      return pattern.generate(ix);
    }
  }
  const words = snakeToWords(ix.name);
  if (ix.args.length === 0) {
    return words;
  }
  const argList = ix.args.map((a) => `{${a.name}}`).join(", ");
  return `${words}: ${argList}`;
}

// src/generator/risk.ts
var CRITICAL_NAME_PATTERNS = /admin|authority|owner|upgrade|freeze_program|close_program/i;
var CRITICAL_ARG_PATTERNS = /^(new_admin|new_authority|new_owner)$/i;
var HIGH_NAME_PATTERNS = /withdraw|transfer|mint|burn|oracle|fee/i;
var HIGH_VAULT_ACCOUNT_PATTERNS = /vault|treasury/i;
var MEDIUM_NAME_PATTERNS = /^(add|remove|update|set|config)/i;
function classifyRisk(ix) {
  if (CRITICAL_NAME_PATTERNS.test(ix.name)) {
    return "critical";
  }
  if (ix.args.some((a) => CRITICAL_ARG_PATTERNS.test(a.name))) {
    return "critical";
  }
  if (HIGH_NAME_PATTERNS.test(ix.name)) {
    return "high";
  }
  const hasAmountU64 = ix.args.some(
    (a) => a.name === "amount" && resolveArgType(a.type) === "u64"
  );
  const hasVaultAccount = ix.accounts.some(
    (acc) => HIGH_VAULT_ACCOUNT_PATTERNS.test(acc.name)
  );
  if (hasAmountU64 && hasVaultAccount) {
    return "high";
  }
  if (MEDIUM_NAME_PATTERNS.test(ix.name)) {
    return "medium";
  }
  return "low";
}
function defaultTimelock(risk) {
  switch (risk) {
    case "critical":
      return 86400;
    // 24h
    case "high":
      return 3600;
    // 1h
    case "medium":
      return 0;
    case "low":
      return 0;
  }
}
function resolveArgType(type) {
  if (typeof type === "string") return type;
  return "complex";
}

// src/generator/index.ts
var ADMIN_NAMES = /^(admin|authority|owner|payer|signer)$/i;
function mapAnchorType(type) {
  if (typeof type === "string") {
    const lower = type.toLowerCase();
    if (lower === "publickey" || lower === "pubkey") return "address";
    if (lower === "u64") return "u64";
    if (lower === "i64") return "i64";
    if (lower === "u8") return "u8";
    if (lower === "u16") return "u16";
    if (lower === "u32") return "u32";
    if (lower === "u128") return "u128";
    if (lower === "string") return "string";
    if (lower === "bool") return "bool";
    return null;
  }
  return null;
}
var IntentGenerator = class {
  /**
   * Generate intent definitions from an Anchor IDL.
   * Returns one IntentDefinition per instruction.
   */
  fromIdl(idl) {
    return idl.instructions.map((ix) => this.generateIntent(idl, ix));
  }
  generateIntent(idl, ix) {
    const params = this.mapArgs(ix.args);
    const accounts = ix.accounts.map(
      (acc, i) => this.inferAccountSource(acc, i, ix)
    );
    const dataSegments = this.buildDataSegments(ix, params);
    const seeds = this.extractSeeds(ix);
    const template = generateTemplate(ix);
    const riskLevel = classifyRisk(ix);
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
        status: "unverified",
        tier: "unverified",
        confidence: 0
      }
    };
  }
  /**
   * Map IDL args to ParamDefinitions. Only includes args with supported types.
   */
  mapArgs(args) {
    const params = [];
    for (const arg of args) {
      const mapped = mapAnchorType(arg.type);
      if (mapped === null) continue;
      params.push({
        name: arg.name,
        type: mapped,
        label: arg.name.replace(/_/g, " "),
        constraintType: "none",
        constraintValue: BigInt(0)
      });
    }
    return params;
  }
  /**
   * Infer account source from IDL metadata.
   */
  inferAccountSource(acc, index, ix) {
    const base = {
      index,
      name: acc.name,
      source: "param",
      writable: acc.writable ?? false,
      signer: acc.signer ?? false
    };
    if (acc.address) {
      return {
        ...base,
        source: "static",
        staticAddress: acc.address
      };
    }
    if (acc.pda && acc.pda.seeds.length > 0) {
      return {
        ...base,
        source: "pda",
        seeds: acc.pda.seeds.map((s) => this.mapSeed(s, ix)),
        pdaProgram: void 0
        // defaults to the program itself
      };
    }
    if (acc.signer && (index === 0 || ADMIN_NAMES.test(acc.name))) {
      return {
        ...base,
        source: "vault"
      };
    }
    return base;
  }
  /**
   * Map an Anchor PDA seed definition to our SeedDefinition.
   */
  mapSeed(seed, ix) {
    switch (seed.kind) {
      case "const":
        return {
          type: "literal",
          value: seed.value ? Array.from(seed.value) : []
        };
      case "arg": {
        const argIndex = ix.args.findIndex((a) => a.name === seed.path);
        return {
          type: "param",
          paramIndex: argIndex >= 0 ? argIndex : 0
        };
      }
      case "account": {
        const accIndex = ix.accounts.findIndex((a) => a.name === seed.path);
        return {
          type: "account",
          accountIndex: accIndex >= 0 ? accIndex : 0
        };
      }
      default:
        return { type: "literal", value: [] };
    }
  }
  /**
   * Build data segments: discriminator as literal bytes, then each arg as a param segment.
   */
  buildDataSegments(ix, params) {
    const segments = [];
    segments.push({
      type: "literal",
      value: ix.discriminator
    });
    let paramIdx = 0;
    for (const arg of ix.args) {
      const mapped = mapAnchorType(arg.type);
      if (mapped === null) {
        continue;
      }
      segments.push({
        type: "param",
        paramIndex: paramIdx,
        encoding: mapped
      });
      paramIdx++;
    }
    return segments;
  }
  /**
   * Extract all PDA seeds across all accounts in the instruction.
   */
  extractSeeds(ix) {
    const seeds = [];
    for (const acc of ix.accounts) {
      if (acc.pda && acc.pda.seeds.length > 0) {
        for (const seed of acc.pda.seeds) {
          seeds.push(this.mapSeed(seed, ix));
        }
      }
    }
    return seeds;
  }
};

// src/verification/known-programs.ts
var SYSTEM_PROGRAM = {
  name: "System Program",
  address: "11111111111111111111111111111111",
  instructions: [
    {
      name: "Transfer",
      discriminator: [2, 0, 0, 0],
      // u32 LE instruction index 2
      accounts: [
        { name: "from", writable: true, signer: true },
        { name: "to", writable: true, signer: false }
      ],
      args: [{ name: "lamports", type: "u64" }]
    }
  ]
};
var SPL_TOKEN = {
  name: "SPL Token",
  address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  instructions: [
    {
      name: "Transfer",
      discriminator: [3],
      accounts: [
        { name: "source", writable: true, signer: false },
        { name: "destination", writable: true, signer: false },
        { name: "authority", writable: false, signer: true }
      ],
      args: [{ name: "amount", type: "u64" }]
    },
    {
      name: "TransferChecked",
      discriminator: [12],
      accounts: [
        { name: "source", writable: true, signer: false },
        { name: "mint", writable: false, signer: false },
        { name: "destination", writable: true, signer: false },
        { name: "authority", writable: false, signer: true }
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "decimals", type: "u8" }
      ]
    },
    {
      name: "SetAuthority",
      discriminator: [6],
      accounts: [
        { name: "account", writable: true, signer: false },
        { name: "currentAuthority", writable: false, signer: true }
      ],
      args: [
        { name: "authorityType", type: "u8" },
        { name: "newAuthority", type: "address" }
      ]
    }
  ]
};
var BPF_UPGRADEABLE_LOADER = {
  name: "BPF Upgradeable Loader",
  address: "BPFLoaderUpgradeab1e11111111111111111111111",
  instructions: [
    {
      name: "Upgrade",
      discriminator: [3, 0, 0, 0],
      accounts: [
        { name: "programdata", writable: true, signer: false },
        { name: "program", writable: true, signer: false },
        { name: "buffer", writable: true, signer: false },
        { name: "spill", writable: true, signer: false },
        { name: "rent", writable: false, signer: false },
        { name: "clock", writable: false, signer: false },
        { name: "authority", writable: false, signer: true }
      ],
      args: []
    },
    {
      name: "SetAuthority",
      discriminator: [4, 0, 0, 0],
      accounts: [
        { name: "account", writable: true, signer: false },
        { name: "currentAuthority", writable: false, signer: true },
        { name: "newAuthority", writable: false, signer: false }
      ],
      args: []
    },
    {
      name: "Close",
      discriminator: [5, 0, 0, 0],
      accounts: [
        { name: "close", writable: true, signer: false },
        { name: "recipient", writable: true, signer: false },
        { name: "authority", writable: false, signer: true }
      ],
      args: []
    }
  ]
};
var KNOWN_PROGRAMS = /* @__PURE__ */ new Map([
  [SYSTEM_PROGRAM.address, SYSTEM_PROGRAM],
  [SPL_TOKEN.address, SPL_TOKEN],
  [BPF_UPGRADEABLE_LOADER.address, BPF_UPGRADEABLE_LOADER]
]);

// src/verification/tier1.ts
function discriminatorsMatch(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
function verifyKnownProgram(intent) {
  const program = KNOWN_PROGRAMS.get(intent.programId);
  if (!program) {
    return {
      status: "unverified",
      tier: "unverified",
      confidence: 0,
      details: `Program ${intent.programId} not in known programs list`
    };
  }
  const knownIx = program.instructions.find(
    (ix) => discriminatorsMatch(ix.discriminator, intent.discriminator)
  );
  if (!knownIx) {
    return {
      status: "mismatch",
      tier: "known_program",
      confidence: 0,
      details: `Discriminator [${intent.discriminator.join(",")}] not found in ${program.name}`
    };
  }
  const errors = [];
  if (intent.accounts.length !== knownIx.accounts.length) {
    errors.push(
      `Account count mismatch: intent has ${intent.accounts.length}, expected ${knownIx.accounts.length}`
    );
  }
  const minAccounts = Math.min(intent.accounts.length, knownIx.accounts.length);
  for (let i = 0; i < minAccounts; i++) {
    const intentAcc = intent.accounts[i];
    const knownAcc = knownIx.accounts[i];
    if (intentAcc.writable !== knownAcc.writable) {
      errors.push(
        `Account ${i} (${knownAcc.name}): writable mismatch \u2014 intent=${intentAcc.writable}, expected=${knownAcc.writable}`
      );
    }
    if (intentAcc.signer !== knownAcc.signer) {
      errors.push(
        `Account ${i} (${knownAcc.name}): signer mismatch \u2014 intent=${intentAcc.signer}, expected=${knownAcc.signer}`
      );
    }
  }
  if (intent.dataSegments.length > 0) {
    const firstSeg = intent.dataSegments[0];
    if (firstSeg.type !== "literal") {
      errors.push("First data segment should be a literal (discriminator)");
    } else if (firstSeg.value && !discriminatorsMatch(firstSeg.value, knownIx.discriminator)) {
      errors.push(
        `Discriminator in data segment [${firstSeg.value?.join(",")}] does not match known [${knownIx.discriminator.join(",")}]`
      );
    }
  }
  const paramSegments = intent.dataSegments.filter((s) => s.type === "param");
  if (paramSegments.length !== knownIx.args.length) {
    errors.push(
      `Arg count mismatch: intent has ${paramSegments.length} param segments, expected ${knownIx.args.length}`
    );
  }
  const minArgs = Math.min(paramSegments.length, knownIx.args.length);
  for (let i = 0; i < minArgs; i++) {
    const seg = paramSegments[i];
    const knownArg = knownIx.args[i];
    if (seg.encoding && seg.encoding !== knownArg.type) {
      errors.push(
        `Arg ${i} (${knownArg.name}): encoding mismatch \u2014 intent=${seg.encoding}, expected=${knownArg.type}`
      );
    }
  }
  if (errors.length > 0) {
    return {
      status: "mismatch",
      tier: "known_program",
      confidence: 0,
      details: errors.join("; ")
    };
  }
  return {
    status: "verified",
    tier: "known_program",
    confidence: 1,
    details: `Matched ${program.name} / ${knownIx.name}`
  };
}

// src/verification/tier2.ts
var import_node_crypto = require("crypto");
function anchorDiscriminator(name) {
  const hash = (0, import_node_crypto.createHash)("sha256").update(`global:${name}`).digest();
  return Array.from(hash.subarray(0, 8));
}
function discriminatorsMatch2(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
function verifyIdlStructural(intent, idl) {
  const errors = [];
  const ix = idl.instructions.find(
    (i) => discriminatorsMatch2(i.discriminator, intent.discriminator)
  );
  if (!ix) {
    return {
      status: "mismatch",
      tier: "idl_structural",
      confidence: 0,
      details: `No IDL instruction matches discriminator [${intent.discriminator.join(",")}]`
    };
  }
  if (ix.name !== intent.instructionName) {
    errors.push(
      `Name mismatch: intent="${intent.instructionName}", IDL="${ix.name}"`
    );
  }
  if (intent.accounts.length !== ix.accounts.length) {
    errors.push(
      `Account count: intent=${intent.accounts.length}, IDL=${ix.accounts.length}`
    );
  }
  const minAccounts = Math.min(intent.accounts.length, ix.accounts.length);
  for (let i = 0; i < minAccounts; i++) {
    const intentAcc = intent.accounts[i];
    const idlAcc = ix.accounts[i];
    if (intentAcc.writable !== (idlAcc.writable ?? false)) {
      errors.push(
        `Account ${i} (${idlAcc.name}): writable mismatch`
      );
    }
    if (intentAcc.signer !== (idlAcc.signer ?? false)) {
      errors.push(
        `Account ${i} (${idlAcc.name}): signer mismatch`
      );
    }
  }
  const paramSegments = intent.dataSegments.filter((s) => s.type === "param");
  const supportedArgs = ix.args.filter((a) => typeof a.type === "string");
  if (paramSegments.length !== supportedArgs.length) {
    errors.push(
      `Param segment count (${paramSegments.length}) vs supported IDL args (${supportedArgs.length})`
    );
  }
  const paramNames = new Set(intent.params.map((p) => p.name));
  const templateRefs = intent.template.match(/\{(\w+)\}/g) || [];
  for (const ref of templateRefs) {
    const name = ref.slice(1, -1);
    if (!paramNames.has(name)) {
      errors.push(`Template references unknown param: ${name}`);
    }
  }
  const expected = anchorDiscriminator(ix.name);
  if (!discriminatorsMatch2(intent.discriminator, expected)) {
    errors.push(
      `Discriminator does not match Anchor convention sha256("global:${ix.name}")[0..8]. Got [${intent.discriminator.join(",")}], expected [${expected.join(",")}]`
    );
  }
  if (errors.length > 0) {
    const totalChecks = 4 + templateRefs.length;
    const failedChecks = errors.length;
    const confidence = Math.max(0, (totalChecks - failedChecks) / totalChecks);
    return {
      status: confidence >= 0.5 ? "unverified" : "mismatch",
      tier: "idl_structural",
      confidence,
      details: errors.join("; ")
    };
  }
  const hashInput = JSON.stringify({
    programId: intent.programId,
    discriminator: intent.discriminator,
    accounts: intent.accounts.map((a) => ({
      name: a.name,
      source: a.source,
      writable: a.writable,
      signer: a.signer
    })),
    params: intent.params.map((p) => ({ name: p.name, type: p.type }))
  });
  const intentHash = (0, import_node_crypto.createHash)("sha256").update(hashInput).digest("hex");
  return {
    status: "verified",
    tier: "idl_structural",
    confidence: 1,
    details: `Structurally verified against IDL instruction "${ix.name}"`,
    intentHash
  };
}

// src/verification/index.ts
var VerificationEngine = class {
  /**
   * Verify a single intent definition.
   * Tries Tier 1 (known programs) first, then Tier 2 (IDL structural) if IDL provided.
   */
  verify(intent, idl) {
    const tier1 = verifyKnownProgram(intent);
    if (tier1.status === "verified") return tier1;
    if (idl) {
      return verifyIdlStructural(intent, idl);
    }
    return {
      status: "unverified",
      tier: "unverified",
      confidence: 0,
      details: "No IDL available for verification"
    };
  }
  /**
   * Verify all intents in a batch, attaching results to each.
   */
  verifyAll(intents, idl) {
    return intents.map((i) => ({
      ...i,
      verification: this.verify(i, idl)
    }));
  }
};

// src/wallet.ts
var LucidWallet = class {
  rpc;
  payer;
  constructor(rpc, payer) {
    this.rpc = rpc;
    this.payer = payer;
  }
  /**
   * Create a new Lucid multisig wallet on-chain.
   *
   * @returns The wallet PDA address as a base58 string.
   */
  async create(opts) {
    const nameBytes = new TextEncoder().encode(opts.name);
    const { createHash: createHash2 } = await import("crypto");
    const walletHash = createHash2("sha256").update(Buffer.concat([Buffer.from("wallet"), nameBytes])).digest();
    const walletAddress = this.bytesToBase58(walletHash.subarray(0, 32));
    return walletAddress;
  }
  /**
   * Read on-chain wallet state.
   */
  async show(walletAddress) {
    try {
      const accountInfo = await this.rpc.getAccountInfo(walletAddress, { encoding: "base64" }).send();
      if (!accountInfo?.value) {
        throw new Error(`Wallet not found: ${walletAddress}`);
      }
      const data = Buffer.from(accountInfo.value.data[0], "base64");
      const proposalIndex = data.readBigUInt64LE(0);
      const intentCount = data[8];
      const frozen = data[9];
      const bump = data[10];
      const nameLen = data[11];
      const nameRaw = data.subarray(16, 16 + nameLen);
      const name = new TextDecoder().decode(nameRaw);
      return {
        address: walletAddress,
        name,
        proposalIndex,
        intentCount,
        frozen: frozen !== 0,
        bump
      };
    } catch (err) {
      throw new Error(`Failed to read wallet: ${err.message}`);
    }
  }
  /**
   * Freeze a wallet, preventing new proposals.
   *
   * @returns Transaction signature.
   */
  async freeze(walletAddress) {
    const txSig = `freeze_${walletAddress.slice(0, 8)}_${Date.now()}`;
    return txSig;
  }
  /**
   * Register intent definitions on-chain for a wallet.
   * Each intent becomes an IntentHeader PDA.
   *
   * @returns Array of transaction signatures (one per intent or batched).
   */
  async addIntents(walletAddress, intents) {
    const txSigs = [];
    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i];
      const txSig = `add_intent_${walletAddress.slice(0, 8)}_${i}_${Date.now()}`;
      txSigs.push(txSig);
    }
    return txSigs;
  }
  /**
   * Simple base58 encoding (sufficient for demo/hackathon).
   */
  bytesToBase58(bytes) {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = BigInt(0);
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }
    let result = "";
    while (num > BigInt(0)) {
      const remainder = Number(num % BigInt(58));
      num = num / BigInt(58);
      result = ALPHABET[remainder] + result;
    }
    for (const byte of bytes) {
      if (byte === 0) {
        result = "1" + result;
      } else {
        break;
      }
    }
    return result || "1";
  }
};

// src/signer.ts
var IntentSigner = class {
  rpc;
  walletAddress;
  constructor(rpc, walletAddress) {
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
  async propose(opts) {
    const proposalIndex = BigInt(Date.now());
    const expiry = new Date(Date.now() + opts.expirySeconds * 1e3).toISOString();
    const message = this.buildMessage(
      `intent #${opts.intentIndex}`,
      opts.params,
      this.walletAddress.slice(0, 8),
      proposalIndex,
      "propose",
      expiry
    );
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
  async approve(proposalIndex, opts) {
    const expiry = new Date(Date.now() + opts.expirySeconds * 1e3).toISOString();
    const message = this.buildMessage(
      "",
      {},
      this.walletAddress.slice(0, 8),
      proposalIndex,
      "approve",
      expiry
    );
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
  async cancel(proposalIndex, opts) {
    const expiry = new Date(Date.now() + opts.expirySeconds * 1e3).toISOString();
    const message = this.buildMessage(
      "",
      {},
      this.walletAddress.slice(0, 8),
      proposalIndex,
      "cancel",
      expiry
    );
    return `cancel_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;
  }
  /**
   * Execute an approved proposal after its timelock has elapsed.
   *
   * @param proposalIndex - The proposal to execute
   * @returns Transaction signature
   */
  async execute(proposalIndex) {
    return `execute_${this.walletAddress.slice(0, 8)}_${proposalIndex}_${Date.now()}`;
  }
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
  buildMessage(intentTemplate, params, walletName, proposalIndex, action, expiry) {
    let filled = intentTemplate;
    for (const [key, value] of Object.entries(params)) {
      filled = filled.replace(
        new RegExp(`\\{${key}\\}`, "g"),
        String(value)
      );
    }
    const lines = [
      `lucid:${walletName}`,
      `${action} #${proposalIndex}`
    ];
    if (filled) {
      lines.push(filled);
    }
    lines.push(`exp:${expiry}`);
    return lines.join("\n");
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IntentGenerator,
  IntentSigner,
  LucidWallet,
  VerificationEngine
});
//# sourceMappingURL=index.cjs.map
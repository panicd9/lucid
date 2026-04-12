#!/usr/bin/env zx
import 'zx/globals';
import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor as renderJavaScriptVisitor } from '@codama/renderers-js';
import { renderVisitor as renderRustVisitor } from '@codama/renderers-rust';

const workingDirectory = (await $`pwd`.quiet()).toString().trim();

// Load Shank-generated IDL.
const idl = require(path.join(workingDirectory, 'idl', 'lucid.json'));

// Instantiate Codama from Anchor-compatible IDL.
const codama = createFromRoot(rootNodeFromAnchor(idl));

// Render JavaScript client.
const jsClient = path.join(__dirname, '..', 'clients', 'js');
codama.accept(
  renderJavaScriptVisitor(jsClient, {
    deleteFolderBeforeRendering: true,
    syncPackageJson: false,
  })
);

// Render Rust client.
const rustClient = path.join(__dirname, '..', 'clients', 'rust');
codama.accept(
  renderRustVisitor(rustClient, {
    formatCode: true,
    deleteFolderBeforeRendering: true,
    syncCargoToml: false,
    dependencyVersions: {
      'solana-address': { version: '^2.6', features: ['borsh', 'copy', 'curve25519', 'decode'] },
      'solana-instruction': '^3.0',
      'solana-account-info': '^3.0',
      'solana-cpi': '^3.0',
      'solana-program-error': '^3.0',
      'solana-account': '^3.0',
      'solana-pubkey': '^3.0',
    },
  })
);

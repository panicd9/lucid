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
  renderJavaScriptVisitor(path.join(jsClient, 'src', 'generated'), {
    deleteFolderBeforeRendering: true,
  })
);

// Render Rust client.
const rustClient = path.join(__dirname, '..', 'clients', 'rust');
codama.accept(
  renderRustVisitor(path.join(rustClient, 'src', 'generated'), {
    formatCode: true,
    crateFolder: rustClient,
    deleteFolderBeforeRendering: true,
  })
);

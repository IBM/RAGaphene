/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// First-run setup: create .env.local from .env.example and fill in a generated
// NEXTAUTH_SECRET so the credentials (placeholder) login works over plain HTTP with no
// further editing. Run with `npm run setup`. Never overwrites an existing
// .env.local — that file may hold real credentials.

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const target = resolve(root, '.env.local');
const template = resolve(root, '.env.example');

if (existsSync(target)) {
  console.log('.env.local already exists — leaving it untouched.');
  console.log('Delete it first if you want to regenerate from .env.example.');
  process.exit(0);
}

if (!existsSync(template)) {
  console.error('.env.example not found — run this from the repository root.');
  process.exit(1);
}

copyFileSync(template, target);

// Fill the empty NEXTAUTH_SECRET= line with a fresh base64 secret.
const secret = randomBytes(32).toString('base64');
const contents = readFileSync(target, 'utf8').replace(
  /^NEXTAUTH_SECRET=.*$/m,
  `NEXTAUTH_SECRET=${secret}`,
);
writeFileSync(target, contents);

console.log('Created .env.local with a generated NEXTAUTH_SECRET.');
console.log('');
console.log(
  'Default login (credentials mode): username "user", password "RAGapheneUser".',
);
console.log('');
console.log('Next steps:');
console.log('  npm run dev            # start on http://localhost:3000');
console.log('  # then log in, upload a document under Data → Create,');
console.log(
  '  # pick the Ollama generator (or paste an OpenAI/Anthropic key).',
);

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Isolated regression test for the disk-reload search path.
 *
 * searchOptions (prefix/fuzzy) are not serialised into the MiniSearch index
 * JSON, so retrieve() must re-supply them when loading a collection from disk.
 * A reload that omits them silently disables partial-word and fuzzy matching —
 * exact tokens still hit, so the bug looks intermittent (the in-process cache
 * retains the options; only cold-loaded disk copies lost them).
 *
 * This lives in its own file because it uses jest.resetModules() to force a
 * genuine cache miss, and mixing that with the shared-state main suite makes
 * module/mock state unpredictable across tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Local Documents parsing only touches pdf-parse for .pdf files; this suite
// uses .txt only, but the module imports pdf-parse at load time so it must be
// mocked to avoid spawning a real PDF worker.
jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ text: '' }),
}));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localIndex-reload-'));
process.env.LOCAL_INDEX_DIR = tmpDir;
process.env.LOCAL_INDEX_CHUNK_WORDS = '5';
process.env.LOCAL_INDEX_MAX_COLLECTIONS = '5';
process.env.LOCAL_INDEX_TTL_HOURS = '0';

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

it('preserves prefix matching after a cold disk reload', async () => {
  // Ingest with the original module instance (seeds its in-process cache).
  const original = await import('@/src/common/utilities/localIndex');
  const { collection } = await original.ingestDocuments('reload-user', [
    {
      name: 'prefix.txt',
      buffer: Buffer.from('retrieval augmented generation is powerful'),
    },
  ]);

  // A fresh module instance shares LOCAL_INDEX_DIR but starts with an empty
  // in-process cache, so retrieve() is forced down the loadJSON-from-disk path.
  jest.resetModules();
  const fresh = await import('@/src/common/utilities/localIndex');

  // 'retriev' is a prefix of the indexed token 'retrieval' — it only matches
  // when prefix search survives the reload.
  const prefixHits = await fresh.retrieve(
    collection.uuid!,
    { query: 'retriev' },
    3,
    '${text}',
    '${text}',
  );
  expect(prefixHits.length).toBeGreaterThan(0);

  // Sanity check: exact-token match also works (this passed even with the bug).
  const exactHits = await fresh.retrieve(
    collection.uuid!,
    { query: 'retrieval' },
    3,
    '${text}',
    '${text}',
  );
  expect(exactHits.length).toBeGreaterThan(0);
});

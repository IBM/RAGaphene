/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import MiniSearch from 'minisearch';
import pdfParse from 'pdf-parse';
import { Collection, Document } from '@/types/custom';
import { VARIABLE } from '@/src/common/constants';

// --- Config ---

const INDEX_DIR = process.env.LOCAL_INDEX_DIR ?? './data/indices';
const MAX_CHUNKS = parseInt(process.env.LOCAL_INDEX_MAX_CHUNKS ?? '500');
const CHUNK_WORDS = parseInt(process.env.LOCAL_INDEX_CHUNK_WORDS ?? '512');
const MAX_COLS = parseInt(process.env.LOCAL_INDEX_MAX_COLLECTIONS ?? '3');
const TTL_HOURS = parseInt(process.env.LOCAL_INDEX_TTL_HOURS ?? '0');

// --- Types ---

interface Chunk {
  id: string;
  text: string;
  source: string;
  chunkIndex: number;
  wordCount: number;
}

interface CollectionMeta {
  uuid: string;
  name: string;
  docCount: number;
  chunkCount: number;
  createdAt: string;
  trimmed: TrimRecord[];
}

interface TrimRecord {
  source: string;
  rawChunks: number;
  keptChunks: number;
  percent: number;
}

export interface SkippedFile {
  source: string;
  // 'unreadable' — pdf-parse threw (encrypted, password-protected, or malformed).
  // 'empty'      — parsed without error but yielded no extractable text
  //                (scanned / image-only PDF with no text layer — would need OCR).
  reason: 'unreadable' | 'empty';
  detail?: string;
}

export interface IngestResult {
  collection: Collection;
  trimmed: TrimRecord[];
  evicted: string | null; // name of the collection that was auto-removed to make room
  skipped: SkippedFile[]; // files that could not be indexed; the rest still ingest
}

export interface FileInput {
  name: string;
  buffer: Buffer;
}

/**
 * Thrown by ingestDocuments when the upload cannot produce a collection
 * (currently: no file yielded extractable text). Carries the per-file
 * skip reasons. The route translates this into a 400 ValidationError.
 * Defined here (rather than importing route middleware) to keep this
 * module free of HTTP concerns.
 */
export class IngestError extends Error {
  constructor(
    message: string,
    public skipped: SkippedFile[],
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

// --- In-process MiniSearch cache ---

// Keyed by collection uuid. Evicted on deleteCollection().
const indexCache = new Map<string, MiniSearch>();

// --- Helpers ---

function userDir(username: string): string {
  const hash = createHash('sha256').update(username).digest('hex').slice(0, 16);
  return path.join(INDEX_DIR, hash);
}

function collectionDir(username: string, uuid: string): string {
  return path.join(userDir(username), uuid);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Splits plain text into chunks of at most CHUNK_WORDS words.
 * Splits first at paragraph boundaries (\n\n), then at sentence
 * boundaries for oversized paragraphs.
 */
function chunkText(text: string, source: string): Chunk[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferWords = 0;

  const sealChunk = () => {
    if (buffer.trim()) {
      chunks.push({
        id: randomUUID(),
        text: buffer.trim(),
        source,
        chunkIndex: chunks.length,
        wordCount: bufferWords,
      });
      buffer = '';
      bufferWords = 0;
    }
  };

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (paraWords > CHUNK_WORDS) {
      // Paragraph is too long — seal any buffered content first, then split at sentences.
      sealChunk();
      const sentences = para.split(/(?<=\.\s)(?=[A-Z])/);
      let sentBuffer = '';
      let sentWords = 0;
      for (const sentence of sentences) {
        const sw = countWords(sentence);
        if (sentWords + sw > CHUNK_WORDS && sentBuffer) {
          chunks.push({
            id: randomUUID(),
            text: sentBuffer.trim(),
            source,
            chunkIndex: chunks.length,
            wordCount: sentWords,
          });
          sentBuffer = sentence;
          sentWords = sw;
        } else {
          sentBuffer += (sentBuffer ? ' ' : '') + sentence;
          sentWords += sw;
        }
      }
      if (sentBuffer.trim()) {
        chunks.push({
          id: randomUUID(),
          text: sentBuffer.trim(),
          source,
          chunkIndex: chunks.length,
          wordCount: sentWords,
        });
      }
    } else if (bufferWords + paraWords > CHUNK_WORDS) {
      // Adding this paragraph would overflow the current chunk — seal it and start fresh.
      sealChunk();
      buffer = para;
      bufferWords = paraWords;
    } else {
      buffer += (buffer ? '\n\n' : '') + para;
      bufferWords += paraWords;
    }
  }
  sealChunk();
  return chunks;
}

/**
 * Applies proportional budget: when total chunks exceed MAX_CHUNKS,
 * each document keeps Math.floor(its_share * MAX_CHUNKS) chunks
 * (first N — beginning of a document is most contextually dense).
 */
function applyBudget(docChunks: { source: string; chunks: Chunk[] }[]): {
  chunks: Chunk[];
  trimmed: TrimRecord[];
} {
  const total = docChunks.reduce((n, d) => n + d.chunks.length, 0);
  if (total <= MAX_CHUNKS) {
    return { chunks: docChunks.flatMap((d) => d.chunks), trimmed: [] };
  }

  const trimmed: TrimRecord[] = [];
  const kept: Chunk[] = [];

  for (const doc of docChunks) {
    const raw = doc.chunks.length;
    const budget = Math.max(1, Math.floor((raw / total) * MAX_CHUNKS));
    const keptChunks = doc.chunks.slice(0, budget);
    kept.push(...keptChunks);
    if (budget < raw) {
      trimmed.push({
        source: doc.source,
        rawChunks: raw,
        keptChunks: budget,
        percent: Math.round((budget / raw) * 100),
      });
    }
  }

  return { chunks: kept, trimmed };
}

// Shared MiniSearch options. These MUST be identical between buildMiniSearch()
// (ingest) and the loadJSON() call in retrieve() (disk reload). searchOptions
// are not serialised into the index JSON, so a reload that omits them silently
// disables prefix/fuzzy matching — exact-token queries still hit, but partial
// words and typos return nothing, making search appear to work intermittently
// (in-process cache has them, cold-loaded disk copies did not).
const MINISEARCH_OPTIONS = {
  fields: ['text', 'source'],
  storeFields: ['text', 'source', 'chunkIndex'],
  searchOptions: { boost: { text: 2 }, prefix: true, fuzzy: 0.1 },
};

function buildMiniSearch(chunks: Chunk[]): MiniSearch {
  const ms = new MiniSearch(MINISEARCH_OPTIONS);
  ms.addAll(chunks);
  return ms;
}

// --- TTL sweep ---
// Runs once at module load. Deletes collections older than TTL_HOURS from all user dirs.

if (TTL_HOURS > 0) {
  try {
    const cutoff = Date.now() - TTL_HOURS * 3_600_000;
    if (fs.existsSync(INDEX_DIR)) {
      for (const userHash of fs.readdirSync(INDEX_DIR)) {
        const uDir = path.join(INDEX_DIR, userHash);
        if (!fs.statSync(uDir).isDirectory()) continue;
        for (const uuid of fs.readdirSync(uDir)) {
          const metaPath = path.join(uDir, uuid, 'meta.json');
          if (!fs.existsSync(metaPath)) continue;
          try {
            const meta: CollectionMeta = JSON.parse(
              fs.readFileSync(metaPath, 'utf8'),
            );
            if (new Date(meta.createdAt).getTime() < cutoff) {
              fs.rmSync(path.join(uDir, uuid), {
                recursive: true,
                force: true,
              });
              indexCache.delete(uuid);
            }
          } catch {
            // Corrupt meta — skip silently.
          }
        }
      }
    }
  } catch {
    // TTL sweep failures are non-fatal.
  }
}

// --- Public API ---

/**
 * Returns all collections for a user, sorted by creation date descending.
 * Returns an empty array (not an error) when no collections exist.
 */
export async function getCollections(username: string): Promise<Collection[]> {
  const dir = userDir(username);
  if (!fs.existsSync(dir)) return [];

  const collections: Collection[] = [];
  for (const uuid of fs.readdirSync(dir)) {
    const metaPath = path.join(dir, uuid, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta: CollectionMeta = JSON.parse(
        fs.readFileSync(metaPath, 'utf8'),
      );
      collections.push({
        name: meta.name,
        uuid: meta.uuid,
        size: meta.chunkCount,
        createdAt: meta.createdAt,
      });
    } catch {
      // Corrupt meta — skip.
    }
  }

  return collections.sort((a, b) => (b.uuid ?? '').localeCompare(a.uuid ?? ''));
}

/**
 * Parses, chunks, budgets, indexes, and writes a new collection to disk.
 * Throws ValidationError-shaped objects on limit violations before writing anything.
 */
export async function ingestDocuments(
  username: string,
  files: FileInput[],
): Promise<IngestResult> {
  // Parse all files to plain text first. A single unparseable file (encrypted,
  // malformed, or image-only PDF) must not abort the whole batch — collect
  // failures and continue so the remaining files still ingest.
  const parsed: { source: string; text: string }[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    let text: string;
    if (file.name.endsWith('.pdf')) {
      try {
        const result = await pdfParse(file.buffer);
        text = result.text;
      } catch (err) {
        skipped.push({
          source: file.name,
          reason: 'unreadable',
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    } else {
      text = file.buffer.toString('utf8');
    }

    // A PDF with no text layer (scanned / image-only) parses without error but
    // yields empty text. Skip it with an 'empty' reason rather than creating
    // zero chunks — OCR would be required to extract anything.
    if (!text.trim()) {
      skipped.push({ source: file.name, reason: 'empty' });
      continue;
    }

    parsed.push({ source: file.name, text });
  }

  // Every file failed to parse — surface a clear error rather than writing an
  // empty collection to disk. Nothing has been evicted or written at this point.
  if (parsed.length === 0) {
    throw new IngestError(
      'None of the uploaded files could be processed. ' +
        skipped
          .map(
            (s) =>
              `${s.source} (${s.reason === 'empty' ? 'no extractable text — scanned or image-only PDF' : 'unreadable — encrypted or malformed'})`,
          )
          .join('; '),
      skipped,
    );
  }

  // Only now that we have at least one indexable file do we make room. Evicting
  // before the parse guard would delete the oldest collection even when the
  // whole batch turns out to be unparseable, leaving the user worse off.
  const evicted =
    collectionCount(username) >= MAX_COLS ? evictOldest(username) : null;

  // Chunk each document.
  const docChunks = parsed.map((doc) => ({
    source: doc.source,
    chunks: chunkText(doc.text, doc.source),
  }));

  // Apply proportional budget.
  const { chunks, trimmed } = applyBudget(docChunks);

  // Build and serialise MiniSearch index.
  const ms = buildMiniSearch(chunks);

  // Write to disk.
  const uuid = new Date().toISOString().replace(/[-T:]/g, '').slice(0, 12); // YYYYMMDDHHmm

  const dir = collectionDir(username, uuid);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const meta: CollectionMeta = {
    uuid,
    name: uuid,
    docCount: parsed.length,
    chunkCount: chunks.length,
    createdAt: new Date().toISOString(),
    trimmed,
  };

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(dir, 'chunks.json'),
    JSON.stringify(chunks, null, 2),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify(ms.toJSON(), null, 2),
    { mode: 0o600 },
  );

  // Seed in-process cache.
  indexCache.set(uuid, ms);

  return {
    collection: { name: uuid, uuid, size: chunks.length },
    trimmed,
    evicted,
    skipped,
  };
}

/**
 * Loads (or returns cached) MiniSearch index for the given uuid, runs full-text
 * search, and returns top-N results mapped to the standard Document shape.
 * Template variables ${text} and ${source} are supported.
 */
export async function retrieve(
  uuid: string,
  query: { query?: string } & Record<string, unknown>,
  count: number,
  projectionTemplate: string,
  displayTemplate: string,
): Promise<Document[]> {
  // Determine the query string. The query object may carry it under 'query'
  // (our default query_syntax) or as a plain string.
  const queryString =
    typeof query === 'string'
      ? query
      : typeof query.query === 'string'
        ? query.query
        : JSON.stringify(query);

  // Load index — from cache or disk.
  let ms = indexCache.get(uuid);
  if (!ms) {
    // Scan INDEX_DIR to find the collection dir without needing a username here.
    // The uuid is globally unique (timestamp) so a recursive find is safe.
    const indexPath = findIndexPath(uuid);
    if (!indexPath) {
      throw {
        name: 'ConnectionError',
        message: `Local collection "${uuid}" not found on disk`,
      };
    }
    const raw = fs.readFileSync(indexPath, 'utf8');
    // Pass the same options used at build time — searchOptions (prefix/fuzzy)
    // are not persisted in the index JSON and must be re-supplied here.
    ms = MiniSearch.loadJSON(raw, MINISEARCH_OPTIONS);
    indexCache.set(uuid, ms);
  }

  const results = ms.search(queryString).slice(0, count);

  // Map results to Document[] using the same template-substitution pattern
  // as the Elastic retriever — supports ${text} and ${source}.
  const variablesInProjection: string[] = [];
  const variablesInDisplay: string[] = [];
  let m: RegExpExecArray | null;
  // VARIABLE regex is stateful (/g flag) — must reset between uses.
  VARIABLE.lastIndex = 0;
  while ((m = VARIABLE.exec(projectionTemplate)))
    variablesInProjection.push(m[1]);
  VARIABLE.lastIndex = 0;
  while ((m = VARIABLE.exec(displayTemplate))) variablesInDisplay.push(m[1]);

  return results.map((hit, idx) => {
    const source: Record<string, string> = {
      text: String(hit.text ?? ''),
      source: String(hit.source ?? ''),
    };

    let projected = projectionTemplate;
    variablesInProjection.forEach((v) => {
      projected = projected.replaceAll(`\${${v}}`, source[v] ?? '');
    });

    let formatted = displayTemplate;
    variablesInDisplay.forEach((v) => {
      formatted = formatted.replaceAll(`\${${v}}`, source[v] ?? '');
    });

    return {
      type: 'DOCUMENT' as const,
      document_id: String(hit.id),
      text: projected,
      formatted_text: formatted,
      score: hit.score,
      query,
    };
  });
}

/**
 * Deletes the oldest collection for a user to make room for a new one.
 * Returns the name of the evicted collection, or null if nothing to evict.
 */
export function evictOldest(username: string): string | null {
  const dir = userDir(username);
  if (!fs.existsSync(dir)) return null;

  const entries: { uuid: string; createdAt: string; name: string }[] = [];
  for (const uuid of fs.readdirSync(dir)) {
    const metaPath = path.join(dir, uuid, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta: CollectionMeta = JSON.parse(
        fs.readFileSync(metaPath, 'utf8'),
      );
      entries.push({ uuid, createdAt: meta.createdAt, name: meta.name });
    } catch {
      // Corrupt meta — skip.
    }
  }

  if (entries.length === 0) return null;
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const oldest = entries[0];
  fs.rmSync(path.join(dir, oldest.uuid), { recursive: true, force: true });
  indexCache.delete(oldest.uuid);
  return oldest.name;
}

/**
 * Deletes a collection directory and evicts its index from the in-process cache.
 * Verifies ownership by checking the path is inside the user's directory.
 */
export async function deleteCollection(
  username: string,
  uuid: string,
): Promise<void> {
  const dir = collectionDir(username, uuid);
  if (!fs.existsSync(dir)) return; // idempotent

  // Guard: ensure the resolved path is actually under the user's directory.
  const resolved = fs.realpathSync(dir);
  const userRoot = fs.realpathSync(userDir(username));
  if (!resolved.startsWith(userRoot + path.sep)) {
    throw {
      name: 'AuthorizationError',
      message: 'Collection does not belong to this user',
    };
  }

  fs.rmSync(dir, { recursive: true, force: true });
  indexCache.delete(uuid);
}

/**
 * Returns the number of collections for a user.
 * Used by the ingest route to enforce MAX_COLS before writing.
 */
export function collectionCount(username: string): number {
  const dir = userDir(username);
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir)
    .filter((entry) => fs.existsSync(path.join(dir, entry, 'meta.json')))
    .length;
}

// --- Private helpers ---

function findIndexPath(uuid: string): string | null {
  if (!fs.existsSync(INDEX_DIR)) return null;
  for (const userHash of fs.readdirSync(INDEX_DIR)) {
    const candidate = path.join(INDEX_DIR, userHash, uuid, 'index.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

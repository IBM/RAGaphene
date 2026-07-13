/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { StringMatchObject, SentenceMatchObject } from '@/types/custom';
const crypto = require('crypto');

export function hash(text: string | undefined | null): string {
  if (text == null) return '';
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Returns a filesystem-safe timestamp string derived from the current time.
 * Replaces characters that are invalid in Windows filenames (`:` and `.`).
 * Example: "2026-02-26T10-30-00-000Z"
 */
export function fileTimestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

/**
 * Extracts uppercase initials from a display name (e.g. "John Doe" → "JD").
 * For a single-word name, returns the first two characters (e.g. "workbench" → "WO").
 * Returns an empty string if name is falsy.
 */
export function nameInitials(name?: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts.map((segment) => segment.charAt(0).toUpperCase()).join('');
}

export function escape(str) {
  return str
    .replace(/[\\]/g, '\\\\')
    .replace(/[\"]/g, '\\"')
    .replace(/[\/]/g, '\\/')
    .replace(/[\b]/g, '\\b')
    .replace(/[\f]/g, '\\f')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r')
    .replace(/[\t]/g, '\\t');
}

/**
 * Truncate string to specified character length
 * @param text to be truncated
 * @param length in characters
 * @returns
 */
export function truncate(text: string, length: number): string {
  if (text.length > length) {
    return text.slice(0, length) + ' ...';
  }

  return text;
}

/**
 * Helper functions to identify token boundaries
 * getNextTokenStart: Identifies start of next token
 * getNextTokenEnd: Identified end of next token
 */

/**
 * Identify start of next token
 * @param text
 * @param offset starting offset in the text
 * @returns starting position index of next token
 */
function getNextTokenStart(text: string, offset: number = 0): number {
  // Step 1: Set starting index to provided offset
  var startIndex = offset;

  // Step 2: Skip over non-alphanumeric characters at the start
  while (startIndex < text.length && /\W/.test(text.charAt(startIndex))) {
    startIndex++;
  }

  // Step 3: Return
  return startIndex;
}

/**
 * Identify end of next token
 * @param text
 * @param offset starting offset in the text
 * @returns ending position index of next token
 */
function getNextTokenEnd(text: string, offset: number = 0): number {
  // Step 1: Set end index to be starting index of next token
  var endIndex = getNextTokenStart(text, offset);

  // Step 2: Include alphanumeric characters until the first non-alphanumeric character is found
  while (endIndex < text.length && !/\W/.test(text.charAt(endIndex))) {
    endIndex++;
  }

  return endIndex;
}

/**
 * Create regular expression based on string
 * @param text regular expression string
 * @returns
 */
function createRegex(text: string): RegExp {
  // Escape regular expression characters
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(escapedText, 'g');
}

/**
 * Find matches in the text based on query using regular expression
 * @param query string to find
 * @param text
 * @returns
 */
function match(query: string, text: string) {
  // Step 1: Create regular expression
  const regex = createRegex(query);

  // Step 2: Find matches
  const matches: { readonly start: number; readonly end: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: regex.lastIndex,
    });
  }

  // Step 3: Return
  return matches;
}

/**
 * Normalize text (e.g., characters used for quotes). Used to improve matching.
 * @param text
 * @returns
 */
function normalize(text) {
  var normalizedText = text;
  // normalize double and single quotes
  normalizedText = text.replace(/[""]/g, '"');
  normalizedText = normalizedText.replace(/['']/g, "'");

  return normalizedText;
}

/**
 * Find overlap based on matching tokens between source and target.
 * Returns phrase-level matches (character offsets in normalized source/target).
 * @param source string from which tokens are used to find overlap
 * @param target string in which overlaps are found
 * @param min_match_tokens minimum consecutive tokens required to record a match
 * @returns
 */
export function overlaps(
  source: string,
  target: string,
  min_match_tokens: number = 3,
) {
  // Step 1: Normalize source and target text
  const normalizedSource = normalize(source).toLowerCase();
  const normalizedTarget = normalize(target).toLowerCase();

  // Step 2: Define necessary variables
  const matches: StringMatchObject[] = [];

  // Step 3: Find matches
  let curStartPos = getNextTokenStart(normalizedSource, 0);

  while (curStartPos < normalizedSource.length) {
    let curEndPos = curStartPos;
    let matchTokenLength = 0;
    let substringEndPos = curStartPos;

    // Build up min_match_tokens - 1 tokens in the pre-loop, then the do-while
    // adds one more before the first test, so the minimum candidate is exactly
    // min_match_tokens tokens.
    while (matchTokenLength < min_match_tokens - 1) {
      const next = getNextTokenEnd(normalizedSource, substringEndPos);
      // Guard: stop if we've hit end of string
      if (next >= normalizedSource.length) break;
      substringEndPos = next;
      matchTokenLength++;
    }

    // Greedily extend while the candidate substring is found in the target.
    // Use includes() for the fast existence check; call match() only once
    // after the loop to record exact positions.
    do {
      substringEndPos = getNextTokenEnd(normalizedSource, substringEndPos);
      const candidate = normalizedSource.substring(
        curStartPos,
        substringEndPos,
      );
      if (normalizedTarget.includes(candidate)) {
        curEndPos = substringEndPos;
      } else {
        break;
      }
    } while (curEndPos < normalizedSource.length);

    if (curEndPos !== curStartPos) {
      const localMatches: { start: number; end: number }[] = match(
        normalizedSource.substring(curStartPos, curEndPos),
        normalizedTarget,
      );
      matches.push({
        start: curStartPos,
        end: curEndPos,
        text: normalizedSource.substring(curStartPos, curEndPos),
        matchesInTarget: localMatches,
        count: localMatches.length,
      });

      curStartPos = getNextTokenStart(normalizedSource, curEndPos);
    } else {
      curStartPos = getNextTokenStart(
        normalizedSource,
        getNextTokenEnd(normalizedSource, curEndPos),
      );
    }
  }

  return matches;
}

// ===================================================================================
//                         COVERAGE HELPERS
// ===================================================================================

/**
 * Compute what fraction (0–1) of the source (response) characters are covered by
 * any phrase match across all retrieved documents.
 *
 * phraseMatches[i].start/end are offsets into the normalized source text, which
 * has the same character length as the original source — normalization only swaps
 * quote characters, it does not change the length.
 *
 * @param overlaps  result of calling sentenceOverlaps() for each context document
 * @param sourceLength  character length of the response text (message.text.length)
 */
export function aggregateCoverage(
  overlaps: SentenceMatchObject[][],
  sourceLength: number,
): number {
  if (overlaps.length === 0 || sourceLength === 0) return 0;

  // Collect all phrase match spans from source offsets across all documents
  const spans: { start: number; end: number }[] = overlaps
    .flatMap((sentences) => sentences.flatMap((s) => s.phraseMatches))
    .map((pm) => ({ start: pm.start, end: pm.end }));

  if (spans.length === 0) return 0;

  // Sort by start position, then merge overlapping/adjacent intervals
  spans.sort((a, b) => a.start - b.start);

  let covered = 0;
  let curStart = -1;
  let curEnd = -1;

  for (const span of spans) {
    if (span.start > curEnd) {
      if (curEnd >= 0) covered += curEnd - curStart;
      curStart = span.start;
      curEnd = span.end;
    } else {
      curEnd = Math.max(curEnd, span.end);
    }
  }
  if (curEnd >= 0) covered += curEnd - curStart;

  return Math.min(covered / sourceLength, 1);
}

/**
 * Compute a per-document overlap strength as the average Jaccard score across
 * all sentences that passed the relevance threshold for that document.
 *
 * @param sentences  result of sentenceOverlaps() for one context document
 */
export function documentScore(sentences: SentenceMatchObject[]): number {
  if (sentences.length === 0) return 0;
  return sentences.reduce((acc, s) => acc + s.score, 0) / sentences.length;
}

// ===================================================================================
//                         SENTENCE-LEVEL HELPERS
// ===================================================================================

/**
 * Split text into sentences, preserving character offsets.
 */
function splitIntoSentences(
  text: string,
): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = [];

  // Match sentence boundaries: optional leading whitespace + punctuation +
  // trailing whitespace. Handles both normal ("word. Next") and tokenized
  // ("word . Next") formats where punctuation is space-separated.
  const re = /\s*[.!?]+\s+/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // The sentence content ends at the start of the punctuation match,
    // so the span covers only the words — not the trailing punctuation/spaces.
    const contentEnd = m.index;
    const rawText = text.substring(lastIndex, contentEnd);
    const trimmed = rawText.trim();
    if (trimmed.length > 0) {
      const leadingSpace = rawText.indexOf(trimmed[0]);
      const start = lastIndex + leadingSpace;
      const end = start + trimmed.length;
      sentences.push({ text: trimmed, start, end });
    }
    lastIndex = m.index + m[0].length;
  }

  // Remainder after last sentence-ending punctuation
  if (lastIndex < text.length) {
    const rawText = text.substring(lastIndex);
    const trimmed = rawText.trim();
    if (trimmed.length > 0) {
      const leadingSpace = rawText.indexOf(trimmed[0]);
      const start = lastIndex + leadingSpace;
      const end = start + trimmed.length;
      sentences.push({ text: trimmed, start, end });
    }
  }

  return sentences;
}

// Common English stop words excluded from Jaccard scoring so that shared
// function words (the, in, of, a, …) don't inflate sentence relevance scores.
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'they',
  'their',
  'them',
  'he',
  'she',
  'his',
  'her',
  'who',
  'which',
  'what',
  'when',
  'where',
  'how',
  'not',
  'no',
  'also',
  'after',
  'into',
  'over',
  'up',
  'as',
  's',
]);

/**
 * Build a set of content tokens from text, excluding stop words.
 * Used for Jaccard scoring so common function words don't inflate scores.
 */
function buildTokenSet(text: string): Set<string> {
  return new Set(
    normalize(text)
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

/**
 * Jaccard similarity between response token set and sentence token set.
 * Score = |intersection| / |union|
 */
function jaccardScore(
  responseTokens: Set<string>,
  sentenceTokens: Set<string>,
): number {
  if (responseTokens.size === 0 || sentenceTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of sentenceTokens) {
    if (responseTokens.has(token)) intersection++;
  }

  const union = responseTokens.size + sentenceTokens.size - intersection;
  return intersection / union;
}

/**
 * Two-level overlap: score each sentence in `target` against `source` and,
 * for sentences above the score threshold, find phrase-level matches within them.
 *
 * @param source the LLM response text
 * @param target a context document text
 * @param options.minScore minimum Jaccard score (0–1) to include a sentence (default 0.15)
 * @param options.minPhraseTokens minimum consecutive tokens for phrase matching (default 3)
 * @returns array of SentenceMatchObject, one per relevant sentence
 */
export function sentenceOverlaps(
  source: string,
  target: string,
  options: { minScore?: number; minPhraseTokens?: number } = {},
): SentenceMatchObject[] {
  const { minScore = 0.08, minPhraseTokens = 3 } = options;

  const responseTokens = buildTokenSet(source);
  const sentences = splitIntoSentences(target);
  const result: SentenceMatchObject[] = [];

  for (const sentence of sentences) {
    const sentenceTokens = buildTokenSet(sentence.text);
    const score = jaccardScore(responseTokens, sentenceTokens);

    if (score >= minScore) {
      // Phrase-level matching within this sentence only
      const phraseMatches = overlaps(source, sentence.text, minPhraseTokens);
      result.push({
        start: sentence.start,
        end: sentence.end,
        text: sentence.text,
        score,
        phraseMatches,
      });
    }
  }

  return result;
}

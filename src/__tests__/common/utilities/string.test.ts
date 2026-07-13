/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  hash,
  escape,
  truncate,
  overlaps,
  sentenceOverlaps,
} from '@/src/common/utilities/string';

describe('hash', () => {
  it('returns a hex string', () => {
    const result = hash('hello');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input produces same output', () => {
    expect(hash('test input')).toBe(hash('test input'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hash('abc')).not.toBe(hash('xyz'));
  });

  it('returns the known MD5 of "hello"', () => {
    // MD5('hello') = 5d41402abc4b2a76b9719d911017c592
    expect(hash('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });
});

describe('escape', () => {
  it('escapes backslashes', () => {
    expect(escape('a\\b')).toBe('a\\\\b');
  });

  it('escapes double quotes', () => {
    expect(escape('say "hi"')).toBe('say \\"hi\\"');
  });

  it('escapes forward slashes', () => {
    expect(escape('a/b')).toBe('a\\/b');
  });

  it('escapes newlines', () => {
    expect(escape('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes tabs', () => {
    expect(escape('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('escapes carriage returns', () => {
    expect(escape('a\rb')).toBe('a\\rb');
  });

  it('passes through plain text unchanged', () => {
    expect(escape('hello world')).toBe('hello world');
  });
});

describe('truncate', () => {
  it('returns the original string when shorter than limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the original string when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends " ..." when longer than limit', () => {
    expect(truncate('hello world', 5)).toBe('hello ...');
  });

  it('truncates to zero characters', () => {
    expect(truncate('hello', 0)).toBe(' ...');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('overlaps', () => {
  it('finds matching tokens between source and target', () => {
    const result = overlaps(
      'the quick brown fox',
      'I saw the quick brown fox jump',
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('text');
    expect(result[0]).toHaveProperty('matchesInTarget');
    expect(result[0]).toHaveProperty('count');
  });

  it('returns empty array when there is no overlap', () => {
    const result = overlaps('apple orange grape', 'xyz abc def ghi jkl mno');
    expect(result).toEqual([]);
  });

  it('returns empty array when source tokens do not appear in target', () => {
    // Tokens in source are completely absent from target
    const result = overlaps(
      'alpha beta gamma delta',
      'xyz abc def ghi jkl mno',
      3,
    );
    expect(result).toEqual([]);
  });

  it('respects a custom min_match_tokens of 1', () => {
    const result = overlaps('hello world extra padding', 'hello there', 1);
    expect(result.length).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const lower = overlaps(
      'quick brown fox jumps',
      'the quick brown fox jumps over',
    );
    const upper = overlaps(
      'QUICK BROWN FOX JUMPS',
      'the quick brown fox jumps over',
    );
    expect(lower.length).toEqual(upper.length);
  });

  it('normalises curly quotes before matching', () => {
    // curly double-quote vs straight double-quote should match
    const result = overlaps(
      '\u201chello world test\u201d',
      '"hello world test"',
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('each match object has start, end, text, matchesInTarget, count', () => {
    const result = overlaps(
      'the quick brown fox jumps',
      'the quick brown fox jumps over the lazy dog',
    );
    expect(result.length).toBeGreaterThan(0);
    const match = result[0];
    expect(typeof match.start).toBe('number');
    expect(typeof match.end).toBe('number');
    expect(typeof match.text).toBe('string');
    expect(Array.isArray(match.matchesInTarget)).toBe(true);
    expect(typeof match.count).toBe('number');
  });

  it('does not produce false positives for short trailing fragments', () => {
    // A source with a trailing word shorter than min_match_tokens that does NOT
    // appear in target should yield zero matches.
    const result = overlaps(
      'alpha beta gamma zyx',
      'alpha beta gamma delta',
      3,
    );
    // "alpha beta gamma" should match, but "zyx" should not extend it or create
    // a spurious standalone match
    const matchTexts = result.map((m) => m.text);
    expect(matchTexts.every((t) => !t.includes('zyx'))).toBe(true);
  });
});

describe('sentenceOverlaps', () => {
  it('returns sentences above the relevance threshold', () => {
    const source = 'The quick brown fox jumps over the lazy dog';
    const target =
      'The quick brown fox jumps over the lazy dog. Some unrelated content here.';
    const result = sentenceOverlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('returns empty array when no sentence meets the threshold', () => {
    const source = 'alpha beta gamma delta epsilon';
    const target = 'xyz abc def. pqr stu vwx.';
    const result = sentenceOverlaps(source, target);
    expect(result).toEqual([]);
  });

  it('each result has start, end, text, score, phraseMatches', () => {
    const source = 'the quick brown fox jumps over the lazy dog';
    const target =
      'The quick brown fox jumps over the lazy dog. Other text here.';
    const result = sentenceOverlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
    const entry = result[0];
    expect(typeof entry.start).toBe('number');
    expect(typeof entry.end).toBe('number');
    expect(typeof entry.text).toBe('string');
    expect(typeof entry.score).toBe('number');
    expect(entry.score).toBeGreaterThanOrEqual(0);
    expect(entry.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(entry.phraseMatches)).toBe(true);
  });

  it('phrase matches are within the matched sentence', () => {
    const source = 'quick brown fox jumps over';
    const target =
      'The quick brown fox jumps over the lazy dog. Unrelated sentence.';
    const result = sentenceOverlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
    // phraseMatches positions should be relative to the sentence text
    const sentence = result[0];
    for (const phrase of sentence.phraseMatches) {
      for (const m of phrase.matchesInTarget) {
        expect(m.start).toBeGreaterThanOrEqual(0);
        expect(m.end).toBeLessThanOrEqual(sentence.text.length);
      }
    }
  });

  it('respects a custom minScore threshold', () => {
    const source = 'the quick brown fox';
    const target = 'The quick brown fox jumps. Some other sentence here.';
    const highThreshold = sentenceOverlaps(source, target, { minScore: 0.9 });
    const lowThreshold = sentenceOverlaps(source, target, { minScore: 0.01 });
    // High threshold should return fewer (or equal) results than low threshold
    expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
  });

  it('is case-insensitive', () => {
    const lower = sentenceOverlaps(
      'quick brown fox jumps',
      'The quick brown fox jumps over the lazy dog.',
    );
    const upper = sentenceOverlaps(
      'QUICK BROWN FOX JUMPS',
      'The quick brown fox jumps over the lazy dog.',
    );
    expect(lower.length).toEqual(upper.length);
  });
});

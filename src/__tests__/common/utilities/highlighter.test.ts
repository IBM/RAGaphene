/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  mark,
  markWithSentences,
  extractMatchesInTarget,
} from '@/src/common/utilities/highlighter';
import { StringMatchObject, SentenceMatchObject } from '@/types/custom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch(
  start: number,
  end: number,
  text: string,
  targetStart: number,
  targetEnd: number,
): StringMatchObject {
  return {
    start,
    end,
    text,
    matchesInTarget: [{ start: targetStart, end: targetEnd }],
    count: 1,
  };
}

// ---------------------------------------------------------------------------
// extractMatchesInTarget
// ---------------------------------------------------------------------------

describe('extractMatchesInTarget', () => {
  it('sorts by target start position', () => {
    const matches: StringMatchObject[] = [
      makeMatch(10, 15, 'world', 20, 25),
      makeMatch(0, 5, 'hello', 5, 10),
    ];
    const result = extractMatchesInTarget(matches);
    expect(result[0].start).toBe(5);
    expect(result[1].start).toBe(20);
  });

  it('extracts first matchesInTarget entry', () => {
    const match: StringMatchObject = {
      start: 0,
      end: 5,
      text: 'hello',
      matchesInTarget: [
        { start: 3, end: 8 },
        { start: 20, end: 25 },
      ],
      count: 2,
    };
    const result = extractMatchesInTarget([match]);
    expect(result[0]).toEqual({ start: 3, end: 8, text: 'hello' });
  });
});

// ---------------------------------------------------------------------------
// mark — source mode
// ---------------------------------------------------------------------------

describe('mark (source mode)', () => {
  it('wraps matched text in copiedText span', () => {
    const text = 'hello world there';
    // match: "world" at positions 6–11 in source, target position 0–5
    const matches: StringMatchObject[] = [makeMatch(6, 11, 'world', 0, 5)];
    const result = mark(text, matches, 'source');
    expect(result).toContain("class='copiedText'");
    expect(result).toContain('world');
  });

  it('emits gap text in plain spans', () => {
    const text = 'hello world there';
    const matches: StringMatchObject[] = [makeMatch(6, 11, 'world', 0, 5)];
    const result = mark(text, matches, 'source');
    // "hello " should be in a plain span (no class)
    expect(result).toContain('<span>hello </span>');
  });

  it('emits trailing text after last match in a plain span', () => {
    const text = 'hello world there';
    const matches: StringMatchObject[] = [makeMatch(6, 11, 'world', 0, 5)];
    const result = mark(text, matches, 'source');
    expect(result).toContain('<span> there</span>');
  });

  it('does not duplicate characters at match boundaries', () => {
    const text = 'abcde';
    // match covers positions 1–4 ("bcd")
    const matches: StringMatchObject[] = [makeMatch(1, 4, 'bcd', 0, 3)];
    const result = mark(text, matches, 'source');
    // strip all tags and verify the plain text is identical to input
    const stripped = result.replace(/<[^>]+>/g, '');
    expect(stripped).toBe(text);
  });

  it('handles overlapping matches gracefully (skips later overlap)', () => {
    const text = 'abcdefgh';
    const matches: StringMatchObject[] = [
      makeMatch(0, 5, 'abcde', 0, 5),
      makeMatch(3, 8, 'defgh', 3, 8), // overlaps with first
    ];
    const result = mark(text, matches, 'source');
    const stripped = result.replace(/<[^>]+>/g, '');
    expect(stripped).toBe(text);
  });

  it('returns plain span for entire text when no matches', () => {
    const text = 'hello world';
    const result = mark(text, [], 'source');
    expect(result).toContain('hello world');
  });
});

// ---------------------------------------------------------------------------
// mark — target mode
// ---------------------------------------------------------------------------

describe('mark (target mode)', () => {
  it('wraps matched text in copiedText span with id', () => {
    const text = 'the quick brown fox';
    const matches: StringMatchObject[] = [makeMatch(0, 9, 'the quick', 0, 9)];
    const result = mark(text, matches, 'target');
    expect(result).toContain("class='copiedText'");
    expect(result).toContain('the quick');
  });

  it('does not duplicate characters at match boundaries', () => {
    const text = 'hello world foo';
    const matches: StringMatchObject[] = [makeMatch(6, 11, 'world', 6, 11)];
    const result = mark(text, matches, 'target');
    const stripped = result.replace(/<[^>]+>/g, '');
    expect(stripped).toBe(text);
  });

  it('skips overlapping target matches without corrupting text', () => {
    const text = 'abcdefgh';
    const matches: StringMatchObject[] = [
      makeMatch(0, 5, 'abcde', 0, 5),
      makeMatch(3, 8, 'defgh', 3, 8),
    ];
    const result = mark(text, matches, 'target');
    const stripped = result.replace(/<[^>]+>/g, '');
    expect(stripped).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// markWithSentences
// ---------------------------------------------------------------------------

describe('markWithSentences', () => {
  it('emits relevant sentence text without a wrapper span', () => {
    const text = 'The quick brown fox jumps. Some other sentence.';
    const sentences: SentenceMatchObject[] = [
      {
        start: 0,
        end: 25,
        text: 'The quick brown fox jumps',
        score: 0.5,
        phraseMatches: [],
      },
    ];
    const result = markWithSentences(text, sentences);
    expect(result).not.toContain("class='relevantSentence'");
    expect(result).toContain('The quick brown fox jumps');
  });

  it('emits non-relevant text as plain text', () => {
    const text = 'The quick brown fox jumps. Some other sentence.';
    const sentences: SentenceMatchObject[] = [
      {
        start: 0,
        end: 25,
        text: 'The quick brown fox jumps',
        score: 0.5,
        phraseMatches: [],
      },
    ];
    const result = markWithSentences(text, sentences);
    expect(result).toContain('Some other sentence.');
  });

  it('applies copiedText spans for phrase matches within sentence', () => {
    const text = 'The quick brown fox jumps. Some other sentence.';
    const sentences: SentenceMatchObject[] = [
      {
        start: 0,
        end: 26,
        text: 'The quick brown fox jumps.',
        score: 0.5,
        phraseMatches: [
          {
            start: 0,
            end: 9,
            text: 'the quick',
            matchesInTarget: [{ start: 4, end: 9 }], // "quick" within sentence text
            count: 1,
          },
        ],
      },
    ];
    const result = markWithSentences(text, sentences);
    expect(result).toContain("class='copiedText'");
  });

  it('does not duplicate characters', () => {
    const text = 'Sentence one here. Sentence two here.';
    // end=17: tight end just past last word char ("here" ends at index 16),
    // before the ". " separator. Matches what splitIntoSentences now produces.
    const sentences: SentenceMatchObject[] = [
      {
        start: 0,
        end: 17,
        text: 'Sentence one here',
        score: 0.4,
        phraseMatches: [],
      },
    ];
    const result = markWithSentences(text, sentences);
    const stripped = result.replace(/<[^>]+>/g, '');
    expect(stripped).toBe(text);
  });

  it('returns plain text unchanged when sentences array is empty', () => {
    const text = 'Nothing relevant here.';
    const result = markWithSentences(text, []);
    expect(result).toBe(text);
  });
});

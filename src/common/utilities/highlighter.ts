/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 *
 * Copyright 2023-Present InspectorRAGet Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **/

import { StringMatchObject, SentenceMatchObject } from '@/types/custom';

export function extractMatchesInTarget(
  matches: StringMatchObject[],
): { start: number; end: number; text: string }[] {
  // Step 1: Sort matches based on starting index of matches in the target
  const orderedMatches: StringMatchObject[] = Array.from(matches).toSorted(
    function (a: StringMatchObject, b: StringMatchObject) {
      return a.matchesInTarget[0].start - b.matchesInTarget[0].start;
    },
  );

  // Step 2: Return first match from target
  return orderedMatches.map((entry: StringMatchObject) => {
    return {
      start: entry.matchesInTarget[0].start,
      end: entry.matchesInTarget[0].end,
      text: entry.text,
    };
  });
}

/**
 * Add span tags in the text to create highlighting effect.
 * Used for source (response) highlighting with 'copiedText' spans.
 * @param text
 * @param matches
 * @param type
 * @returns
 */
export function mark(
  text: string,
  matches: StringMatchObject[],
  type: 'source' | 'target',
) {
  let markedText = '';
  let curTextPos = 0;
  let curMatchListIdx = 0;

  const matchesToMark =
    type === 'source' ? matches : extractMatchesInTarget(matches);

  while (curTextPos < text.length && curMatchListIdx < matchesToMark.length) {
    let currentMatch = matchesToMark[curMatchListIdx];
    let currentMatchStart = currentMatch.start;
    let currentMatchEnd = currentMatch.end;

    // Skip match entirely if it overlaps with already-emitted text
    if (currentMatchStart < curTextPos) {
      curMatchListIdx++;
      continue;
    }

    if (curTextPos < currentMatchStart) {
      if (type === 'source') {
        markedText += `<span>${text.substring(
          curTextPos,
          currentMatchStart,
        )}</span>`;
      } else if (type === 'target') {
        markedText += text.substring(curTextPos, currentMatchStart);
      }
      curTextPos = currentMatchStart;
    }

    // Add info on the context match mapping
    if (type === 'source') {
      // @ts-expect-error
      const contextMatchStart = currentMatch.matchesInTarget[0].start;
      // @ts-expect-error
      const contextMatchEnd = currentMatch.matchesInTarget[0].end;

      markedText += `<span class='copiedText' context-match-id='${contextMatchStart}-${contextMatchEnd}'>${text.substring(
        currentMatchStart,
        currentMatchEnd,
      )}</span>`;
    } else if (type === 'target') {
      markedText += `<span class='copiedText' id='${currentMatchStart}-${currentMatchEnd}'>${text.substring(
        currentMatchStart,
        currentMatchEnd,
      )}</span>`;
    }
    curTextPos = currentMatchEnd;
    curMatchListIdx++;
  }

  if (curTextPos < text.length) {
    if (type === 'source') {
      markedText += `<span>${text.substring(curTextPos, text.length)}</span>`;
    } else if (type === 'target') {
      markedText += text.substring(curTextPos, text.length);
    }
  }

  return markedText;
}

/**
 * Wrap context document text with two levels of highlighting:
 *   1. Relevant sentences get a light `relevantSentence` background span.
 *   2. Phrase matches within those sentences get a `copiedText` span.
 *
 * Sentences not above the relevance threshold are emitted as plain text.
 *
 * @param text  full context document text
 * @param sentences  result of sentenceOverlaps()
 * @returns HTML string ready for dangerouslySetInnerHTML / rehype-raw
 */
export function markWithSentences(
  text: string,
  sentences: SentenceMatchObject[],
): string {
  let result = '';
  let curTextPos = 0;

  // Sentences are already in document order (splitIntoSentences preserves order)
  for (const sentence of sentences) {
    // Emit any gap before this sentence as plain text
    if (curTextPos < sentence.start) {
      result += text.substring(curTextPos, sentence.start);
    }

    // Use sentence.text (the exact string overlaps() was called with) so that
    // phrase offsets in matchesInTarget align perfectly with the text being marked.
    const phraseHtml = markPhrasesInSentence(
      sentence.text,
      sentence.phraseMatches,
    );

    result += phraseHtml;
    curTextPos = sentence.end;
  }

  // Emit remaining text after last sentence
  if (curTextPos < text.length) {
    result += text.substring(curTextPos);
  }

  return result;
}

/**
 * Apply phrase-level `copiedText` spans within a single sentence.
 * phraseMatches[].matchesInTarget positions are offsets into sentenceText
 * (0-based, as returned by overlaps(source, sentence.text)).
 */
function markPhrasesInSentence(
  sentenceText: string,
  phraseMatches: StringMatchObject[],
): string {
  if (phraseMatches.length === 0) {
    return sentenceText;
  }

  let result = '';
  let curPos = 0;

  for (const phrase of phraseMatches) {
    // phrase.matchesInTarget holds positions in the sentence (target of overlaps())
    for (const targetMatch of phrase.matchesInTarget) {
      const start = targetMatch.start;
      const end = targetMatch.end;

      if (start < curPos) continue; // overlapping, skip

      if (curPos < start) {
        result += sentenceText.substring(curPos, start);
      }

      result += `<span class='copiedText'>${sentenceText.substring(start, end)}</span>`;
      curPos = end;
    }
  }

  if (curPos < sentenceText.length) {
    result += sentenceText.substring(curPos);
  }

  return result;
}

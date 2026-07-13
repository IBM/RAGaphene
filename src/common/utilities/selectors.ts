/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extract user selected text using document APIs
 * @returns
 */
export function extractMouseSelection(): [string, number[]] {
  var text = '';
  var offsets = [-1, -1];
  const selection = window.getSelection() || document.getSelection();

  if (selection && selection.type === 'Range') {
    // Extract text
    text = selection.toString();

    // Extract offsets
    const anchorOffset = selection.anchorOffset;
    const focusOffset = selection.focusOffset;
    offsets =
      anchorOffset <= focusOffset
        ? [anchorOffset, focusOffset]
        : [focusOffset, anchorOffset];
  }
  return [text, offsets];
}

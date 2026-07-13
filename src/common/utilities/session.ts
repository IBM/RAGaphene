/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conversation } from '@/types/custom';

// ===================================================================================
//                               TYPES
// ===================================================================================
export interface ReviewSession {
  fileKey: string;
  conversations: Conversation[];
  conversationIdx: number;
  savedAt: number;
}

// ===================================================================================
//                               CONSTANTS
// ===================================================================================
const SESSION_KEY = 'workbench.review.session';

// ===================================================================================
//                               FUNCTIONS
// ===================================================================================
export function saveSession(
  fileKey: string,
  conversations: Conversation[],
  conversationIdx: number,
): void {
  try {
    const payload: ReviewSession = {
      fileKey,
      conversations,
      conversationIdx,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Silently fail if sessionStorage quota is exceeded or unavailable
  }
}

export function loadSession(fileKey: string): ReviewSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: ReviewSession = JSON.parse(raw);
    if (parsed.fileKey !== fileKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Silently fail
  }
}

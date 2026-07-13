/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useSession } from 'next-auth/react';
import { useReducer } from 'react';

import { Conversation } from '@/types/custom';
import { useConfiguration } from '@/src/common/state/configuration';
import { saveSession, clearSession } from '@/src/common/utilities/session';

import Login from '@/src/components/login/Login';
import Configure from '@/src/views/review/Configure';
import Reviewer from '@/src/components/reviewer/Reviewer';

// ===================================================================================
//                               STATE / REDUCER
// ===================================================================================

// Two phases in the review lifecycle:
//   'configuring' — user is on the Configure screen (file upload / session restore).
//   'reviewing'   — user is on the Reviewer screen working through conversations.
// All six fields change together as a group on each phase transition; grouping them
// here makes every transition atomic and explicit.
type ReviewPhase = 'configuring' | 'reviewing';

interface ReviewState {
  phase: ReviewPhase;
  conversations: Conversation[];
  conversationIdx: number;
  fileKey: string;
  fileName: string;
  isDirty: boolean;
}

type ReviewAction =
  | {
      type: 'PROCEED';
      conversations: Conversation[];
      fileKey: string;
      fileName: string;
      conversationIdx: number;
      isDirty: boolean;
    }
  | {
      type: 'UPDATE_CONVERSATIONS';
      conversations: Conversation[];
      conversationIdx: number;
    }
  | { type: 'NAVIGATE'; conversationIdx: number }
  | { type: 'MARK_CLEAN' };

const initialState: ReviewState = {
  phase: 'configuring',
  conversations: [],
  conversationIdx: 0,
  fileKey: '',
  fileName: '',
  isDirty: false,
};

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    // Configure.onProceed — fresh upload or session resume
    case 'PROCEED':
      return {
        phase: 'reviewing',
        conversations: action.conversations,
        conversationIdx: action.conversationIdx,
        fileKey: action.fileKey,
        fileName: action.fileName,
        isDirty: action.isDirty,
      };

    // Reviewer.updateConversations — accept/reject/edit sets dirty
    case 'UPDATE_CONVERSATIONS':
      return {
        ...state,
        conversations: action.conversations,
        conversationIdx: action.conversationIdx,
        isDirty: true,
      };

    // Reviewer.onConversationIdxChange — navigation only, dirty unchanged
    case 'NAVIGATE':
      return { ...state, conversationIdx: action.conversationIdx };

    // Reviewer.onMarkClean — post-export resets dirty flag
    case 'MARK_CLEAN':
      return { ...state, isDirty: false };
  }
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Review() {
  // Step 1: Initialize state and necessary variables
  const [state, dispatch] = useReducer(reviewReducer, initialState);
  const { phase, conversations, conversationIdx, fileKey, fileName, isDirty } =
    state;

  // Step 2: Run effects
  // Step 2.a: Get current session
  const { data: session } = useSession();

  // Step 2.b: Get system configuration
  const { configuration } = useConfiguration();

  // Step 3: Define updateConversations wrapper that persists to sessionStorage
  // Side-effects (saveSession) must stay here — reducers must be pure.
  function updateConversations(updated: Conversation[], idx?: number) {
    const nextIdx = idx !== undefined ? idx : conversationIdx;
    dispatch({
      type: 'UPDATE_CONVERSATIONS',
      conversations: updated,
      conversationIdx: nextIdx,
    });
    saveSession(fileKey, updated, nextIdx);
  }

  // Step 4: Render
  if (configuration.authenticator.enabled && !session) {
    return <Login />;
  } else if (phase === 'configuring') {
    return (
      <Configure
        onProceed={(
          conversations: Conversation[],
          key: string,
          name: string,
          idx: number = 0,
          resumed: boolean = false,
        ) => {
          // Clamp the saved index to valid bounds — a re-uploaded file may have
          // fewer conversations than when the session was saved.
          const safeIdx = Math.min(idx, Math.max(0, conversations.length - 1));
          dispatch({
            type: 'PROCEED',
            conversations,
            fileKey: key,
            fileName: name,
            conversationIdx: safeIdx,
            isDirty: resumed,
          });
          saveSession(key, conversations, safeIdx);
        }}
      />
    );
  } else {
    return (
      <Reviewer
        user={
          session ? session.user : { username: 'System', firstName: 'System' }
        }
        conversations={conversations}
        conversationIdx={conversationIdx}
        fileName={fileName}
        isDirty={isDirty}
        updateConversations={updateConversations}
        onMarkClean={() => {
          dispatch({ type: 'MARK_CLEAN' });
          clearSession();
        }}
        onConversationIdxChange={(idx: number) => {
          dispatch({ type: 'NAVIGATE', conversationIdx: idx });
          saveSession(fileKey, conversations, idx);
        }}
        plugins={configuration.plugins}
      />
    );
  }
}

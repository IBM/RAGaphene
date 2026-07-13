/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty, has, sum, last } from 'lodash';
import { useEffect, useState } from 'react';

import { ActionableNotification, InlineNotification } from '@carbon/react';

import { Message, Hint } from '@/types/custom';
import {
  validateContextsRelevancy,
  validateAnswerabilityAndRelevancy,
} from '@/src/common/utilities/validators';
import { hash } from '@/src/common/utilities/string';
import classes from './Hints.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  messages: Message[];
}

// ===================================================================================
//                                RENDER FUNCTIONS
// ===================================================================================
export default function Hints({ messages }: Props) {
  const [hints, setHints] = useState<Hint[]>([]);

  // Step 1: Run effects
  // Step 1.a: Find hints
  useEffect(() => {
    // Reset hints, if messages are reset
    if (messages.length === 0) {
      setHints([]);
    } else {
      const lastMessage = last(messages);
      if (
        lastMessage &&
        lastMessage.speaker === 'agent' &&
        lastMessage.text !== 'Loading...'
      ) {
        // Step 1: Initialize necessary variables
        const candidates: Hint[] = [];
        const turns = messages.length / 2;
        const totalEdits = sum(
          messages.map((m) =>
            has(m, ['originalText']) &&
            has(m, ['text']) &&
            m['originalText'] != m['text']
              ? 1
              : 0,
          ),
        );

        // Step 2: Low number of edits check
        if (turns > 2 && totalEdits < turns / 3) {
          candidates.push({
            title: 'Low number of edits detected',
            subtitle:
              'We notice you have edited low number of the agent responses. Make sure responses are faithful, factual, and accurate.',
            kind: 'warning',
          });
        }

        // Step 3: Check context relevance feedback conditioned on user message answerability enrichment
        // Category 1: If question is tagged as answerable or partially answerable and no passage is marked as relevant, provide hint
        // Category 2: If question is tagged as unanswerable and a passage is marked as relevant, provide hint
        const InvalidFeedbackErrors =
          validateAnswerabilityAndRelevancy(messages);
        if (!isEmpty(InvalidFeedbackErrors)) {
          InvalidFeedbackErrors.forEach((r) => {
            candidates.push({
              title: r.kind,
              subtitle: r.recommendation,
              kind: 'error',
            });
          });
        }

        // Step 4: Check context relevance feedback
        const contextVerificationError = validateContextsRelevancy(
          messages.slice(0, -2),
        );
        if (turns >= 2 && contextVerificationError) {
          candidates.push({
            title: contextVerificationError.kind,
            subtitle: `Please ensure that all passages are checked for relevance. We found ${contextVerificationError.data.length} unverified passages for previous responses.`,
            kind: 'error',
          });
        }

        // Step 5: Update hints
        setHints(candidates.filter((candidate) => candidate.kind === 'error'));
      }
    }
  }, [messages]);

  // Step 2: Render
  return (
    <>
      {!isEmpty(hints) ? (
        <div className={classes.container} key={`hint-${hints.length}`}>
          {hints.map((hint) => (
            <div key={`hint-${hash(hint.title)}`} className={classes.hint}>
              {hint.onActionButtonClick ? (
                <ActionableNotification
                  inline
                  hideCloseButton={false}
                  title={hint.title}
                  kind={hint.kind}
                  subtitle={hint.subtitle}
                  onActionButtonClick={hint.onActionButtonClick}
                  onCloseButtonClick={() => {
                    setHints(
                      hints.filter((entry) => entry.title !== hint.title),
                    );
                  }}
                ></ActionableNotification>
              ) : (
                <InlineNotification
                  hideCloseButton={hint.kind === 'error' ? true : false}
                  title={hint.title}
                  kind={hint.kind}
                  subtitle={hint.subtitle}
                  onCloseButtonClick={() => {
                    setHints(
                      hints.filter((entry) => entry.title !== hint.title),
                    );
                  }}
                ></InlineNotification>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

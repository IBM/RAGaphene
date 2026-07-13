/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useState, useMemo } from 'react';
import { Modal, TextInput, TextArea, CodeSnippet } from '@carbon/react';

import { ActiveRetriever, ActiveGenerator, Message } from '@/types/custom';
import {
  formatMessages,
  formatRetriever,
  formatGenerator,
} from '@/src/common/utilities/formatter';

import classes from './ReportConversation.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  retriever: ActiveRetriever;
  generator: ActiveGenerator;
  messages: Message[];
  onClose: Function;
  open: boolean;
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================
export default function ReportConversation({
  retriever,
  generator,
  messages,
  onClose,
  open = false,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Step 2: Run effects
  // Step 2.a: Format conversation
  const formattedConversation = useMemo(() => {
    return JSON.stringify(
      {
        author: 'annonymous',
        ...(retriever && { retriever: formatRetriever(retriever) }),
        ...(generator && { generator: formatGenerator(generator) }),
        messages: formatMessages(messages),
        status: 'created',
        status_history: [
          {
            author: 'anonymous',
            status: 'created',
            timestamp: Math.floor(Date.now() / 1000),
          },
        ],
      },
      null,
      2,
    );
  }, [retriever, generator, messages]);

  return (
    <Modal
      open={open}
      size="lg"
      modalLabel="Report conversation"
      primaryButtonText="Report"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isEmpty(title) || isEmpty(description)}
      onRequestSubmit={async () => {
        // Step 1: Create an issue
        await fetch(`/api/issues`, {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            description: description,
            conversation: formattedConversation,
          }),
          signal: AbortSignal.timeout(30000),
        }).then(async (response) => {
          const resp = await response.json();
          // The API returns the created issue's html_url; fall back to the
          // configured repo's new-issue page if reporting failed.
          const repoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO_URL;
          const target =
            response.status === 200 && resp.issueUrl
              ? resp.issueUrl
              : repoUrl
                ? `${repoUrl}/issues/new`
                : undefined;
          if (target) window.open(target, '_blank');
        });

        // Step 2: Close model
        onClose();
      }}
      onRequestClose={() => {
        onClose();
      }}
    >
      <div className={classes.container}>
        <TextInput
          id="issue-title--input"
          type="text"
          labelText="Title"
          placeholder="Please provide brief title describing the issue"
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          invalid={isEmpty(title)}
          invalidText={'Title must be specified'}
        />
        <TextArea
          id="issue-description"
          labelText="Description"
          placeholder={'Please describe briefly issues with the conversation'}
          rows={4}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          invalid={isEmpty(description)}
          invalidText={'Description must be specified'}
        />

        <span className={classes.heading}>Conversation</span>
        <CodeSnippet
          type="multi"
          hideCopyButton={true}
          wrapText={true}
          className={classes.previewBox}
        >
          {JSON.stringify(formattedConversation, null, 2)}
        </CodeSnippet>
      </div>
    </Modal>
  );
}

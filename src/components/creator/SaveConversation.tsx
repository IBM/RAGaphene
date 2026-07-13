/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useMemo } from 'react';
import { Modal, Loading, Checkbox, CodeSnippet } from '@carbon/react';

import {
  User,
  ActiveRetriever,
  ActiveGenerator,
  Message,
} from '@/types/custom';
import {
  formatMessages,
  formatRetriever,
  formatGenerator,
} from '@/src/common/utilities/formatter';
import { CURRENT_SCHEMA_VERSION } from '@/src/common/utilities/migration';
import { useNotification } from '@/src/components/notification/Notification';

import classes from './ExportConversation.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  user: User;
  messages: Message[];
  onClose: Function;
  open: boolean;
  retriever?: ActiveRetriever;
  generator?: ActiveGenerator;
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================
export default function SaveConversation({
  user,
  messages,
  onClose,
  open = false,
  retriever,
  generator,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const acknowledgmentMessage =
    'By using this workbench, you acknowledge that your e-mail address and conversation will be stored in the configured database.';
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Step 2: Run effects
  // Step 2.a: Setup notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Format conversation
  const formattedConversation = useMemo(() => {
    return JSON.stringify(
      {
        schema_version: CURRENT_SCHEMA_VERSION,
        author: user.username,
        ...(retriever && { retriever: formatRetriever(retriever) }),
        ...(generator && { generator: formatGenerator(generator) }),
        messages: formatMessages(messages),
        status: 'created',
        status_history: [
          {
            author: user.username,
            status: 'created',
            timestamp: Math.floor(Date.now() / 1000),
          },
        ],
      },
      null,
      2,
    );
  }, [user.username, retriever, generator, messages]);

  // Step 3: Render
  return (
    <Modal
      open={open}
      size="md"
      modalLabel="Save conversation"
      primaryButtonText="Save"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!acknowledged}
      onRequestSubmit={() => {
        // Step 1: Define async function to save conversation
        async function save(conversation) {
          // Step 1.a.*: save conversation
          await fetch('/api/conversations', {
            method: 'POST',
            body: JSON.stringify({
              conversation: conversation,
            }),
          }).then(async (response) => {
            // Step 1.a.i: If successful
            if (response.status === 200) {
              const conversationID = await response.json();
              createNotification({
                title: `Success`,
                subtitle: `Please keep "${conversationID}" for your reference.`,
                kind: 'success',
              });
            } else {
              createNotification({
                title: 'Save',
                subtitle: response.statusText,
                kind: 'error',
              });
            }

            // Step 1.b: Set loading to false
            setLoading(false);
          });
        }

        // Step 1: Set loading to true
        setLoading(true);

        //Step 2: Prepare conversation to save
        formattedConversation['acknowledgment'] = {
          message: acknowledgmentMessage,
          user: user.username,
          timestamp: Math.floor(Date.now() / 1000),
        };

        // Step 3: Save
        save(formattedConversation);

        // Step 3: Close model
        onClose();
      }}
      onRequestClose={() => {
        onClose();
      }}
    >
      {loading ? (
        <Loading />
      ) : (
        <div className={classes.container}>
          <span className={classes.heading}>Preview</span>
          <CodeSnippet
            type="multi"
            hideCopyButton={true}
            wrapText={true}
            className={classes.previewBox}
          >
            {JSON.stringify(formattedConversation, null, 2)}
          </CodeSnippet>
          <Checkbox
            id="save-acknowledgemnt--checkbox"
            labelText={acknowledgmentMessage}
            invalid={!acknowledged}
            invalidText="You must provide the acknowledgment"
            onChange={(_, { checked }) => {
              setAcknowledged(checked);
            }}
          />
        </div>
      )}
    </Modal>
  );
}

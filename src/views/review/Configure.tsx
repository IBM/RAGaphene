/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useState } from 'react';
import { FileUploader, CodeSnippet, Button, Modal } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';

import { Conversation } from '@/types/custom';
import { camelCaseKeys } from '@/src/common/utilities/objects';
import { useNotification } from '@/src/components/notification/Notification';
import { validateConversation } from '@/src/common/utilities/validators';
import { migrateConversation } from '@/src/common/utilities/migration';
import {
  ReviewSession,
  loadSession,
  clearSession,
} from '@/src/common/utilities/session';

import sample_conversation from '@/src/common/data/sample_conversation.json';

import classes from './Configure.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  onProceed: (
    conversations: Conversation[],
    fileKey: string,
    fileName: string,
    idx?: number,
    resumed?: boolean,
  ) => void;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Configure({ onProceed }: Props) {
  // Step 1: Initialize state and necessary variables
  const [data, setData] = useState<Conversation[] | undefined>(undefined);
  const [fileKey, setFileKey] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [pendingSession, setPendingSession] = useState<ReviewSession | null>(
    null,
  );

  // Step 2: Set up hooks
  const { createNotification } = useNotification();

  // Step 3: Render
  return (
    <div className={classes.page}>
      <div className={classes.container}>
        <FileUploader
          labelTitle="Upload file"
          labelDescription="Max file size is 5mb. Only .json files are supported."
          buttonLabel="Add file"
          buttonKind="primary"
          size="md"
          filenameStatus="edit"
          accept={['.json']}
          multiple={false}
          disabled={false}
          iconDescription="Delete file"
          name=""
          onChange={async (event) => {
            // Step 1: Define a filereader and configure parsing
            const fileReader = new FileReader();
            // @ts-ignore
            const uploadedFile: File = event.target.files[0];
            const computedFileKey = `${uploadedFile.name}::${uploadedFile.size}`;
            const computedFileName = uploadedFile.name;

            fileReader.onload = (e) => {
              if (
                e.target &&
                e.target.result &&
                typeof e.target.result === 'string'
              ) {
                // Step 1.a: Parse JSON and convert certain keys to camel case
                try {
                  const rawData = JSON.parse(e.target.result);

                  // Step 1.a.i: Auto-migrate legacy conversation formats
                  let fileData: any;
                  let migrated = false;
                  if (Array.isArray(rawData)) {
                    const results = rawData.map((c) => migrateConversation(c));
                    fileData = results.map((r) => r.conversation);
                    migrated = results.some((r) => r.migrated);
                  } else {
                    const result = migrateConversation(rawData);
                    fileData = result.conversation;
                    migrated = result.migrated;
                  }
                  if (migrated) {
                    createNotification({
                      kind: 'info',
                      title: 'Legacy format detected — updated automatically.',
                      subtitle: '',
                      timeout: 4000,
                    });
                  }

                  // Step 1.b: Verify each conversation, if array
                  const invalidConversationIdxs: number[] = [];
                  const conversations: Conversation[] = [];
                  if (Array.isArray(fileData)) {
                    fileData.forEach((conversation, conversationIdx) => {
                      // Step 1.b.i: Validate input data
                      const status = validateConversation(conversation);
                      if (!status.valid) {
                        invalidConversationIdxs.push(conversationIdx);
                      } else {
                        conversations.push(camelCaseKeys(conversation));
                      }
                    });
                  } else {
                    const status = validateConversation(fileData);
                    if (!status.valid) {
                      // Step 1.c: Generate notifications
                      status.errors?.forEach((reason) => {
                        createNotification({
                          kind: 'error',
                          title: 'Failed to upload file.',
                          subtitle: reason.kind,
                          timeout: 10000,
                        });
                      });
                    } else {
                      conversations.push(camelCaseKeys(fileData));
                    }
                  }

                  // Step 1.c: Notify about invalid conversations, if any
                  if (!isEmpty(invalidConversationIdxs)) {
                    createNotification({
                      kind: 'error',
                      title: 'Failed to upload few conversations.',
                      subtitle: `Skipping conversations (${invalidConversationIdxs.join(', ')}) due to format issues.`,
                      timeout: 10000,
                    });
                  } else {
                    createNotification({
                      kind: 'info',
                      title: 'Upload successful.',
                      subtitle: 'Please process to data verification step.',
                      timeout: 2000,
                    });
                  }

                  // Step 1.d: Store data and check for a saved session
                  if (!isEmpty(conversations)) {
                    setData(conversations);
                    setFileKey(computedFileKey);
                    setFileName(computedFileName);

                    const savedSession = loadSession(computedFileKey);
                    if (savedSession) {
                      setPendingSession(savedSession);
                    } else {
                      clearSession();
                    }
                  }
                } catch (error) {
                  createNotification({
                    kind: 'error',
                    title: 'Failed to upload file.',
                    subtitle:
                      "Please make sure you are uploading a valid JSON file in a 'sample.json' format.",
                    timeout: 10000,
                  });
                  setData(undefined);
                }
              }

              return undefined;
            };

            // Step 2: Read uploaded file
            fileReader.readAsText(uploadedFile);
          }}
        />
        <div>
          <h4>Data format</h4>
          <CodeSnippet
            className={classes.dataFormat}
            minCollapsedNumberOfRows={5}
            type="multi"
            feedback="Copied to clipboard"
          >
            {JSON.stringify(sample_conversation, null, 2)}
          </CodeSnippet>
        </div>
        <div className={classes.navigationButtons}>
          <Button
            disabled={!data}
            renderIcon={ArrowRight}
            iconDescription="Verify data"
            onClick={() => {
              onProceed(data!, fileKey, fileName, 0);
            }}
          >
            Verify data
          </Button>
        </div>
      </div>
      <Modal
        open={pendingSession !== null}
        modalHeading="Resume your previous review session?"
        primaryButtonText="Resume"
        secondaryButtonText="Start fresh"
        onRequestSubmit={() => {
          if (pendingSession) {
            onProceed(
              pendingSession.conversations,
              fileKey,
              fileName,
              pendingSession.conversationIdx,
              true,
            );
            setPendingSession(null);
          }
        }}
        onSecondarySubmit={() => {
          clearSession();
          onProceed(data!, fileKey, fileName, 0, false);
          setPendingSession(null);
        }}
        onRequestClose={() => {
          clearSession();
          onProceed(data!, fileKey, fileName, 0, false);
          setPendingSession(null);
        }}
      >
        <p>
          You reviewed this file on{' '}
          {pendingSession
            ? new Date(pendingSession.savedAt).toLocaleString()
            : ''}
          . You can resume where you left off or start fresh.
        </p>
      </Modal>
    </div>
  );
}

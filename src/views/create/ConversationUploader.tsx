/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { FileUploader, CodeSnippet } from '@carbon/react';

import { Conversation } from '@/types/custom';
import { camelCaseKeys } from '@/src/common/utilities/objects';
import { useNotification } from '@/src/components/notification/Notification';
import { validateConversation } from '@/src/common/utilities/validators';
import { migrateConversation } from '@/src/common/utilities/migration';

import sample_conversation from '@/src/common/data/sample_conversation.json';

import classes from './ConversationUploader.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  onUpload: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ConversationUploader({ onUpload }: Props) {
  // Step 1: Set up hooks
  const { createNotification } = useNotification();

  return (
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
                const { conversation: fileData, migrated } =
                  migrateConversation(rawData);
                if (migrated) {
                  createNotification({
                    kind: 'info',
                    title: 'Legacy format detected — updated automatically.',
                    subtitle: '',
                    timeout: 4000,
                  });
                }

                // Step 1.b: Verify conversation
                const status = validateConversation(fileData as Conversation);
                if (!status.valid) {
                  // Step 1.b.i: Generate error notifications
                  status.errors?.forEach((reason) => {
                    createNotification({
                      kind: 'error',
                      title: 'Failed to upload file.',
                      subtitle: reason.kind,
                      timeout: 10000,
                    });
                  });

                  // Step 1.b.ii: Return
                  onUpload(undefined);
                } else {
                  // Step 1.b.i: Generate success notification
                  createNotification({
                    kind: 'info',
                    title: 'Upload successful.',
                    subtitle: 'Please process to next step.',
                    timeout: 2000,
                  });

                  // Step 1.b.ii: Format conversation
                  const conversation: Conversation = camelCaseKeys(fileData);

                  // Step 1.b.iii: Return
                  onUpload(conversation);
                }
              } catch (error) {
                createNotification({
                  kind: 'error',
                  title: 'Failed to upload file.',
                  subtitle:
                    "Please make sure you are uploading a valid JSON file in a 'sample.json' format.",
                  timeout: 10000,
                });
                onUpload(undefined);
              }
            }
          };

          // Step 2: Read uploaded file
          // @ts-ignore
          fileReader.readAsText(event.target.files[0]);
        }}
        onDelete={() => {
          onUpload(undefined);
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
    </div>
  );
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useMemo } from 'react';
import { Modal, CodeSnippet } from '@carbon/react';

import { Conversation } from '@/types/custom';
import { formatMessages } from '@/src/common/utilities/formatter';
import { nameInitials } from '@/src/common/utilities/string';

import classes from './ExportReviews.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  reviewer: string;
  reviewerName?: string;
  fileName: string;
  conversations: Conversation[];
  onClose: (exported: boolean) => void;
  open: boolean;
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================
export default function ExportReviews({
  reviewer,
  reviewerName,
  fileName,
  conversations,
  onClose,
  open = false,
}: Props) {
  const exportFileName = useMemo(() => {
    const initials = nameInitials(reviewerName);
    const suffix = initials ? `_${initials}` : '_reviewed';
    const stem = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;
    return `${stem}${suffix}.json`;
  }, [fileName, reviewerName]);
  const conversationToExport = useMemo(() => {
    // Step 2.b: Prepare conversation for export
    return JSON.stringify(
      conversations.map((conversation) => {
        return {
          ...conversation,
          messages: formatMessages(conversation.messages),
        };
      }),
      null,
      2,
    );
  }, [conversations]);

  return (
    <Modal
      open={open}
      size="md"
      modalLabel="Export conversation"
      primaryButtonText="Export"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        //Step 1: Export
        // Step 1.a: Create <a> tag
        var element = document.createElement('a');

        // Step 1.b: Set attributes
        element.setAttribute(
          'href',
          'data:application/json;charset=utf-8, ' +
            encodeURIComponent(conversationToExport),
        );
        element.setAttribute('download', exportFileName);

        // Step 1.c: Add to DOM tree and click it
        document.body.appendChild(element);
        element.click();

        // Step 1.d : Cleanup
        document.body.removeChild(element);

        // Step 2: Close modal, signalling a successful export
        onClose(true);
      }}
      onRequestClose={() => {
        onClose(false);
      }}
    >
      <div className={classes.container}>
        <span className={classes.heading}>Preview</span>
        <CodeSnippet
          type="multi"
          hideCopyButton={true}
          wrapText={true}
          className={classes.previewBox}
        >
          {conversationToExport}
        </CodeSnippet>
      </div>
    </Modal>
  );
}

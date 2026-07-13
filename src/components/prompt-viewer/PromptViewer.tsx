/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Modal, CodeSnippet } from '@carbon/react';

import classes from './PromptViewer.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  prompt: string;
  onClose: Function;
  open: boolean;
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================
export default function PromptViewer({ prompt, onClose, open = false }: Props) {
  return (
    <Modal
      open={open}
      size="sm"
      modalLabel="Prompt"
      passiveModal
      onRequestClose={() => {
        onClose();
      }}
    >
      <div className={classes.container}>
        <CodeSnippet
          type="multi"
          wrapText={true}
          className={classes.previewBox}
        >
          {prompt}
        </CodeSnippet>
      </div>
    </Modal>
  );
}

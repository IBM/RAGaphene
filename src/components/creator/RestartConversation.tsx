/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Modal } from '@carbon/react';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  open: boolean;
  onSuccess: Function;
  onCancel: Function;
  onClose: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function RestartConversation({
  open = false,
  onSuccess,
  onCancel,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      danger
      modalHeading="Are you sure you want to restart conversation?"
      primaryButtonText="Restart"
      secondaryButtonText="Cancel"
      size={'xs'}
      onRequestSubmit={() => {
        onSuccess();
      }}
      onRequestClose={() => onClose()}
      onSecondarySubmit={() => onCancel()}
    >
      Make sure you exported the conversation if you want to save it. Once you
      restart, you will not be able to recover it.
    </Modal>
  );
}

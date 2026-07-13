/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Modal, TextArea, Tag } from '@carbon/react';

import { CommentProvenance } from '@/types/custom';
import classes from './AddCommentModal.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  /** Called with the entered comment string when the user clicks Add. */
  onSubmit: (comment: string) => void;
  /** Called (no arguments) when the user clicks Cancel or closes the modal. */
  onClose: () => void;
  open: boolean;
  selectedText?: string;
  provenance: CommentProvenance | undefined;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function AddCommentModal({
  selectedText,
  onSubmit,
  onClose,
  open = false,
  provenance,
}: Props) {
  const [comment, setComment] = useState<string>('');

  useEffect(() => {
    if (open) setComment('');
  }, [open]);

  const [tag, tagType] = useMemo(() => {
    if (provenance) {
      const messageTextRegex = new RegExp('messages\\[\\d+\\].text', 'g');
      const contextTextRegex = new RegExp(
        'messages\\[\\d+\\].documents\\[\\d+\\].text',
        'g',
      );
      const alternativesTextRegex = new RegExp(
        'messages\\[\\d+\\].alternatives\\[\\d+\\].text',
        'g',
      );

      if (messageTextRegex.test(provenance.component)) {
        return ['Message', 'purple'];
      } else if (contextTextRegex.test(provenance.component)) {
        return ['Contexts', 'cyan'];
      } else if (alternativesTextRegex.test(provenance.component)) {
        return ['Alternatives', 'teal'];
      } else {
        return ['Generic', 'gray'];
      }
    } else {
      return ['Generic', 'gray'];
    }
  }, [provenance]);

  return (
    <Modal
      open={open}
      modalHeading="Add a comment"
      modalLabel="Comments"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        //Step 1: Clear comment & update default value for author
        setComment('');

        // Step 2: Register comment and close modal
        onSubmit(comment);
      }}
      onRequestClose={() => {
        //Step 1: Clear comment
        setComment('');

        // Step 2: Close modal
        onClose();
      }}
      primaryButtonDisabled={comment === ''}
    >
      <div className={classes.commentProvenance}>
        <span className={classes.label}>Provenance</span>
        {
          //@ts-ignore
          <Tag className={classes.commentProvenanceTag} type={tagType}>
            {tag}
          </Tag>
        }
      </div>

      <TextArea
        className={classes.commentBox}
        labelText="Comment"
        rows={4}
        id="comment-area"
        value={comment}
        invalid={comment === ''}
        invalidText={'comment cannot be empty'}
        onChange={(event) => {
          setComment(event.target.value);
        }}
      />

      {tag !== 'Generic' && (
        <div className={classes.reference}>
          <div>
            <span className={'cds--label'}>Reference</span>
          </div>
          <p>{selectedText}</p>
        </div>
      )}
    </Modal>
  );
}

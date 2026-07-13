/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useState, memo, useMemo } from 'react';
import { Button, Tag, TextArea } from '@carbon/react';
import {
  Edit,
  View,
  TrashCan,
  Information,
  AddComment,
} from '@carbon/icons-react';

import { User, Comment as CommentType } from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';

import classes from './CommentViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  user?: User;
  comments: CommentType[] | undefined;
  /** Called with the message index the comment is anchored to; scrolls the reviewer to that message. */
  onSelect?: (msgIdx: number) => void;
  /** Called (no arguments) to open the Add Comment modal. */
  onAdd?: () => void;
  /** Called with the full updated Comment object and its index in the comments array after an in-place edit. */
  onEdit?: (updatedComment: CommentType, updatedCommentIdx: number) => void;
  /** Called with the index of the comment that was deleted. */
  onDelete?: (deletedCommentIdx: number) => void;
}

// ===================================================================================
//                               RENDER FUNCTION
// ===================================================================================
function Comment({
  id,
  idx,
  comment,
  onSelect,
  onEdit,
  onDelete,
}: {
  id: string;
  idx: number;
  comment: CommentType;
  /** Called with the message index the comment is anchored to; scrolls the reviewer to that message. */
  onSelect?: (msgIdx: number) => void;
  /** Called with the full updated Comment object and its index in the comments array after an in-place edit. */
  onEdit?: (updatedComment: CommentType, updatedCommentIdx: number) => void;
  /** Called with the index of the comment that was deleted. */
  onDelete?: (deletedCommentIdx: number) => void;
}) {
  const [editing, setEditing] = useState<boolean>(false);
  const [editedCommentText, setEditedCommentText] = useState<string>(
    comment.comment,
  );

  const [tag, tagType]: [string, string] = useMemo(() => {
    if (comment.provenance) {
      const messageTextRegex = new RegExp('messages\\[\\d+\\].text', 'g');
      const contextTextRegex = new RegExp(
        'messages\\[\\d+\\].documents\\[\\d+\\].text',
        'g',
      );
      const alternativesTextRegex = new RegExp(
        'messages\\[\\d+\\].alternatives\\[\\d+\\].text',
        'g',
      );
      if (messageTextRegex.test(comment.provenance.component)) {
        return ['Message', 'purple'];
      } else if (contextTextRegex.test(comment.provenance.component)) {
        return ['Contexts', 'cyan'];
      } else if (alternativesTextRegex.test(comment.provenance.component)) {
        return ['Alternatives', 'teal'];
      } else {
        return ['Generic', 'gray'];
      }
    } else {
      return ['Generic', 'gray'];
    }
  }, [comment.provenance]);

  return (
    <div className={classes.comment}>
      <div className={classes.commentHeader}>
        <div className={classes.commentHeaderAuthor}>
          <span className={classes.label}>Author</span>
          <span>{comment.author}</span>
        </div>
        <div className={classes.commentHeaderProvenance}>
          <span className={classes.label}>Provenance</span>
          {
            //@ts-ignore
            <Tag className={classes.commentTag} type={tagType}>
              {tag}
            </Tag>
          }
        </div>

        <span className={classes.commentHeaderTimestamp}>
          <span className={classes.label}>Last updated</span>
          <span>{new Date(comment.updated * 1000).toLocaleString()}</span>
        </span>
      </div>

      {editing ? (
        <TextArea
          labelText="Edit comment"
          rows={Math.max(Math.floor(comment.comment.length / 100), 3)}
          id={`${id}--textarea`}
          placeholder={comment.comment}
          value={editedCommentText}
          invalid={isEmpty(editedCommentText)}
          invalidText={'comment cannot be empty'}
          autoFocus={editing === true}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (!isEmpty(editedCommentText) && onEdit) {
                // Trigger comment edit
                onEdit(
                  {
                    ...comment,
                    comment: editedCommentText,
                    updated: Math.floor(Date.now() / 1000),
                  },
                  idx,
                );
              }

              // Set editing to false
              setEditing(false);
            } else if (e.key === 'Escape') {
              // Prevent default behavior
              e.preventDefault();

              // Clear editedCommentText
              setEditedCommentText(comment.comment);

              // Set editing to false
              setEditing(false);
            }
          }}
          onChange={(event) => {
            setEditedCommentText(event.target.value);
          }}
        />
      ) : null}
      {editing ? (
        <div className={classes.editActions}>
          <Button
            kind="ghost"
            size="sm"
            onClick={() => {
              setEditedCommentText(comment.comment);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            kind="primary"
            size="sm"
            disabled={isEmpty(editedCommentText)}
            onClick={() => {
              if (!isEmpty(editedCommentText) && onEdit) {
                onEdit(
                  {
                    ...comment,
                    comment: editedCommentText,
                    updated: Math.floor(Date.now() / 1000),
                  },
                  idx,
                );
              }
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <div className={classes.commentBody}>{comment.comment}</div>
      )}
      {comment.provenance && comment.provenance.text ? (
        <div className={classes.commentProvenance}>
          <span className={classes.label}>Reference</span>
          <span className={classes.commentProvenanceText}>
            {truncate(comment.provenance.text, 100)}
          </span>
        </div>
      ) : null}
      <div className={classes.commentActions}>
        <Button
          id={`${id}-editBtn`}
          className={classes.commentBtn}
          kind={'ghost'}
          onClick={() => {
            setEditing(!editing);
          }}
          disabled={onEdit === undefined}
        >
          <span>Edit</span>
          <Edit />
        </Button>
        <Button
          id={`${id}-viewBtn`}
          className={classes.commentBtn}
          kind={'ghost'}
          onClick={() => {
            if (
              onSelect &&
              comment.provenance?.component &&
              tag !== 'Generic'
            ) {
              const indices = comment.provenance?.component.match(/\d+/g);
              if (indices && !isEmpty(indices)) {
                onSelect(Number(indices[0]));
              }
            }
          }}
          disabled={
            onSelect === undefined || tag === 'Generic' || !comment.provenance
          }
        >
          <span>View</span>
          <View />
        </Button>
        <Button
          id={`${id}-deleteBtn`}
          className={classes.commentBtn}
          kind={'ghost'}
          onClick={() => {
            if (onDelete) {
              onDelete(idx);
            }
          }}
          disabled={onDelete === undefined}
        >
          <span>Delete</span>
          <TrashCan />
        </Button>
      </div>
    </div>
  );
}

function AddCommentHint() {
  return (
    <div className={classes.infoContainer}>
      <Information size={32} />
      <ul className={classes.infoList}>
        <li>
          <strong>Contextual comment</strong> — select text in a message or
          document; a button will appear near your cursor.
        </li>
        <li>
          <strong>General comment</strong> — click <em>Add comment</em> below
          without selecting any text first.
        </li>
      </ul>
    </div>
  );
}
// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default memo(function CommentsPanel({
  user,
  comments,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  // Only show the current user's own comments (blind review — AD-007 Decision 2 extension)
  const visibleComments = useMemo(
    () =>
      comments
        ?.map((comment, originalIdx) => ({ comment, originalIdx }))
        .filter(({ comment }) => !user || comment.author === user.username) ??
      [],
    [comments, user?.username],
  );

  return (
    <>
      <h4>Comments</h4>

      <div className={classes.comments}>
        {visibleComments.map(({ comment, originalIdx }) => (
          <Comment
            key={`comment--${originalIdx}`}
            id={`comment--${originalIdx}`}
            idx={originalIdx}
            comment={comment}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <AddCommentHint />
      {onAdd !== undefined ? (
        <Button
          kind="secondary"
          renderIcon={AddComment}
          onClick={() => onAdd()}
        >
          Add comment
        </Button>
      ) : null}
    </>
  );
});

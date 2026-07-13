/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { cloneDeep, isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Button, IconButton, Modal, ProgressBar } from '@carbon/react';
import {
  Export,
  Chat as ChatIcon,
  CollapseAll,
  ExpandAll,
  ChevronLeft,
  ChevronRight,
  Close,
  Checkmark,
  AddComment,
} from '@carbon/icons-react';

import { User, Conversation, Plugin, CommentProvenance } from '@/types/custom';
import { collectEnrichments } from '@/src/common/utilities/enrichments';
import { extractMouseSelection } from '@/src/common/utilities/selectors';
import { useNavigationGuard } from '@/src/common/utilities/navigationGuard';
import { useNotification } from '@/src/components/notification/Notification';
import ExportReviews from '@/src/components/reviewer/ExportReviews';
import { ChatLine } from '@/src/components/chatline/ChatLine';
import CommentsPanel from '@/src/components/comments/CommentsViewer';
import AddCommentModal from '@/src/components/comments/AddCommentModal';

import classes from './Reviewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  user: User;
  conversations: Conversation[];
  conversationIdx: number;
  fileName: string;
  isDirty: boolean;
  updateConversations: (conversations: Conversation[], idx?: number) => void;
  onConversationIdxChange: (idx: number) => void;
  onMarkClean: () => void;
  plugins?: Plugin[];
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
function recordFeedback(
  conversation: Conversation,
  reviewer: string,
  opinion: 'accepted' | 'rejected',
) {
  // Step 1: Clone existing conversation
  const updatedConversation = cloneDeep(conversation);

  // Step 2: Update conversation status to 'reviewed' (accept/reject lives in status_history)
  updatedConversation.status = 'reviewed';

  // Step 4: Update conversation status history
  const entry = {
    author: reviewer,
    status: opinion,
    timestamp: Math.floor(Date.now() / 1000),
  };

  if (updatedConversation.status_history === undefined) {
    updatedConversation.status_history = [entry];
  } else {
    const prevReviewIdx = updatedConversation.status_history
      .map((e) => e.author)
      .lastIndexOf(reviewer);

    if (
      prevReviewIdx !== -1 &&
      (updatedConversation.status_history[prevReviewIdx].status ===
        'accepted' ||
        updatedConversation.status_history[prevReviewIdx].status === 'rejected')
    ) {
      // Replace this reviewer's existing accept/reject entry
      updatedConversation.status_history[prevReviewIdx] = entry;
    } else {
      updatedConversation.status_history.push(entry);
    }
  }

  // Step 5: Return
  return updatedConversation;
}

/**
 * Update existing provenance and return whether a non-empty selection was captured.
 * @param component reference location
 * @param setCommentProvenance function to update state variable
 * @param createNotification function to notify user of any issues with selection
 * @returns true if a non-empty selection was captured, false otherwise
 */
function updateCommentProvenance(
  component: string,
  setCommentProvenance: Function,
  createNotification: Function,
): boolean {
  try {
    const [text, offsets] = extractMouseSelection();
    if (text !== '') {
      setCommentProvenance({
        component: component,
        text: text,
        offsets: offsets,
      });
      return true;
    }
    return false;
  } catch (err) {
    // Notify user
    createNotification({
      kind: 'error',
      title: 'Invalid selection',
      subtitle: 'cannot select text from different part of the page.',
    });

    // Reset selection
    setCommentProvenance(undefined);
    return false;
  }
}

// ===================================================================================
//                               RENDER FUNCTION
// ===================================================================================
function ProgressTracker({
  reviewer,
  conversations,
}: {
  reviewer: string;
  conversations: Conversation[];
}) {
  const reviewedConversations = useMemo(() => {
    return conversations.filter((conversation) =>
      conversation.status_history?.some(
        (entry) =>
          entry.author === reviewer &&
          (entry.status === 'accepted' || entry.status === 'rejected'),
      ),
    );
  }, [reviewer, conversations]);

  return (
    <ProgressBar
      className={classes.progressTracker}
      label={`You have reviewed ${reviewedConversations.length} out of ${conversations.length} conversations${reviewedConversations.length === conversations.length ? '. Thank you!' : ''}`}
      value={(reviewedConversations.length / conversations.length) * 100}
      status={
        reviewedConversations.length === conversations.length
          ? 'finished'
          : 'active'
      }
    />
  );
}

function Chat({
  user,
  conversation,
  onUpdate,
  scrollToken,
  plugins,
  expanded = true,
  onSelection,
}: {
  user: User;
  conversation: Conversation;
  onUpdate: Function;
  scrollToken: { idx: number; seq: number };
  plugins?: Plugin[];
  expanded?: boolean;
  onSelection?: (component: string, x: number, y: number) => void;
}) {
  // Step 1: Identify all available enrichments
  const availableEnrichments: {
    [key: string]: { values: Set<string>; color: string };
  } = useMemo(() => {
    return collectEnrichments(
      conversation.messages,
      plugins?.find((plugin) => plugin.name === 'enrichments'),
    );
  }, [conversation.messages, plugins]);
  return (
    <>
      {conversation.messages.map((message, messageIdx) => (
        <ChatLine
          key={`conversation__message--${messageIdx}--${expanded}`}
          id={`conversation__message--${messageIdx}`}
          message={message}
          user={user}
          open={expanded}
          availableEnrichments={availableEnrichments}
          editable={message.speaker === 'agent'}
          onEditMessageText={(editedMessageText: string) => {
            onUpdate({
              ...conversation,
              messages: conversation.messages.toSpliced(messageIdx, 1, {
                ...message,
                text: editedMessageText,
                originalText: message.originalText
                  ? message.originalText
                  : message.text,
              }),
            });
          }}
          onChangeMessageEnrichments={(updatedEnrichments) => {
            // Step 1: Update enrichments
            const updatedConversation = {
              ...conversation,
              messages: conversation.messages.map((message, idx) => {
                if (idx === messageIdx) {
                  return { ...message, enrichments: updatedEnrichments };
                } else {
                  return message;
                }
              }),
            };

            // Step 2: Trigger conversation update
            onUpdate(updatedConversation);
          }}
          onContextFeedback={(contextIndex, metric, value) => {
            // Create deep copy of the message
            const updatedMessage = cloneDeep(message);

            // Record feedback for specfied context
            if (updatedMessage.contexts[contextIndex].feedback) {
              if (updatedMessage.contexts[contextIndex].feedback[metric]) {
                updatedMessage.contexts[contextIndex].feedback[metric][
                  user.username
                ] = {
                  value: value,
                  timestamp: Math.floor(Date.now() / 1000),
                };
              } else {
                updatedMessage.contexts[contextIndex].feedback[metric] = {
                  [user.username]: {
                    value: value,
                    timestamp: Math.floor(Date.now() / 1000),
                  },
                };
              }
            } else {
              updatedMessage.contexts[contextIndex].feedback = {
                [metric]: {
                  [user.username]: {
                    value: value,
                    timestamp: Math.floor(Date.now() / 1000),
                  },
                },
              };
            }

            // Trigger onContextFeedback function
            onUpdate({
              ...conversation,
              messages: conversation.messages.toSpliced(
                messageIdx,
                1,
                updatedMessage,
              ),
            });
          }}
          onSelection={onSelection}
          focused={scrollToken.idx === messageIdx}
          scrollSeq={scrollToken.seq}
        ></ChatLine>
      ))}
    </>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Reviewer({
  user,
  conversations,
  conversationIdx,
  fileName,
  isDirty,
  updateConversations,
  onConversationIdxChange,
  onMarkClean,
  plugins,
}: Props) {
  const router = useRouter();
  // Step 1: Initialize state and necessary variables
  const [scrollToken, setScrollToken] = useState<{ idx: number; seq: number }>({
    idx: 0,
    seq: 0,
  });
  const [exportReviewsModalOpen, setExportReviewsModalOpen] = useState(false);
  const [viewCommentsPanelOpen, setViewCommentsPanelOpen] =
    useState<boolean>(false);

  const conversationIdxUnderReview = conversationIdx;
  const setConversationIdxUnderReview = onConversationIdxChange;
  const [expanded, setExpanded] = useState<boolean>(true);
  const [commentProvenance, setCommentProvenance] = useState<
    CommentProvenance | undefined
  >(undefined);
  const [addCommentModalOpen, setAddCommentModalOpen] =
    useState<boolean>(false);
  const [floatingBtnPos, setFloatingBtnPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Step 2: Run effects
  // Step 2.a: Reset expanded to true on conversation change
  useEffect(() => {
    setExpanded(true);

    // Collapse comments panel, if unnecessary
    setViewCommentsPanelOpen(
      conversations[conversationIdxUnderReview].comments !== undefined &&
        !isEmpty(conversations[conversationIdxUnderReview].comments),
    );
  }, [conversations, conversationIdxUnderReview]);

  // Step 2.b: Reset scrollToken to top of the message list on conversation change
  useEffect(() => {
    setScrollToken((prev) => ({ idx: 0, seq: prev.seq + 1 }));
  }, [conversationIdxUnderReview]);

  // Step 2.c: Intercept navigation (link clicks, back/forward, tab close) when dirty
  const {
    blockedUrl,
    confirm: confirmNavigation,
    cancel: cancelNavigation,
  } = useNavigationGuard(isDirty, router.push);

  // Step 2.d: Notification hook
  const { createNotification } = useNotification();

  // Step 2.e: Find previous review index
  const prevReviewStatus = useMemo(() => {
    const currentConversation = conversations[conversationIdxUnderReview];
    if (currentConversation.status_history) {
      const prevReviewIdx = currentConversation.status_history
        .map((entry) => entry.author)
        .lastIndexOf(user.username);

      if (prevReviewIdx > -1) {
        return currentConversation.status_history[prevReviewIdx].status;
      }
    }

    return '';
  }, [conversations, conversationIdxUnderReview, user.username]);

  // Step 3: Render
  return (
    <div
      className={classes.page}
      onMouseDown={(e) => {
        // Dismiss the floating button on any click that isn't the button itself
        const target = e.target as HTMLElement;
        if (!target.closest(`.${classes.floatingAddBtn}`)) {
          setFloatingBtnPos(null);
        }
      }}
    >
      {viewCommentsPanelOpen ? (
        <div className={classes.commentsPanel}>
          <CommentsPanel
            user={user}
            comments={conversations[conversationIdxUnderReview].comments}
            onSelect={(msgIdx: number) =>
              setScrollToken((prev) => ({ idx: msgIdx, seq: prev.seq + 1 }))
            }
            onAdd={() => {
              setAddCommentModalOpen(true);
            }}
            onDelete={(deletedCommentIdx) => {
              updateConversations(
                conversations.map((entry, idx) =>
                  idx === conversationIdxUnderReview
                    ? {
                        ...entry,
                        ...{
                          comments: entry.comments?.toSpliced(
                            deletedCommentIdx,
                            1,
                          ),
                        },
                      }
                    : entry,
                ),
              );
            }}
            onEdit={(updatedComment, updatedCommentIdx) => {
              updateConversations(
                conversations.map((entry, idx) =>
                  idx === conversationIdxUnderReview
                    ? {
                        ...entry,
                        ...{
                          comments: entry.comments?.toSpliced(
                            updatedCommentIdx,
                            1,
                            updatedComment,
                          ),
                        },
                      }
                    : entry,
                ),
              );
            }}
          />
        </div>
      ) : null}
      <div
        className={cx(
          classes.container,
          viewCommentsPanelOpen ? classes.resize : null,
        )}
      >
        <AddCommentModal
          open={addCommentModalOpen}
          selectedText={commentProvenance ? commentProvenance.text : undefined}
          onSubmit={(comment: string) => {
            // Step 1: Create comment to add
            const commentToAdd = {
              comment: comment,
              author: user.username,
              created: Math.floor(Date.now() / 1000),
              updated: Math.floor(Date.now() / 1000),
              provenance: commentProvenance,
            };

            // Step 2: Add comment to task
            updateConversations(
              conversations.map((entry, idx) =>
                idx === conversationIdxUnderReview
                  ? {
                      ...entry,
                      ...{
                        comments: entry.comments
                          ? [...entry.comments, commentToAdd]
                          : [commentToAdd],
                      },
                    }
                  : entry,
              ),
            );

            // Step 3: Clear provenance
            setCommentProvenance(undefined);

            // Step 4: Close modal
            setAddCommentModalOpen(false);
          }}
          onClose={() => {
            // Clear provenance
            setCommentProvenance(undefined);

            // Close modal
            setAddCommentModalOpen(false);
          }}
          provenance={commentProvenance}
        ></AddCommentModal>
        <Modal
          open={blockedUrl !== null}
          danger
          modalHeading="Leave review session?"
          primaryButtonText="Leave"
          secondaryButtonText="Stay"
          onRequestSubmit={confirmNavigation}
          onSecondarySubmit={cancelNavigation}
          onRequestClose={cancelNavigation}
        >
          <p>
            You have unsaved changes. If you leave, your in-progress annotations
            will be lost (your session is saved and can be restored on next
            upload).
          </p>
        </Modal>
        <ExportReviews
          open={exportReviewsModalOpen}
          reviewer={user.username}
          reviewerName={user.name}
          fileName={fileName}
          conversations={conversations}
          onClose={(exported: boolean) => {
            setExportReviewsModalOpen(false);
            if (exported) onMarkClean();
          }}
        />
        <div className={classes.toolbar}>
          <span>
            &ensp;&ensp; Created:&nbsp;
            {new Date(
              conversations[conversationIdxUnderReview].messages.slice(-1)[0]
                .timestamp * 1000,
            ).toLocaleString()}
          </span>
          <ProgressTracker
            reviewer={user.username}
            conversations={conversations}
          />
          <button
            title={expanded ? 'Collapse all messages' : 'Expand all messages'}
            onClick={() => {
              setExpanded(!expanded);
            }}
            className={cx(classes.toolbarAction)}
          >
            {expanded ? <CollapseAll /> : <ExpandAll />}
            <span>{expanded ? 'Collapse' : 'Expand'}</span>
          </button>
          <button
            title="View comments"
            onClick={() => {
              setViewCommentsPanelOpen(!viewCommentsPanelOpen);
            }}
            className={cx(classes.toolbarAction)}
          >
            <ChatIcon />
            <span>Comments</span>
          </button>
          <button
            title="Export conversation"
            onClick={() => {
              setExportReviewsModalOpen(true);
            }}
            className={cx(classes.toolbarAction)}
          >
            <Export />
            <span>Export</span>
          </button>
        </div>
        <div className={classes.conversationSelector}>
          <Button
            id={'conversation--selector-prev'}
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="Previous conversation"
            onClick={() => {
              if (conversationIdxUnderReview > 0) {
                setConversationIdxUnderReview(conversationIdxUnderReview - 1);
              }
            }}
            disabled={conversationIdxUnderReview === 0}
          />
          <span className={classes.documentIndex}>
            {conversationIdxUnderReview + 1} / {conversations.length}
          </span>
          <Button
            id={'conversation--selector-next'}
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronRight}
            iconDescription="Next conversation"
            onClick={() => {
              if (conversationIdxUnderReview < conversations.length - 1) {
                setConversationIdxUnderReview(conversationIdxUnderReview + 1);
              }
            }}
            disabled={conversationIdxUnderReview === conversations.length - 1}
          />
        </div>

        <div
          key={`conversation--${conversationIdxUnderReview}`}
          className={classes.conversationContainer}
        >
          <Chat
            user={user}
            conversation={conversations[conversationIdxUnderReview]}
            onUpdate={(updatedConversation) => {
              // Update conversation status
              updatedConversation.status = 'edited';

              // Update conversation status history
              const editEntry = {
                author: user.username,
                status: 'edited' as const,
                timestamp: Math.floor(Date.now() / 1000),
              };
              if (updatedConversation.status_history) {
                const prevEditIdx = updatedConversation.status_history
                  .map((e) => e.author)
                  .lastIndexOf(user.username);
                if (
                  prevEditIdx !== -1 &&
                  updatedConversation.status_history[prevEditIdx].status ===
                    'edited'
                ) {
                  // Update this user's existing edited entry in place
                  updatedConversation.status_history =
                    updatedConversation.status_history.toSpliced(
                      prevEditIdx,
                      1,
                      editEntry,
                    );
                } else {
                  // Append a new edited entry for this user
                  updatedConversation.status_history = [
                    ...updatedConversation.status_history,
                    editEntry,
                  ];
                }
              } else {
                updatedConversation.status_history = [editEntry];
              }

              updateConversations(
                conversations.toSpliced(
                  conversationIdxUnderReview,
                  1,
                  updatedConversation,
                ),
              );
            }}
            plugins={plugins}
            expanded={expanded}
            onSelection={(provenance: string, x: number, y: number) => {
              const hasSelection = updateCommentProvenance(
                provenance,
                setCommentProvenance,
                createNotification,
              );
              if (hasSelection) {
                setFloatingBtnPos({ x, y });
              } else {
                setFloatingBtnPos(null);
              }
            }}
            scrollToken={scrollToken}
          ></Chat>
        </div>
        <div className={classes.feedbackContainer}>
          <Button
            id={'conversation__review-btn--reject'}
            kind="danger"
            disabled={prevReviewStatus === 'rejected'}
            onClick={() => {
              // Step 1: Update conversation
              const updatedConversation = recordFeedback(
                conversations[conversationIdxUnderReview],
                user.username,
                'rejected',
              );

              // Step 2: Determine next index
              const nextIdx =
                conversationIdxUnderReview !== conversations.length - 1
                  ? conversationIdxUnderReview + 1
                  : conversationIdxUnderReview;

              // Step 3: Trigger conversations update (with next idx so parent persists both)
              updateConversations(
                conversations.map((entry, idx) =>
                  idx === conversationIdxUnderReview
                    ? updatedConversation
                    : entry,
                ),
                nextIdx,
              );

              // Step 4: Move to next conversation, if possible
              if (conversationIdxUnderReview !== conversations.length - 1) {
                setConversationIdxUnderReview(conversationIdxUnderReview + 1);
              }
            }}
            renderIcon={Close}
          >
            Reject
          </Button>
          <Button
            id={'conversation__review-btn--accept'}
            kind="primary"
            disabled={prevReviewStatus === 'accepted'}
            onClick={() => {
              // Step 1: Update conversation
              const updatedConversation = recordFeedback(
                conversations[conversationIdxUnderReview],
                user.username,
                'accepted',
              );

              // Step 2: Determine next index
              const nextIdx =
                conversationIdxUnderReview !== conversations.length - 1
                  ? conversationIdxUnderReview + 1
                  : conversationIdxUnderReview;

              // Step 3: Trigger conversations update (with next idx so parent persists both)
              updateConversations(
                conversations.map((entry, idx) =>
                  idx === conversationIdxUnderReview
                    ? updatedConversation
                    : entry,
                ),
                nextIdx,
              );

              // Step 4: Move to next conversation, if possible
              if (conversationIdxUnderReview !== conversations.length - 1) {
                setConversationIdxUnderReview(conversationIdxUnderReview + 1);
              }
            }}
            renderIcon={Checkmark}
          >
            Accept
          </Button>
        </div>
      </div>
      {floatingBtnPos && (
        <div
          className={classes.floatingAddBtn}
          style={{ top: floatingBtnPos.y + 8, left: floatingBtnPos.x + 8 }}
        >
          <IconButton
            kind="secondary"
            label="Add comment"
            align="bottom-left"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setAddCommentModalOpen(true);
              setFloatingBtnPos(null);
            }}
          >
            <AddComment />
          </IconButton>
        </div>
      )}
    </div>
  );
}

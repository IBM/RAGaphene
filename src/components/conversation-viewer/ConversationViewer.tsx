/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useMemo, useRef, useEffect } from 'react';

import { Tag } from '@carbon/react';
import {
  Chat as ChatIcon,
  Close,
  CollapseAll,
  ExpandAll,
} from '@carbon/icons-react';

import { Conversation } from '@/types/custom';
import { collectEnrichments } from '@/src/common/utilities/enrichments';
import { ChatLine } from '@/src/components/chatline/ChatLine';
import CommentsPanel from '@/src/components/comments/CommentsViewer';

import classes from './ConversationViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  conversation: Conversation;
  onClose: Function;
}

// ===================================================================================
//                               RENDER FUNCTION
// ===================================================================================
function Chat({
  conversation,
  expanded = true,
}: {
  conversation: Conversation;
  expanded?: boolean;
}) {
  // Step 1: Identify all available enrichments
  const anchorRef = useRef<HTMLDivElement>(null);

  // Step 2: Run effects
  // Step 2.a: Collect all applied enrichments
  const appliedEnrichments: {
    [key: string]: { values: Set<string>; color: string };
  } = useMemo(() => {
    return collectEnrichments(conversation.messages);
  }, [conversation.messages]);

  // Step 2.b: Scroll latest message into view
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, []);

  return (
    <>
      <div ref={anchorRef} className={classes.anchor} />
      {conversation.messages.map((message, messageIdx) => (
        <ChatLine
          key={`conversation__message--${messageIdx}--${expanded}`}
          id={`conversation__message--${messageIdx}`}
          message={message}
          user={{ username: 'system', firstName: 'Analyst' }}
          open={expanded}
          availableEnrichments={appliedEnrichments}
        ></ChatLine>
      ))}
    </>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ConversationViewer({ conversation, onClose }: Props) {
  // Step 1: Initialize state and necessary variables
  const [viewCommentsPanelOpen, setViewCommentsPanelOpen] = useState<boolean>(
    conversation.comments !== undefined && !isEmpty(conversation.comments),
  );
  const [expanded, setExpanded] = useState<boolean>(true);

  // Step 2: Run effects
  // Step 2.a: Handle task close event
  useEffect(() => {
    const handleEsc = (event) => {
      // If "Escape" key is pressed
      if (event.key === 'Escape') {
        // Step 1: Close task view
        onClose();

        // Step 2: Stop event propogation
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Step 3: Render
  return (
    <>
      <div className={classes.page}>
        {viewCommentsPanelOpen ? (
          <div className={classes.commentsPanel}>
            <CommentsPanel comments={conversation.comments} />
          </div>
        ) : null}
        <div className={classes.container}>
          <div className={classes.toolbar}>
            <span>
              Creator: {conversation.author}
              &ensp;&ensp; Created:&nbsp;
              {new Date(
                conversation.messages.slice(-1)[0].timestamp * 1000,
              ).toLocaleString()}
            </span>
            <button
              title={'Close'}
              onClick={() => {
                onClose();
              }}
              className={cx(classes.toolbarAction)}
            >
              <Close />
              <span>{'Close'}</span>
            </button>
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
              className={cx(
                classes.toolbarAction,
                conversation.comments === undefined ||
                  isEmpty(conversation.comments)
                  ? classes.disabled
                  : null,
              )}
              disabled={
                conversation.comments === undefined ||
                isEmpty(conversation.comments)
              }
            >
              <ChatIcon />
              <span>Comments</span>
            </button>
          </div>
          <div className={classes.pageHint}>
            <Tag
              type={'outline'}
              onClick={() => {
                onClose();
              }}
            >
              Press 'Escape' to close
            </Tag>
          </div>
          <div className={classes.conversationContainer}>
            <Chat conversation={conversation} expanded={expanded}></Chat>
          </div>
        </div>
      </div>
    </>
  );
}

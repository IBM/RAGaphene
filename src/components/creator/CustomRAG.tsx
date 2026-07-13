/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useState, useMemo } from 'react';
import cx from 'classnames';

import { Loading } from '@carbon/react';
import { Restart, Undo, Export, Debug, Save } from '@carbon/icons-react';

import {
  User,
  ActiveGenerator,
  Message,
  ActiveRetriever,
  Plugin,
  Connector,
} from '@/types/custom';
import { collectEnrichments } from '@/src/common/utilities/enrichments';
import {
  generate,
  sendMessage,
  deleteTurn,
} from '@/src/common/utilities/messages';
import { fileTimestamp, nameInitials } from '@/src/common/utilities/string';

import { useNotification } from '@/src/components/notification/Notification';
import { useBackButton } from '@/src/common/hooks/index';
import RestartConversation from '@/src/components/creator/RestartConversation';
import UndoTurn from '@/src/components/creator/UndoTurn';
import ExportConversation from '@/src/components/creator/ExportConversation';
import ReportConversation from '@/src/components/creator/ReportConversation';
import SaveConversation from '@/src/components/creator/SaveConversation';
import { Chat } from '@/src/components/chat/Chat';
import Hints from '@/src/components/hints/Hints';

import classes from './CustomRAG.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  user: User;
  messages: Message[];
  setMessages: Function;
  retriever: ActiveRetriever | undefined;
  generator: ActiveGenerator | undefined;
  className?: string;
  /** Optional validator run before a user message is accepted. Receives the raw text; returns a [isValid, warnings[]] tuple. */
  validateMessage?: (text: string) => [boolean, string[]];
  plugins?: Plugin[];
  store?: Connector;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function CustomRAGConversationPanel({
  user,
  messages,
  setMessages,
  retriever,
  generator,
  className,
  validateMessage,
  plugins,
  store,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [loading, setLoading] = useState(false);
  const [restartConversationModalOpen, setRestartConversationModalOpen] =
    useState(false);
  const [undoConversationTurnModalOpen, setUndoConversationTurnModalOpen] =
    useState(false);
  const [exportConversationModalOpen, setExportConversationModalOpen] =
    useState(false);
  const [reportConversationModalOpen, setReportConversationModalOpen] =
    useState(false);
  const [saveConversationModalOpen, setSaveConversationModalOpen] =
    useState(false);

  // Step 2: Run effects
  // Step 2.a: Identify all available enrichments
  const availableEnrichments: {
    [key: string]: { values: Set<string>; color: string };
  } = useMemo(() => {
    return collectEnrichments(
      messages,
      plugins?.find((plugin) => plugin.name === 'enrichments'),
    );
  }, [plugins, messages]);

  // Step 2.b: Notification hook
  const { createNotification } = useNotification();
  const {} = useBackButton();

  // Step 3: Render
  return (
    <>
      <div className={cx(className, classes.panel)}>
        <RestartConversation
          open={restartConversationModalOpen}
          onSuccess={() => {
            // Step 1: Close modal
            setRestartConversationModalOpen(false);

            // Step 2: Clear conversation history and set loading to "false"
            setMessages([]);
            setLoading(false);
          }}
          onCancel={() => {
            setRestartConversationModalOpen(false);
          }}
          onClose={() => {
            setRestartConversationModalOpen(false);
          }}
        />
        <UndoTurn
          open={undoConversationTurnModalOpen}
          onSuccess={() => {
            // Step 1: Close modal
            setUndoConversationTurnModalOpen(false);

            // Step 2: Undo last conversation turn
            setMessages(deleteTurn(messages));
          }}
          onCancel={() => {
            setUndoConversationTurnModalOpen(false);
          }}
          onClose={() => {
            setUndoConversationTurnModalOpen(false);
          }}
        />

        <ExportConversation
          open={exportConversationModalOpen}
          author={user.username}
          retriever={retriever}
          generator={generator}
          messages={messages}
          onClose={() => {
            setExportConversationModalOpen(false);
          }}
          filename={`workbench_conversation_${
            nameInitials(user.name) ? nameInitials(user.name) + '_' : ''
          }${fileTimestamp()}.json`}
        />

        {retriever && generator ? (
          <ReportConversation
            open={reportConversationModalOpen}
            retriever={retriever}
            generator={generator}
            messages={messages}
            onClose={() => {
              setReportConversationModalOpen(false);
            }}
          />
        ) : null}
        {retriever && generator && store ? (
          <SaveConversation
            open={saveConversationModalOpen}
            user={user}
            retriever={retriever}
            generator={generator}
            messages={messages}
            onClose={() => {
              setSaveConversationModalOpen(false);
            }}
          />
        ) : null}

        <div className={classes.toolbar}>
          <button
            title="Undo conversation Turn"
            onClick={() => {
              setUndoConversationTurnModalOpen(true);
            }}
            disabled={messages.length < 2}
            className={cx(
              classes.toolbarAction,
              messages.length < 2 ? classes.disabled : null,
            )}
          >
            <Undo />
            <span>Undo</span>
          </button>
          <button
            title="Restart conversation"
            onClick={() => {
              setRestartConversationModalOpen(true);
            }}
            disabled={messages.length < 2}
            className={cx(
              classes.toolbarAction,
              messages.length < 2 ? classes.disabled : null,
            )}
          >
            <Restart />
            <span>Restart</span>
          </button>
          <button
            title="Export conversation"
            onClick={() => {
              setExportConversationModalOpen(true);
            }}
            disabled={!retriever || !generator || messages.length < 2}
            className={cx(
              classes.toolbarAction,
              messages.length < 2 ? classes.disabled : null,
            )}
          >
            <Export />
            <span>Export</span>
          </button>
          {plugins?.find((plugin) => plugin.name === 'InstructLab') !==
          undefined ? (
            <button
              title="Report"
              onClick={() => {
                setReportConversationModalOpen(true);
              }}
              disabled={!retriever || !generator || messages.length < 2}
              className={cx(
                classes.toolbarAction,
                messages.length < 2 ? classes.disabled : null,
              )}
            >
              <Debug />
              <span>Report</span>
            </button>
          ) : null}
          {store !== undefined ? (
            <button
              title="Save conversation"
              onClick={() => {
                setSaveConversationModalOpen(true);
              }}
              disabled={
                !retriever || !generator || !store || messages.length < 2
              }
              className={cx(
                classes.toolbarAction,
                messages.length < 2 ? classes.disabled : null,
              )}
            >
              <Save />
              <span>Save</span>
            </button>
          ) : null}
        </div>
        <Hints messages={messages} />
        {loading && messages.length === 0 ? (
          <div className={classes.loadingContainer}>
            <Loading withOverlay={false} />
          </div>
        ) : (
          <>
            {loading && <Loading />}
            <Chat
              user={user}
              messages={messages}
              greetingMessageText={
                retriever &&
                retriever?.collection &&
                retriever?.collection?.name
                  ? `Hi, ${user.firstName}! I’m your virtual assistant. I can help answer a variety of questions regarding "` +
                    retriever?.collection?.name +
                    '" collection. How can I help you today?'
                  : undefined
              }
              sendMessage={(messages: Message[]) => {
                if (retriever && generator) {
                  return sendMessage(generator, retriever, messages);
                }
              }}
              setMessages={setMessages}
              editable
              onRedo={async (onSuccess?: Function) => {
                // Step 1: Define
                async function run() {
                  if (generator) {
                    const [output, notifications] = await generate(
                      generator,
                      messages.slice(0, -1),
                      messages[messages.length - 1].contexts,
                    );

                    if (!isEmpty(notifications)) {
                      notifications.forEach((notification) =>
                        createNotification(notification),
                      );
                    }

                    // Update messages, if output is not undefined
                    if (output !== undefined) {
                      setMessages(
                        messages.map((message, idx) =>
                          idx !== messages.length - 1
                            ? message
                            : {
                                ...message,
                                ...output,
                                ...(message.originalText && {
                                  originalText: null,
                                }),
                              },
                        ),
                      );

                      if (onSuccess) {
                        onSuccess();
                      }
                    }
                    setLoading(false);
                  }
                }
                // Step 2: Set loading to true
                setLoading(true);

                // Step 3: Run
                await run();
              }}
              validateMessage={validateMessage}
              disabled={generator === undefined}
              collectMessageFeedback={
                generator?.connector.settings.feedback?.enabled
              }
              collectContextFeedback={
                retriever?.connector.settings.feedback?.enabled
              }
              availableEnrichments={availableEnrichments}
            ></Chat>
          </>
        )}
      </div>
    </>
  );
}

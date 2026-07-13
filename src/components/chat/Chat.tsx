/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { cloneDeep, isEmpty, last } from 'lodash';
import { useState, useEffect, useRef } from 'react';

import { User, Message, Hint, Alternative, Document } from '@/types/custom';
import {
  GREETING_MESSAGE,
  MISSING_ENRICHMENT_WARNING,
} from '@/src/common/constants';
import { hash } from '@/src/common/utilities/string';
import InputBox from '@/src/components/chat/InputBox';
import { useNotification } from '@/src/components/notification/Notification';
import { ChatLine, LoadingChatLine } from '@/src/components/chatline/ChatLine';

import classes from './Chat.module.scss';
import { InlineNotification } from '@carbon/react';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface ChatProps {
  user: User;
  messages: Message[];
  sendMessage: Function;
  setMessages: Function;
  editable?: boolean;
  /** Called when the user clicks Re-generate. Receives an optional success callback invoked after the new response arrives. Matches the onRedo signature passed by CustomRAG.tsx. */
  onRedo?: (onSuccess?: () => void) => void;
  /** Optional validator run before a user message is accepted. Receives the raw text; returns a [isValid, warnings[]] tuple. */
  validateMessage?: (text: string) => [boolean, string[]];
  disabled?: boolean;
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  collectMessageFeedback?: boolean;
  collectContextFeedback?: boolean;
  greetingMessageText?: string;
}

interface MessagesProps {
  user: User;
  messages: Message[];
  editable?: boolean;
  /** Called with the message index and the new text string after an inline edit is confirmed. */
  onEditMessageText?: (messageIdx: number, editedMessageText: string) => void;
  /** Called when the user clicks Re-generate. Receives an optional success callback invoked after the new response arrives. */
  onRedo?: (onSuccess?: () => void) => void;
  /** Called with the message index and the fully updated Message object after the user records a response-level feedback value. */
  onMessageFeedback?: (
    updatedMessageIdx: number,
    updatedMessage: Message,
  ) => void;
  /** Called with the message index and the fully updated Message object after the user records a context-level feedback value. */
  onContextFeedback?: (
    updatedMessageIdx: number,
    updatedMessage: Message,
  ) => void;
  /** Called with the message index and the Document to remove from that message's contexts. */
  onDeleteContext?: (messageIdx: number, contextToBeDeleted: Document) => void;
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  /** Called with the message index and the updated enrichments map after an enrichment change. */
  onChangeMessageEnrichments?: (
    updatedMessageIdx: number,
    updatedEnrichments: { [key: string]: string[] },
  ) => void;
  /** Called with true/false to disable the text input while a ChatLine is in edit mode; an optional reason string explains why to the user. */
  onDisableInput?: (disabled: boolean, reason?: string) => void;
  /** Called with the message index and the updated alternatives array after any alternative is added, edited, or deleted. */
  onUpdateAlternatives?: (
    updatedMessageIdx: number,
    updatedAlternatives: Alternative[],
  ) => void;
  greetingMessageText?: string;
}

// ===================================================================================
//                               CONSTANTS
// ===================================================================================
export const initialMessages: Message[] = [];

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function Messages({
  user,
  messages,
  editable = false,
  onEditMessageText,
  onRedo,
  onMessageFeedback,
  onContextFeedback,
  onDeleteContext,
  availableEnrichments,
  onChangeMessageEnrichments,
  onDisableInput,
  onUpdateAlternatives,
  greetingMessageText,
}: MessagesProps) {
  // Step 1: Initialize state and necessary variables
  const anchorRef = useRef<HTMLDivElement>(null);

  // Step 2: Run effects
  // Step 2.a: Scroll latest message into view
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [messages.length]);

  return (
    <div className={classes.messageList}>
      <ChatLine
        id={`response--placeholder`}
        message={{
          speaker: 'agent',
          text: greetingMessageText
            ? greetingMessageText
            : `Hi, ${user.firstName}! ${GREETING_MESSAGE}`,
          timestamp: Math.floor(Date.now() / 1000),
        }}
        user={user}
      />

      {messages.map((message, messageIdx) => {
        return (
          <ChatLine
            id={`response-${messageIdx}`}
            message={message}
            user={user}
            latestResponse={messageIdx === messages.length - 1}
            key={`response-${messageIdx}`}
            editable={
              editable &&
              message.speaker === 'agent' &&
              messageIdx === messages.length - 1
            }
            onEditMessageText={(editedMessageText) => {
              if (onEditMessageText) {
                onEditMessageText(messageIdx, editedMessageText);
              }
            }}
            open={messageIdx === messages.length - 1 ? true : false}
            onMessageFeedback={
              onMessageFeedback
                ? (metric, value) => {
                    if (onMessageFeedback) {
                      // Create deep copy of the message
                      const updatedMessage = cloneDeep(message);

                      // Record feedback for specfied context
                      if (updatedMessage.feedback) {
                        if (updatedMessage.feedback.metric) {
                          updatedMessage.feedback[metric][user.username] = {
                            value: value,
                            timestamp: Math.floor(Date.now() / 1000),
                          };
                        } else {
                          updatedMessage.feedback[metric] = {
                            [user.username]: {
                              value: value,
                              timestamp: Math.floor(Date.now() / 1000),
                            },
                          };
                        }
                      } else {
                        updatedMessage.feedback = {
                          [metric]: {
                            [user.username]: {
                              value: value,
                              timestamp: Math.floor(Date.now() / 1000),
                            },
                          },
                        };
                      }

                      // Trigger onMessageFeedback function
                      onMessageFeedback(messageIdx, updatedMessage);
                    }
                  }
                : undefined
            }
            onContextFeedback={
              onContextFeedback
                ? (contextIndex, metric, value) => {
                    if (onContextFeedback) {
                      // Create deep copy of the message
                      const updatedMessage = cloneDeep(message);

                      // Record feedback for specfied context
                      if (updatedMessage.contexts[contextIndex].feedback) {
                        if (
                          updatedMessage.contexts[contextIndex].feedback.metric
                        ) {
                          updatedMessage.contexts[contextIndex].feedback.metric[
                            user.username
                          ] = {
                            value: value,
                            timestamp: Math.floor(Date.now() / 1000),
                          };
                        } else {
                          updatedMessage.contexts[contextIndex].feedback[
                            metric
                          ] = {
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
                      onContextFeedback(messageIdx, updatedMessage);
                    }
                  }
                : undefined
            }
            onRedo={onRedo}
            onDeleteContext={
              onDeleteContext
                ? (contextTobeDeleted) => {
                    onDeleteContext(messageIdx, contextTobeDeleted);
                  }
                : undefined
            }
            availableEnrichments={availableEnrichments}
            onChangeMessageEnrichments={(updatedEnrichments) => {
              if (onChangeMessageEnrichments) {
                onChangeMessageEnrichments(messageIdx, updatedEnrichments);
              }
            }}
            onDisableParent={onDisableInput}
            onUpdateAlternatives={(updatedAlternatives) => {
              if (onUpdateAlternatives) {
                onUpdateAlternatives(messageIdx, updatedAlternatives);
              }
            }}
          />
        );
      })}
      <div ref={anchorRef} className={classes.anchor} />
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export function Chat({
  user,
  messages,
  sendMessage,
  setMessages,
  editable,
  onRedo,
  validateMessage,
  disabled = false,
  collectMessageFeedback = false,
  collectContextFeedback = false,
  availableEnrichments,
  greetingMessageText,
}: ChatProps) {
  const [waiting, setWaiting] = useState(false);
  const [disabledInput, setDisabledInput] = useState(false);
  const [disabledInputReason, setDisabledInputReason] = useState<
    string | undefined
  >(undefined);
  const [hints, setHints] = useState<Hint[]>([]);

  // Step 2: Run effects
  // Step 2.a: Create notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Disable input, if disabled is set to true
  useEffect(() => {
    setDisabledInput(disabled);
  }, [disabled, messages.length]);

  // Step 2.c: Reset disabled input reason on conversation change
  useEffect(() => {
    setDisabledInputReason(undefined);
  }, [messages.length]);

  return (
    <div className={classes.container}>
      <Messages
        user={user}
        greetingMessageText={greetingMessageText}
        messages={messages}
        editable={editable}
        onEditMessageText={(
          editedMessageIdx: number,
          editedMessageText: string,
        ) => {
          // Step 3.a: Validate edited message
          let warnings: string[] = [];
          if (validateMessage) {
            [, warnings] = validateMessage(editedMessageText);
          }

          // Step 3.b: Update message
          setMessages(
            messages.map((message, idx) => {
              if (idx === editedMessageIdx) {
                return {
                  ...message,
                  text: editedMessageText,
                  warnings: warnings,
                  ...(!message.originalText && {
                    originalText: message.text,
                  }),
                };
              } else {
                return message;
              }
            }),
          );
        }}
        onRedo={onRedo}
        onMessageFeedback={
          collectMessageFeedback
            ? (updatedMessageIdx, updatedMessage) => {
                setMessages(
                  messages.map((message, idx) => {
                    if (idx === updatedMessageIdx) {
                      return updatedMessage;
                    } else {
                      return message;
                    }
                  }),
                );
              }
            : undefined
        }
        onContextFeedback={
          collectContextFeedback
            ? (updatedMessageIdx, updatedMessage) => {
                setMessages(
                  messages.map((message, idx) => {
                    if (idx === updatedMessageIdx) {
                      return updatedMessage;
                    } else {
                      return message;
                    }
                  }),
                );
              }
            : undefined
        }
        onDeleteContext={(messageIdx, contextToBeDeleted) => {
          setMessages(
            messages.map((message, idx) => {
              if (idx === messageIdx) {
                return {
                  ...message,
                  contexts: message.contexts?.filter(
                    (context) =>
                      context.document_id !== contextToBeDeleted.document_id,
                  ),
                };
              } else {
                return message;
              }
            }),
          );
        }}
        availableEnrichments={availableEnrichments}
        onChangeMessageEnrichments={(updatedMessageIdx, updatedEnrichments) => {
          setMessages(
            messages.map((message, idx) => {
              if (idx === updatedMessageIdx) {
                return {
                  ...message,
                  enrichments: updatedEnrichments,
                  ...(isEmpty(updatedEnrichments)
                    ? { warnings: [MISSING_ENRICHMENT_WARNING] }
                    : message.warnings
                      ? {
                          warnings: message.warnings.filter(
                            (warning) => warning !== MISSING_ENRICHMENT_WARNING,
                          ),
                        }
                      : {}),
                };
              } else {
                return message;
              }
            }),
          );
        }}
        onDisableInput={(disable, reason) => {
          setDisabledInput(disable);
          setDisabledInputReason(reason);
        }}
        onUpdateAlternatives={(updatedMessageIdx, updatedAlternatives) => {
          setMessages(
            messages.map((message, idx) => {
              if (idx === updatedMessageIdx) {
                return {
                  ...message,
                  alternatives: updatedAlternatives,
                };
              } else {
                return message;
              }
            }),
          );
        }}
      />

      {waiting ? <LoadingChatLine user={user} /> : null}
      {hints
        ? hints.map((hint) => (
            <div key={`hint-${hash(hint.title)}`} className={classes.hint}>
              <InlineNotification
                hideCloseButton={false}
                title={hint.title}
                kind={hint.kind}
                subtitle={hint.subtitle}
                onCloseButtonClick={() => {
                  setHints(hints.filter((entry) => entry.title !== hint.title));
                }}
              ></InlineNotification>
            </div>
          ))
        : null}
      <InputBox
        disabled={disabledInput}
        onSubmit={async (userMessageText: string) => {
          // Step 1: Save old messages array to be able to revert in case of error
          const oldMessages = messages;

          // Step 2: Add last typed user message to messages array (conversation history)
          const updatedMessages = [
            ...messages,
            {
              text: userMessageText,
              speaker: 'user',
              timestamp: Math.floor(Date.now() / 1000),
            } as Message,
          ];
          setMessages(updatedMessages);

          // Step 3: Set waiting to "true" to show "..." chat bubble as agent response
          setWaiting(true);

          // Step 4: Make necerssary API call
          const [response, notifications] = await sendMessage(updatedMessages);

          // Step 5: If notifications, generate notification
          if (!isEmpty(notifications)) {
            notifications.forEach((notification) => {
              createNotification(notification);
            });
          }

          // Step 6: Add recieved responses to messages array (conversation history)
          if (response) {
            // Step 6.a: Add enrichment warning, if necessary to last 'user' message
            const lastUserMessage = updatedMessages[updatedMessages.length - 1];
            if (
              availableEnrichments &&
              (lastUserMessage.enrichments === undefined ||
                isEmpty(lastUserMessage.enrichments))
            ) {
              if (lastUserMessage.warnings) {
                updatedMessages[updatedMessages.length - 1].warnings?.push(
                  MISSING_ENRICHMENT_WARNING,
                );
              } else {
                updatedMessages[updatedMessages.length - 1].warnings = [
                  MISSING_ENRICHMENT_WARNING,
                ];
              }
            }
            setMessages([...updatedMessages, response]);
          } else {
            setMessages(oldMessages);
          }

          // Step 5: Set waiting to "false" to stop showing "..." chat bubble as agent response
          setWaiting(false);
        }}
        warnText={disabledInputReason}
      />
    </div>
  );
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import { Modal, CodeSnippet, Checkbox } from '@carbon/react';

import { ActiveRetriever, ActiveGenerator, Message } from '@/types/custom';
import {
  formatMessages,
  formatRetriever,
  formatGenerator,
} from '@/src/common/utilities/formatter';
import { CURRENT_SCHEMA_VERSION } from '@/src/common/utilities/migration';
import { fileTimestamp } from '@/src/common/utilities/string';
import {
  validateConversationDiversity,
  computeUniqueRelevantContexts,
  validateContextsRelevancy,
} from '@/src/common/utilities/validators';

import classes from './ExportConversation.module.scss';

const DEFAULT_CHECKLIST = {
  responses: {
    faithfulness: false,
    completeness: false,
    style: false,
    appropriateness: false,
  },
  passages: false,
  enrichments: false,
  diversity: false,
};

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  author: string;
  messages: Message[];
  onClose: Function;
  open: boolean;
  filename?: string;
  retriever?: ActiveRetriever;
  generator?: ActiveGenerator;
  prompt?: boolean;
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================
export default function ExportConversation({
  author,
  messages,
  onClose,
  open = false,
  filename,
  retriever,
  generator,
  prompt = false,
}: Props) {
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);

  // Step 2: Run effects
  // Step 2.a: Reset checklist if conversation has changed
  useEffect(() => {
    setChecklist(DEFAULT_CHECKLIST);
  }, [messages]);

  // Step 2.b: Prepare conversation for export
  const conversationToExport = useMemo(() => {
    return JSON.stringify(
      {
        schema_version: CURRENT_SCHEMA_VERSION,
        author: author,
        ...(retriever && { retriever: formatRetriever(retriever) }),
        ...(generator && { generator: formatGenerator(generator) }),
        messages: formatMessages(messages, prompt),
        status: 'created',
        status_history: [
          {
            author: author,
            status: 'created',
            timestamp: Math.floor(Date.now() / 1000),
          },
        ],
      },
      null,
      2,
    );
  }, [author, messages, retriever, generator, prompt]);

  // Step 2.c: Run validators
  const responseVerificationWarningText = useMemo(() => {
    let numEditedResponses: number = 0;
    if (!isEmpty(messages)) {
      messages.forEach((message, messageIdx) => {
        if (message.speaker === 'agent' && message.originalText !== undefined) {
          numEditedResponses++;
        }
      });
    }

    return `You had ${numEditedResponses} edited responses. Please ensure that all responses are checked for 'Faithfuless', 'Completeness', 'Style' and 'Appropriateness'.`;
  }, [messages]);

  const passagesVerificationWarningText = useMemo(() => {
    const passageVerificationError = validateContextsRelevancy(messages);

    if (passageVerificationError) {
      return passageVerificationError.recommendation;
    }

    return '';
  }, [messages]);

  const enrichmentsVerificationWarningText = useMemo(() => {
    let numMessagesWithoutEnrichments: number = 0;
    if (!isEmpty(messages)) {
      messages.forEach((message) => {
        if (
          message.speaker === 'user' &&
          (message.enrichments === undefined || isEmpty(message.enrichments))
        ) {
          numMessagesWithoutEnrichments++;
        }
      });
    }

    if (numMessagesWithoutEnrichments > 0) {
      return `Please ensure at least one enrichment is added to each question. We found ${numMessagesWithoutEnrichments} question${numMessagesWithoutEnrichments > 1 ? 's' : ''} without enrichments.`;
    }
    return '';
  }, [messages]);

  const [diversityVerificationWarningText, relevantContextIds] = useMemo(() => {
    const uniqueRelevantContexts = computeUniqueRelevantContexts(messages);
    const diversityIssue = validateConversationDiversity(messages);
    if (diversityIssue) {
      return [diversityIssue.recommendation, uniqueRelevantContexts];
    }
    return ['', uniqueRelevantContexts];
  }, [messages]);

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
        element.setAttribute(
          'download',
          filename
            ? filename
            : `workbench_conversation_${fileTimestamp()}.json`,
        );

        // Step 1.c: Add to DOM tree and click it
        document.body.appendChild(element);
        element.click();

        // Step 1.d : Cleanup
        document.body.removeChild(element);

        // Step 2: Close model
        onClose();
      }}
      onRequestClose={() => {
        onClose();
      }}
      primaryButtonDisabled={
        !Object.values(checklist.responses).every((value) => value === true) ||
        !checklist.passages ||
        !checklist.enrichments ||
        !checklist.diversity
      }
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
        <span className={classes.checklistHeading}>Checklist</span>
        <Checkbox
          labelText="Verified (edited, if necessary) responses for"
          id="responses-verification__checkbox"
          disabled={true}
          checked={Object.values(checklist.responses).every(
            (value) => value === true,
          )}
          invalid={
            !Object.values(checklist.responses).every((value) => value === true)
          }
          invalidText={responseVerificationWarningText}
        />
        <div className={classes.subChecklist}>
          <Checkbox
            labelText="Faithfulness"
            id="responses-verification__checkbox-Faithfulness"
            helperText="Responses are factual and accurate according to the passages"
            checked={checklist.responses.faithfulness}
            onChange={(evt, data) => {
              setChecklist({
                ...checklist,
                responses: {
                  ...checklist.responses,
                  faithfulness: data.checked,
                },
              });
            }}
          />
          <Checkbox
            labelText="Completeness"
            id="responses-verification__checkbox-Completeness"
            helperText="Responses contains all relevant information from the passages that answers the questions"
            checked={checklist.responses.completeness}
            onChange={(evt, data) => {
              setChecklist({
                ...checklist,
                responses: {
                  ...checklist.responses,
                  completeness: data.checked,
                },
              });
            }}
          />
          <Checkbox
            labelText="Style"
            id="responses-verification__checkbox-Style"
            helperText="Responses read naturally and coherent"
            checked={checklist.responses.style}
            onChange={(evt, data) => {
              setChecklist({
                ...checklist,
                responses: {
                  ...checklist.responses,
                  style: data.checked,
                },
              });
            }}
          />
          <Checkbox
            labelText="Appropriateness"
            id="responses-verification__checkbox-Appropriateness"
            helperText="Responses are useful and concise for answering the questions"
            checked={checklist.responses.appropriateness}
            onChange={(evt, data) => {
              setChecklist({
                ...checklist,
                responses: {
                  ...checklist.responses,
                  appropriateness: data.checked,
                },
              });
            }}
          />
        </div>
        <Checkbox
          labelText="Marked relevant passages"
          id="passages-verification__checkbox"
          helperText="Relevant passages have information that helps answer the questions"
          checked={checklist.passages}
          onChange={(evt, data) => {
            setChecklist({
              ...checklist,
              passages: data.checked,
            });
          }}
          invalid={!isEmpty(passagesVerificationWarningText)}
          invalidText={passagesVerificationWarningText}
        />
        <Checkbox
          labelText="Added all taxonomy enrichments to each question"
          id="enrichments-verification__checkbox"
          checked={checklist.enrichments}
          onChange={(evt, data) => {
            setChecklist({
              ...checklist,
              enrichments: data.checked,
            });
          }}
          invalid={!isEmpty(enrichmentsVerificationWarningText)}
          invalidText={enrichmentsVerificationWarningText}
        />
        <Checkbox
          labelText="Ensured context diversity"
          id="diversity-verification__checkbox"
          checked={checklist.diversity}
          onChange={(evt, data) => {
            setChecklist({
              ...checklist,
              diversity: data.checked,
            });
          }}
          invalid={!isEmpty(diversityVerificationWarningText)}
          invalidText={diversityVerificationWarningText}
          helperText={`There ${relevantContextIds.size === 1 ? 'is' : 'are'} ${relevantContextIds.size} unique relevant passage${relevantContextIds.size === 1 ? '' : 's'} for ${messages.length / 2} question${messages.length / 2 > 1 ? 's' : ''}.`}
        />
      </div>
    </Modal>
  );
}

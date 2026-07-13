/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty, cloneDeep } from 'lodash';
import DOMPurify from 'dompurify';
import cx from 'classnames';
import Balancer from 'react-wrap-balancer';
import { useState, useMemo, useEffect, useRef } from 'react';
import { diff_match_patch } from '@/src/common/utilities/diff_match_patch_uncompressed';

import {
  Tooltip,
  RadioButtonGroup,
  RadioButton,
  Select,
  SelectItem,
  TextInput,
  TextArea,
  Button,
  Tag,
} from '@carbon/react';
import {
  WarningAlt,
  DocumentView as DocumentViewIcon,
  Add,
  DataEnrichmentAdd,
  Close,
  Edit,
  Information,
  TextHighlight,
  PromptTemplate,
  Renew,
  StringText,
} from '@carbon/icons-react';

import {
  Message,
  User,
  Feedback,
  SentenceMatchObject,
  Alternative,
  Document,
} from '@/types/custom';
import {
  hash,
  sentenceOverlaps,
  aggregateCoverage,
} from '@/src/common/utilities/string';
import { mark } from '@/src/common/utilities/highlighter';
import Avatar from '@/src/components/avatar/Avatar';
import DocumentsViewer from '@/src/components/documents/DocumentsViewer';
import PromptViewer from '@/src/components/prompt-viewer/PromptViewer';
import Alternatives from '@/src/components/chatline/Alternatives';

import classes from './ChatLine.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface ChatLineProps {
  id: string;
  message: Message;
  user: User;
  latestResponse?: boolean;
  editable?: boolean;
  /** Called with the new text string when the user finishes editing a message inline. */
  onEditMessageText?: (editedMessageText: string) => void;
  /** Called with the feedback metric name (e.g. 'appropriateness') and the selected value string when the user picks a radio button on the agent response. */
  onMessageFeedback?: (metric: string, value: string) => void;
  /** Called with the zero-based context index, the metric name, and the selected value string when the user rates a retrieved document. */
  onContextFeedback?: (
    contextIndex: number,
    metric: string,
    value: string,
  ) => void;
  /** Called when the user clicks Re-generate. Receives an optional success callback that is invoked after the new response arrives. */
  onRedo?: (onSuccess?: () => void) => void;
  /** Called with the Document object the user wants to remove from the retrieved contexts. */
  onDeleteContext?: (contextToBeDeleted: Document) => void;
  open?: boolean;
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  /** Called with the full updated enrichments map after an enrichment is added or removed. */
  onChangeMessageEnrichments?: (updatedEnrichments: {
    [key: string]: string[];
  }) => void;
  /** Called with true when the ChatLine enters an editing state that should lock the parent input, and false when editing ends. An optional human-readable reason string is passed alongside true. */
  onDisableParent?: (disabled: boolean, reason?: string) => void;
  onSelection?: (component: string, x: number, y: number) => void;
  /** Called with the full updated alternatives array after an alternative is added, edited, or deleted. */
  onUpdateAlternatives?: (updatedAlternatives: Alternative[]) => void;
  focused?: boolean;
  scrollSeq?: number;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function CoverageMeter({
  overlaps,
  sourceLength,
}: {
  overlaps: SentenceMatchObject[][];
  sourceLength: number;
}) {
  const fraction = aggregateCoverage(overlaps, sourceLength);
  const pct = Math.round(fraction * 100);

  return (
    <Tooltip
      align="bottom-left"
      label="Fraction of response tokens that appear verbatim in any retrieved document. Higher means more of the response is directly traceable to source text."
    >
      <div className={classes.coverageMeter} aria-label={`Grounding: ${pct}%`}>
        <div
          className={classes.coveragePie}
          style={{ '--pct': pct } as React.CSSProperties}
          aria-hidden="true"
        />
        <span className={classes.coverageMeterLabel}>Grounding</span>
        <span className={classes.coveragePct}>{pct}%</span>
      </div>
    </Tooltip>
  );
}

function MessageText({
  id,
  message,
  showOverlap = false,
  sentences,
}: {
  id: string;
  message: Message;
  showOverlap: boolean;
  sentences: SentenceMatchObject[];
}) {
  // Step 1: Add span tokens indicating overlaps, if requested.
  // Flatten phrase matches from all relevant sentences for source-side highlighting.
  const phraseMatches = sentences.flatMap((s) => s.phraseMatches);
  const text =
    showOverlap && phraseMatches.length > 0
      ? mark(message.text, phraseMatches, 'source')
      : message.text;

  // Step 2: Find all span tokens from step 1
  const matches = [...text.matchAll(/<span(.*?)>([\S\s]*?)<\/span>/g)];
  if (!isEmpty(matches)) {
    return matches.map((match, matchIdx) => {
      if (!isEmpty(match[2]) && match[2] !== '\n') {
        if (match[2].includes('\n')) {
          return match[2].split('\n').map((line, i) => (
            <span
              key={`${id}-text--span-${matchIdx}--${i}`}
              id={`${id}-text--span-${matchIdx}`}
              {...(!isEmpty(match[1]) ? { className: 'copiedText' } : {})}
            >
              {line}
              <br />
            </span>
          ));
        } else {
          return (
            <span
              key={`${id}-text--span-${matchIdx}`}
              id={`${id}-text--span-${matchIdx}`}
              {...(!isEmpty(match[1]) ? { className: 'copiedText' } : {})}
            >
              {match[2]}
            </span>
          );
        }
      } else {
        return null;
      }
    });
  } else {
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        <br />
      </span>
    ));
  }
}

function MessageFeedback({
  id,
  onSelection,
  feedback,
  user,
  disabled = false,
}: {
  id: string;
  /** Called with the metric name and selected value when the user picks a radio option. */
  onSelection: (metric: string, value: string) => void;
  feedback: Feedback | undefined;
  user: User;
  disabled?: boolean;
}) {
  return (
    <div className={classes.feedbackContainer}>
      <h5>Feedback</h5>
      <div className={classes.feedbackMetricContainer}>
        <div className={classes.feedbackMetricDescription}>
          <span>Appropriateness</span>
          <Tooltip align="right" label={'Is this response appropriate?'}>
            <Information />
          </Tooltip>
        </div>
        <div className={classes.feedbackMetricValues}>
          <RadioButtonGroup
            id={`${id}--appropriateness`}
            name={`${id}--appropriateness`}
            onChange={(selection) => {
              onSelection('appropriateness', String(selection));
            }}
            valueSelected={feedback?.appropriateness?.[user.username]['value']}
          >
            <RadioButton
              labelText="No"
              value="1"
              id={`${id}--appropriateness--no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly no"
              value="2"
              id={`${id}--appropriateness--mostly-no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly yes"
              value="3"
              id={`${id}--appropriateness--mostly-mostly-yes`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Yes"
              value="4"
              id={`${id}--appropriateness--mostly-yes`}
              disabled={disabled}
            />
          </RadioButtonGroup>
        </div>
      </div>
      <div className={classes.feedbackMetricContainer}>
        <div className={classes.feedbackMetricDescription}>
          <span>Faithfulness</span>
          <Tooltip
            align="right"
            label={'Is this response faithful to documents?'}
          >
            <Information />
          </Tooltip>
        </div>
        <div className={classes.feedbackMetricValues}>
          <RadioButtonGroup
            id={`${id}--faithfulness`}
            name={`${id}--faithfulness`}
            onChange={(selection) => {
              onSelection('faithfulness', String(selection));
            }}
            valueSelected={feedback?.faithfulness?.[user.username]['value']}
          >
            <RadioButton
              labelText="No"
              value="1"
              id={`${id}--faithfulness--no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly no"
              value="2"
              id={`${id}--faithfulness--mostly-no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly yes"
              value="3"
              id={`${id}--faithfulness--mostly-mostly-yes`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Yes"
              value="4"
              id={`${id}--faithfulness--mostly-yes`}
              disabled={disabled}
            />
          </RadioButtonGroup>
        </div>
      </div>
      <div className={classes.feedbackMetricContainer}>
        <div className={classes.feedbackMetricDescription}>
          <span>Completeness</span>
          <Tooltip
            align="right"
            label={'Does this response completely address user inquiry?'}
          >
            <Information />
          </Tooltip>
        </div>
        <div className={classes.feedbackMetricValues}>
          <RadioButtonGroup
            id={`${id}--completeness`}
            name={`${id}--completeness`}
            onChange={(selection) => {
              onSelection('completeness', String(selection));
            }}
            valueSelected={feedback?.completeness?.[user.username]['value']}
          >
            <RadioButton
              labelText="No"
              value="1"
              id={`${id}--completeness--no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly no"
              value="2"
              id={`${id}--completeness--mostly-no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Mostly yes"
              value="3"
              id={`${id}--completeness--mostly-mostly-yes`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Yes"
              value="4"
              id={`${id}--completeness--mostly-yes`}
              disabled={disabled}
            />
          </RadioButtonGroup>
        </div>
      </div>
    </div>
  );
}

function EnrichmentsViewer({
  enrichments,
  onDelete,
  colors,
}: {
  enrichments: { [key: string]: string[] };
  /** Called with the enrichment type key and value string when the user removes a tag. */
  onDelete?: (enrichmentType: string, enrichmentValue: string) => void;
  colors: { [key: string]: string };
}) {
  // Step 2: Render
  return (
    <div className={classes.enrichmentsViewer}>
      <span className={classes.enrichmentsTitle}>Applied Enrichments</span>
      <div className={classes.enrichments}>
        {Object.entries(enrichments).map(
          ([enrichmentType, enrichmentValues], enrichmentIdx) => {
            return Array.from(enrichmentValues).map((enrichmentValue) => (
              <Tag
                key={`{message__enrichment--${enrichmentType}-${enrichmentValue}}`}
                filter={onDelete !== undefined}
                title={'Remove enrichment'}
                onClose={
                  onDelete
                    ? () => onDelete(enrichmentType, enrichmentValue)
                    : () => {}
                }
                //@ts-ignore
                type={colors[enrichmentType] || 'outline'}
              >
                {enrichmentValue}
              </Tag>
            ));
          },
        )}
      </div>
    </div>
  );
}

function AddEnrichment({
  availableEnrichments,
  onSubmit,
}: {
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  /** Called with the enrichment type key and value string when the user submits a new enrichment. */
  onSubmit: (enrichmentType: string, enrichmentValue: string) => void;
}) {
  // Step 1: Initialize state and necessary variables
  const [selectedEnrichmentType, setSelectedEnrichmentType] =
    useState<string>('Custom');
  const [selectedEnrichmentValue, setSelectedEnrichmentValue] =
    useState<string>('Custom');
  const [enrichmentValue, setEnrichmentValue] = useState<string>('');
  const [enrichmentType, setEnrichmentType] = useState<string>('');

  useEffect(() => {
    setSelectedEnrichmentType(
      availableEnrichments && !isEmpty(availableEnrichments)
        ? Object.keys(availableEnrichments)[0]
        : 'Custom',
    );
  }, [hash(JSON.stringify(availableEnrichments))]);

  useEffect(() => {
    setSelectedEnrichmentValue(
      availableEnrichments &&
        !isEmpty(availableEnrichments) &&
        selectedEnrichmentType !== 'Custom' &&
        availableEnrichments[selectedEnrichmentType].values &&
        !isEmpty(availableEnrichments[selectedEnrichmentType].values)
        ? Array.from(availableEnrichments[selectedEnrichmentType].values)[0]
        : 'Custom',
    );
  }, [hash(JSON.stringify(availableEnrichments)), selectedEnrichmentType]);

  return (
    <div className={classes.enrichmentSpecification}>
      <Select
        id="enrichment-type__selector"
        labelText="Select enrichment type"
        onChange={(event) => {
          setSelectedEnrichmentType(event.target.value);
        }}
      >
        {availableEnrichments && !isEmpty(availableEnrichments)
          ? Object.keys(availableEnrichments).map((entry) => (
              <SelectItem
                key={`enrichment-type__selector--${entry}`}
                value={entry}
                text={entry}
              />
            ))
          : null}
        <hr></hr>
        <SelectItem
          key="enrichment-type__selector--placeholder"
          value="Custom"
          text="Create new type"
        />
      </Select>
      {selectedEnrichmentType === 'Custom' ? (
        <TextInput
          id="enrichment-type__input"
          type="text"
          labelText="Specify enrichment type"
          value={enrichmentType}
          invalid={
            selectedEnrichmentType === 'Custom' && isEmpty(enrichmentType)
          }
          invalidText={'Enrichment type must be specified'}
          onChange={(event) => {
            setEnrichmentType(event.target.value);
          }}
        />
      ) : availableEnrichments &&
        !isEmpty(availableEnrichments) &&
        availableEnrichments[selectedEnrichmentType] &&
        !isEmpty(availableEnrichments[selectedEnrichmentType]) ? (
        <Select
          key={`enrichment-value__selector--${selectedEnrichmentType}`}
          id="enrichment-value__selector"
          labelText="Select enrichment value"
          onChange={(event) => {
            setSelectedEnrichmentValue(event.target.value);
          }}
        >
          {Array.from(availableEnrichments[selectedEnrichmentType].values).map(
            (entry) => (
              <SelectItem
                key={`enrichment-value__selector--${entry}`}
                value={entry}
                text={entry}
              />
            ),
          )}
          <hr></hr>
          <SelectItem
            key="enrichment-value__selector--placeholder"
            value="Custom"
            text="Create new value"
          />
        </Select>
      ) : null}
      {selectedEnrichmentValue === 'Custom' ? (
        <TextInput
          id="enrichment-value__input"
          type="text"
          labelText="Specify enrichment value"
          value={enrichmentValue}
          disabled={
            selectedEnrichmentType === 'Custom' && isEmpty(enrichmentType)
          }
          invalid={isEmpty(enrichmentValue)}
          invalidText={'Enrichment value must be specified'}
          onChange={(event) => {
            setEnrichmentValue(event.target.value);
          }}
        />
      ) : null}
      <Button
        renderIcon={Add}
        iconDescription="Add enrichment"
        hasIconOnly
        onClick={() => {
          // Step 1: Add enrichment
          onSubmit(
            selectedEnrichmentType === 'Custom'
              ? enrichmentType
              : selectedEnrichmentType,
            selectedEnrichmentValue === 'Custom'
              ? enrichmentValue
              : selectedEnrichmentValue,
          );

          // Step 2: Reset enrichment type and enrichment value
          setEnrichmentType('');
          setEnrichmentValue('');
        }}
        disabled={
          (selectedEnrichmentType === 'Custom' &&
            isEmpty(enrichmentType.trim())) ||
          (selectedEnrichmentValue === 'Custom' &&
            isEmpty(enrichmentValue.trim()))
        }
      ></Button>
    </div>
  );
}

function Diff({
  originalText,
  editedText,
}: {
  originalText: string;
  editedText: string;
}) {
  // Step 1: Run effects
  const html = useMemo(() => {
    // Step 1: Initialize necessary variables
    const dmp = new diff_match_patch();

    // Step 2: Calculate difference between original text and edited text
    const diffs = dmp.diff_main(originalText, editedText, false);

    // Step 3: Reduce the number of edits by eliminating semantically trivial equalities
    dmp.diff_cleanupSemantic(diffs);

    // Step 4: Create HTML
    let htmlText = dmp.diff_prettyHtml(diffs);
    htmlText = htmlText.replaceAll(
      'background:#ffe6e6;',
      'background:#ffcdcd; color:#79808a;',
    );
    htmlText = htmlText.replaceAll(
      'background:#e6ffe6;',
      'background:#cdffcd; color:#79808a;',
    );

    // Step 5: Sanitize created HTML
    return DOMPurify.sanitize(htmlText);
  }, [originalText, editedText]);

  // Step 2: Render
  return (
    <div
      className={classes.diff}
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    ></div>
  );
}
// ===================================================================================
//                               MAIN FUNCTIONS
// ===================================================================================

export function LoadingChatLine({ user }: { user: User }) {
  return (
    <ChatLine
      id={'response--loading'}
      message={{
        speaker: 'agent',
        text: 'Loading...',
        timestamp: Math.floor(Date.now() / 1000),
      }}
      user={user}
      latestResponse
    />
  );
}

export function ChatLine({
  id,
  message,
  user,
  latestResponse,
  editable = false,
  onEditMessageText,
  onMessageFeedback,
  onContextFeedback,
  onRedo,
  onDeleteContext,
  open = false,
  availableEnrichments,
  onChangeMessageEnrichments,
  onDisableParent,
  onSelection,
  onUpdateAlternatives,
  focused,
  scrollSeq,
}: ChatLineProps) {
  // Step 1: Initialize state and necessary variables
  const anchorRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<boolean>(true);
  const [editingMessage, setEditingMessage] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [showOverlap, setShowOverlap] = useState<boolean>(false);
  const [addingEnrichment, setAddingEnrichment] = useState<boolean>(false);
  const [editedMessageText, setEditedMessageText] = useState<string>('');
  const [documentIndex, setDocumentIndex] = useState<number>(0);
  const [showingAlternatives, setShowingAlternatives] =
    useState<boolean>(false);
  const isAgent = message.speaker === 'agent';

  // Step 2: Run effects
  // Step 2.a: Close adding enrichment, if not latest response
  useEffect(() => {
    if (!open) {
      setAddingEnrichment(false);
      setExpanded(false);
    }
  }, [open]);

  // Step 2.b: Find message text overlaps with contexts (two-level: sentence + phrase)
  const messageTextOverlapsWithContexts: SentenceMatchObject[][] =
    useMemo(() => {
      if (
        !isEmpty(message.text) &&
        message.contexts &&
        !isEmpty(message.contexts)
      ) {
        return message.contexts.map((context) =>
          sentenceOverlaps(message.text, context.text),
        );
      }
      return [];
    }, [message.text, message.contexts?.length, message.contexts]);

  // Step 2.c: Disable parent, if required
  useEffect(() => {
    if (onDisableParent) {
      if (editingMessage) {
        onDisableParent(
          true,
          'You must finish editing response before proceeding',
        );
      } else {
        onDisableParent(false);
      }
    }
  }, [editingMessage]);

  // Step 2.d: Scroll into view
  useEffect(() => {
    if (anchorRef.current && focused) {
      anchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: message.speaker === 'user' ? 'start' : 'center',
        inline: 'center',
      });
    }
  }, [focused, scrollSeq, message.speaker]);

  // Step 3: Render
  // Step 3.a: Return "null" if message is undefined
  if (!message) {
    return null;
  }

  // Step 3.b: Render chat line
  return (
    <div
      ref={anchorRef}
      className={cx(classes.line, {
        [classes.botLine]: isAgent,
        [classes.latestResponse]: latestResponse,
      })}
    >
      {message.prompt ? (
        <PromptViewer
          prompt={message.prompt}
          open={showPrompt}
          onClose={() => {
            setShowPrompt(false);
          }}
        />
      ) : null}
      <Avatar isAgent={isAgent} />
      <div className={cx(classes.baloon, isAgent && classes.botBaloon)}>
        {editingMessage ? (
          <>
            <TextArea
              labelText="Edit Text"
              className={cx(classes.editor)}
              placeholder={message.text}
              rows={Math.max(Math.floor(message.text.length / 100), 5)}
              value={editedMessageText ? editedMessageText : message.text}
              autoFocus={editingMessage === true}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (!isEmpty(editedMessageText) && onEditMessageText) {
                    // Trigger message edit
                    onEditMessageText(editedMessageText);

                    // Clear editedMessage
                    setEditedMessageText('');
                  }

                  // Set editingMessage to false
                  setEditingMessage(false);
                } else if (e.key === 'Escape') {
                  // Prevent default behavior
                  e.preventDefault();

                  // Clear editedMessage
                  setEditedMessageText('');

                  // Set editingMessage to false
                  setEditingMessage(false);
                }
              }}
              onChange={(e) => setEditedMessageText(e.target.value)}
            ></TextArea>
            <div className={classes.editorWarningContainer}>
              <WarningAlt /> Make sure you hit 'Enter' once you are done editing
            </div>
          </>
        ) : (
          <Balancer
            className={cx(
              classes.message,
              isAgent && classes.botMessage,
              id === 'response--placeholder' ||
                message.text === 'Loading...' ||
                onChangeMessageEnrichments === undefined
                ? classes.extraMargin
                : null,
            )}
            ratio={0.2}
            onMouseDown={(e) => {
              if (onSelection) {
                onSelection(
                  `messages[${id.split('--').slice(-1)[0]}].text`,
                  e.clientX,
                  e.clientY,
                );
              }
            }}
            onMouseUp={(e) => {
              if (onSelection) {
                onSelection(
                  `messages[${id.split('--').slice(-1)[0]}].text`,
                  e.clientX,
                  e.clientY,
                );
              }
            }}
          >
            <MessageText
              id={id}
              message={message}
              showOverlap={showOverlap}
              sentences={messageTextOverlapsWithContexts[documentIndex] ?? []}
            />
          </Balancer>
        )}
        {message.originalText && message.originalText !== message.text ? (
          <>
            <Balancer className={cx(classes.edit)} ratio={0.2}>
              <Diff
                originalText={message.originalText}
                editedText={message.text}
              />
            </Balancer>
            <div className={classes.diffLegends}>
              <div className={classes.diffLegend}>
                <div className={classes.legendDelete}>&#9632;</div>
                <span>shows removed text</span>
              </div>
              <div className={classes.diffLegend}>
                <div className={classes.legendInsert}>&#9632;</div>
                <span>shows added text</span>
              </div>
            </div>
          </>
        ) : null}
        {message.originalText && message.originalText !== message.text ? (
          <p className={cx(classes.messageStatus)}>Edited</p>
        ) : null}
        {message.warnings &&
          message.warnings?.map((warning, warningIdx) => {
            return (
              <p
                key={'message-warning--' + warningIdx}
                className={classes.messageWarning}
              >
                <WarningAlt />
                {warning}
              </p>
            );
          })}
        {id !== 'response--placeholder' && message.text !== 'Loading...' ? (
          <div className={classes.toolbar}>
            {isAgent &&
            message.contexts &&
            !isEmpty(messageTextOverlapsWithContexts) ? (
              <CoverageMeter
                overlaps={messageTextOverlapsWithContexts}
                sourceLength={message.text.length}
              />
            ) : null}
            <div className={classes.toolbarButtons}>
              {!isAgent ? (
                <Button
                  id={`${id}__show-alternatives-btn`}
                  kind="ghost"
                  renderIcon={StringText}
                  iconDescription="Show alternatives"
                  hasIconOnly
                  onClick={() => setShowingAlternatives(!showingAlternatives)}
                  className={cx(showingAlternatives ? classes.btnActive : null)}
                ></Button>
              ) : null}
              {!isAgent && onChangeMessageEnrichments ? (
                <Button
                  id={`${id}__add-enrichment-btn`}
                  kind="ghost"
                  renderIcon={DataEnrichmentAdd}
                  iconDescription="Add enrichment"
                  hasIconOnly
                  onClick={() => setAddingEnrichment(!addingEnrichment)}
                  className={cx(addingEnrichment ? classes.btnActive : null)}
                ></Button>
              ) : null}
              {isAgent && message.contexts ? (
                <Button
                  id={`${id}__overlap-btn`}
                  kind="ghost"
                  renderIcon={TextHighlight}
                  iconDescription="Highlight text that may have informed the response"
                  hasIconOnly
                  onClick={() => setShowOverlap(!showOverlap)}
                  disabled={isEmpty(messageTextOverlapsWithContexts)}
                  className={cx(showOverlap ? classes.btnActive : null)}
                ></Button>
              ) : null}
              {isAgent && message.prompt ? (
                <Button
                  id={`${id}__prompt-btn`}
                  kind="ghost"
                  renderIcon={PromptTemplate}
                  iconDescription="Show prompt"
                  hasIconOnly
                  onClick={() => setShowPrompt(!showPrompt)}
                  className={cx(showPrompt ? classes.btnActive : null)}
                ></Button>
              ) : null}
              {editable ? (
                <Button
                  id={`${id}__edit-btn`}
                  kind="ghost"
                  renderIcon={Edit}
                  iconDescription="Edit text"
                  hasIconOnly
                  onClick={() => setEditingMessage(!editingMessage)}
                  className={cx(editingMessage ? classes.btnActive : null)}
                ></Button>
              ) : null}
              {editable && onRedo ? (
                <Button
                  id={`${id}__generate-btn`}
                  kind="ghost"
                  renderIcon={Renew}
                  iconDescription="Re-generate"
                  hasIconOnly
                  onClick={() => {
                    onRedo(() => {});
                  }}
                ></Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {availableEnrichments &&
        message.enrichments &&
        !isEmpty(message.enrichments) ? (
          <EnrichmentsViewer
            enrichments={message.enrichments}
            onDelete={
              onChangeMessageEnrichments
                ? (enrichmentType, enrichmentValue) => {
                    if (message.enrichments) {
                      // Step 1: Clone existing enrichments
                      const updatedEnrichments = cloneDeep(message.enrichments);

                      // Step 2: Update enrichments
                      updatedEnrichments[enrichmentType] = message.enrichments[
                        enrichmentType
                      ].filter((value) => value !== enrichmentValue);

                      // Step 2.b: Remove enrichment type, if no enrichment left
                      if (updatedEnrichments[enrichmentType].length === 0) {
                        delete updatedEnrichments[enrichmentType];
                      }

                      // Step 3: Trigger update function
                      onChangeMessageEnrichments(updatedEnrichments);
                    }
                  }
                : undefined
            }
            colors={Object.fromEntries(
              Object.keys(availableEnrichments).map((entrichmenType) => [
                entrichmenType,
                availableEnrichments[entrichmenType].color,
              ]),
            )}
          />
        ) : null}
        {addingEnrichment && onChangeMessageEnrichments ? (
          <AddEnrichment
            key={`add-enrichments--${hash(JSON.stringify(availableEnrichments))}`}
            availableEnrichments={availableEnrichments}
            onSubmit={(enrichmentType, enrichmentValue) => {
              // Step 1: Clone existing enrichments
              const updatedEnrichments = message.enrichments
                ? cloneDeep(message.enrichments)
                : {};

              // Step 2: Update enrichments
              if (updatedEnrichments.hasOwnProperty(enrichmentType)) {
                if (
                  !updatedEnrichments[enrichmentType].includes(enrichmentValue)
                ) {
                  updatedEnrichments[enrichmentType].push(enrichmentValue);
                }
              } else {
                updatedEnrichments[enrichmentType] = [enrichmentValue];
              }

              // Step 3: Trigger update function
              onChangeMessageEnrichments(updatedEnrichments);
            }}
          />
        ) : null}

        {!isAgent && showingAlternatives ? (
          <Alternatives
            id={id}
            message={message}
            availableEnrichments={availableEnrichments}
            onUpdate={onUpdateAlternatives}
            onSelection={onSelection}
          ></Alternatives>
        ) : null}

        {isAgent && onMessageFeedback ? (
          <MessageFeedback
            id={`${id}__feedback`}
            onSelection={(metric, value) => {
              if (onMessageFeedback) {
                onMessageFeedback(metric, value);
              }
            }}
            feedback={message.feedback}
            user={user}
            disabled={!editable}
          />
        ) : null}
        {isAgent && expanded && message.contexts ? (
          <DocumentsViewer
            key={`${id}__documents--${message.contexts.length}`}
            id={`${id}__documents`}
            documents={message.contexts}
            documentIndex={documentIndex}
            setDocumentIndex={setDocumentIndex}
            onFeedback={onContextFeedback}
            user={user}
            showOverlap={showOverlap}
            overlaps={messageTextOverlapsWithContexts}
            disabledFeedback={!onContextFeedback}
            onDelete={latestResponse ? onDeleteContext : undefined}
            onSelection={onSelection}
          ></DocumentsViewer>
        ) : null}
        {message.contexts && message.contexts.length ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className={classes.viewDocumentsButton}
          >
            {expanded ? (
              <Close className={classes.viewDocumentsIcon} />
            ) : (
              <DocumentViewIcon className={classes.viewDocumentsIcon} />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

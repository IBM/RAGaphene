/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty, countBy } from 'lodash';

import { useState, useMemo } from 'react';
import { Button, RadioButtonGroup, RadioButton, Tooltip } from '@carbon/react';
import {
  ChevronLeft,
  ChevronRight,
  Link,
  Query,
  TrashCan,
} from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

import { User, Document, Feedback, SentenceMatchObject } from '@/types/custom';
import { markWithSentences } from '@/src/common/utilities/highlighter';
import QueryViewer from '@/src/components/query-viewer/QueryViewer';

import classes from './DocumentsViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  id: string;
  documents: Document[];
  documentIndex: number;
  /** Called with the new index when the user navigates between documents. */
  setDocumentIndex: (index: number) => void;
  /** Called with the document index and the feedback metric name + value when the user selects a radio button. */
  onFeedback?: (contextIndex: number, metric: string, value: string) => void;
  user: User;
  showOverlap: boolean;
  overlaps: SentenceMatchObject[][];
  disabledFeedback?: boolean;
  /** Called with the document object when the user clicks the trash-can button. */
  onDelete?: (document: Document) => void;
  onSelection?: (component: string, x: number, y: number) => void;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function DocumentFeedback({
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
  const valueSelected = useMemo(() => {
    if (feedback?.relevant) {
      if (
        feedback.relevant.hasOwnProperty(user.username) &&
        feedback.relevant[user.username]['value']
      ) {
        return feedback.relevant[user.username]['value'];
      } else {
        // If only two feebacks are present, take the latest one
        if (Object.keys(feedback.relevant).length === 2) {
          return Object.values(feedback.relevant).toSorted(
            (a, b) => b.timestamp - a.timestamp,
          )[0].value;
        } else {
          return Object.keys(
            countBy(
              Object.values(feedback.relevant).map((entry) => entry['value']),
            ),
          )[0];
        }
      }
    }

    return undefined;
  }, [feedback?.relevant, user.username]);

  return (
    <div className={classes.feedbackContainer}>
      <h5>Feedback</h5>
      <div className={classes.feedbackMetricContainer}>
        <div className={classes.feedbackMetricDescription}>
          <span>
            Is this document relevant to answering your last question within the
            conversation?
          </span>
        </div>
        <div className={classes.feedbackMetricValues}>
          <RadioButtonGroup
            id={`${id}-relevant`}
            name={`${id}-relevant`}
            onChange={(selection) => {
              onSelection('relevant', String(selection));
            }}
            valueSelected={valueSelected}
          >
            <RadioButton
              labelText="No"
              value="no"
              id={`${id}--relevant--no`}
              disabled={disabled}
            />
            <RadioButton
              labelText="Yes"
              value="yes"
              id={`${id}--relevant--yes`}
              disabled={disabled}
            />
          </RadioButtonGroup>
        </div>
      </div>
    </div>
  );
}

function OverlapBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);

  return (
    <Tooltip
      align="bottom-left"
      label="Average Jaccard similarity between the response tokens and sentences in this document (stop words excluded). Higher means this document shares more content with the response."
    >
      <div className={classes.overlapBadge} aria-label={`Overlap: ${pct}%`}>
        <div
          className={classes.overlapPie}
          style={{ '--pct': pct } as React.CSSProperties}
          aria-hidden="true"
        />
        <span className={classes.overlapBadgeLabel}>Overlap</span>
        <span className={classes.overlapPct}>{pct}%</span>
      </div>
    </Tooltip>
  );
}

function DocumentViewer({
  id,
  document,
  showOverlap = false,
  overlaps,
  onDelete,
  onSelection,
}: {
  id: string;
  document: Document;
  showOverlap: boolean;
  overlaps: SentenceMatchObject[];
  /** Called with the document object when the user clicks the delete (trash-can) button. */
  onDelete?: (document: Document) => void;
  onSelection?: (component: string, x: number, y: number) => void;
}) {
  const [showQuery, setShowQuery] = useState<boolean>(false);

  return (
    <div className={classes.document}>
      {document.query ? (
        <QueryViewer
          query={JSON.stringify(document.query, null, 4)}
          open={showQuery}
          onClose={() => {
            setShowQuery(false);
          }}
        />
      ) : null}

      <div className={classes.documentHeader}>
        <OverlapBadge
          score={
            overlaps && overlaps.length > 0
              ? overlaps.reduce((acc, s) => acc + s.score, 0) / overlaps.length
              : 0
          }
        />
        <div className={classes.documentToolbar}>
          {document.url ? (
            <Button
              kind="ghost"
              renderIcon={Link}
              iconDescription="Click to open link"
              hasIconOnly
              tooltipAlignment="end"
              tooltipPosition="bottom"
              onClick={() => {
                window.open(document.url, '_blank');
              }}
            ></Button>
          ) : null}
          {document.query ? (
            <Button
              kind="ghost"
              renderIcon={Query}
              iconDescription="Click to see query"
              hasIconOnly
              tooltipAlignment="end"
              tooltipPosition="bottom"
              onClick={() => {
                setShowQuery(!showQuery);
              }}
            ></Button>
          ) : null}
          {onDelete ? (
            <Button
              kind="ghost"
              renderIcon={TrashCan}
              iconDescription="Delete document"
              hasIconOnly
              tooltipAlignment="end"
              tooltipPosition="bottom"
              onClick={() => {
                onDelete(document);
              }}
            ></Button>
          ) : null}
        </div>
      </div>

      <article
        className={classes.documentContainer}
        onMouseDown={(e) => {
          if (onSelection) {
            const [segment, documentIdx] = id.split('__documents--');
            onSelection(
              `messages[${segment.split('message--').slice(-1)[0]}].documents[${documentIdx}].text`,
              e.clientX,
              e.clientY,
            );
          }
        }}
        onMouseUp={(e) => {
          if (onSelection) {
            const [segment, documentIdx] = id.split('__documents--');
            onSelection(
              `messages[${segment.split('message--').slice(-1)[0]}].documents[${documentIdx}].text`,
              e.clientX,
              e.clientY,
            );
          }
        }}
      >
        <div className={classes.markdown}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {showOverlap && overlaps && overlaps.length > 0
              ? markWithSentences(
                  document.formatted_text
                    ? document.formatted_text
                    : document.text,
                  overlaps,
                )
              : document.formatted_text
                ? document.formatted_text
                : document.text}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function DocumentsViewer({
  id,
  documents,
  documentIndex,
  setDocumentIndex,
  onFeedback,
  user,
  showOverlap = false,
  overlaps,
  disabledFeedback = false,
  onDelete,
  onSelection,
}: Props) {
  // Step 1: Render
  if (isEmpty(documents)) {
    return null;
  } else {
    return (
      <div className={classes.documentsViewer}>
        {documents.length > 1 ? (
          <div className={classes.toolbar}>
            <Button
              id={'document--selector-prev'}
              kind="ghost"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription="Previous document"
              onClick={() => {
                if (documentIndex > 0) {
                  setDocumentIndex(documentIndex - 1);
                }
              }}
              disabled={documentIndex === 0}
            />
            <span className={classes.documentIndex}>
              {documentIndex + 1} / {documents.length}
            </span>
            <Button
              id={'document--selector-next'}
              kind="ghost"
              hasIconOnly
              renderIcon={ChevronRight}
              iconDescription="Next document"
              onClick={() => {
                if (documentIndex < documents.length - 1) {
                  setDocumentIndex(documentIndex + 1);
                }
              }}
              disabled={documentIndex === documents.length - 1}
            />
          </div>
        ) : null}
        <div className={classes.container}>
          <DocumentViewer
            id={`${id}--${documentIndex}`}
            document={documents[documentIndex]}
            showOverlap={showOverlap}
            overlaps={overlaps[documentIndex]}
            onDelete={
              onDelete !== undefined && documents.length > 1
                ? (documentToDelete) => {
                    // Step 1: Find the index of the document to be deleted
                    const idx = documents.findIndex(
                      (document) =>
                        document.document_id === documentToDelete.document_id,
                    );

                    // Step 2: If it's a last document in the list, adjust document index accordingly
                    if (idx >= 0 && idx === documents.length - 1) {
                      setDocumentIndex(documentIndex - 1);
                    }

                    // Step 3: Continue with deletion of document
                    onDelete(documentToDelete);
                  }
                : undefined
            }
            onSelection={onSelection}
          />
          {showOverlap ? (
            <div className={classes.disclaimers}>
              <div className={classes.overlapDisclaimer}>
                <div className={classes.legendCopiedText}>&#9632;</div>
                <span>
                  &nbsp;highlights text that may have informed the response
                </span>
              </div>
            </div>
          ) : null}
          <DocumentFeedback
            id={`${id}-${documentIndex}__feedback`}
            onSelection={(metric, value) => {
              if (onFeedback) {
                onFeedback(documentIndex, metric, value);
              }
            }}
            feedback={documents[documentIndex].feedback}
            user={user}
            disabled={disabledFeedback}
          />
        </div>
      </div>
    );
  }
}

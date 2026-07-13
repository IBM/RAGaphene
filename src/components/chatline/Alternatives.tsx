/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty, cloneDeep } from 'lodash';
import cx from 'classnames';
import Balancer from 'react-wrap-balancer';
import { useMemo, useState } from 'react';

import { TextArea, Modal, Button } from '@carbon/react';
import {
  ChevronLeft,
  ChevronRight,
  WarningAlt,
  Edit,
  TrashCan,
} from '@carbon/icons-react';

import { Alternative, Message } from '@/types/custom';
import { hash } from '@/src/common/utilities/string';
import EnrichmentsViewer from '@/src/components/enrichments/EnrichmentsViewer';
import AddEnrichment from '@/src/components/enrichments/AddEnrichment';

import classes from './Alternatives.module.scss';

// ===================================================================================
//                                RENDER FUNCTION
// ===================================================================================
function AddAlternative({
  open,
  message,
  onClose,
  onAdd,
  availableEnrichments,
  colors,
}: {
  open: boolean;
  message: Message;
  onClose: Function;
  onAdd: Function;
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  colors: { [key: string]: string };
}) {
  // Step 1: Initialize state and necessary variables
  const [alternativeText, setAlternativeText] = useState<string>('');
  const [enrichments, setEnrichments] = useState<{ [key: string]: string[] }>(
    {},
  );

  // Step 2: Render
  return (
    <Modal
      open={open}
      size="md"
      modalLabel="Add alternative"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        // Step 1: Add new alternative
        onAdd({ text: alternativeText, enrichments: enrichments });

        // Step 2: Close modal
        onClose();
      }}
      onRequestClose={() => {
        onClose();
      }}
    >
      <div className={classes.addAlternativecontainer}>
        <span className={classes.caption}>Text</span>
        <Balancer className={cx(classes.message)} ratio={0.2}>
          {message.text.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </Balancer>
        <TextArea
          labelText="Alternative"
          className={cx(classes.editor)}
          placeholder="Please type alternative here"
          rows={Math.max(Math.floor(message.text.length / 100), 3)}
          autoFocus={true}
          onChange={(e) => setAlternativeText(e.target.value)}
          invalid={message.text === alternativeText || isEmpty(alternativeText)}
          invalidText={
            isEmpty(alternativeText)
              ? 'Alternative text cannot be empty'
              : 'Alternative text matches original text'
          }
        ></TextArea>
        {!isEmpty(enrichments) ? (
          <EnrichmentsViewer
            id={'alternative__enrichments'}
            enrichments={enrichments}
            onDelete={(enrichmentType, enrichmentValue) => {
              if (enrichments) {
                // Step 1: Clone existing enrichments
                const updatedEnrichments = cloneDeep(enrichments);

                // Step 2: Update enrichments
                updatedEnrichments[enrichmentType] = enrichments[
                  enrichmentType
                ].filter((value) => value !== enrichmentValue);

                // Step 2.b: Remove enrichment type, if no enrichment left
                if (updatedEnrichments[enrichmentType].length === 0) {
                  delete updatedEnrichments[enrichmentType];
                }

                // Step 3: Set updated enrichments to be enrichments
                setEnrichments(updatedEnrichments);
              }
            }}
            colors={colors}
          />
        ) : null}
        <AddEnrichment
          key={`add-enrichments--${hash(JSON.stringify(availableEnrichments))}`}
          availableEnrichments={availableEnrichments}
          onSubmit={(enrichmentType, enrichmentValue) => {
            // Step 1: Clone existing enrichments
            const updatedEnrichments = cloneDeep(enrichments);

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
            setEnrichments(updatedEnrichments);
          }}
        />
      </div>
    </Modal>
  );
}

function AlternativeViewer({
  id,
  alternative,
  colors,
  onUpdate,
  onDelete,
  onSelection,
  disabled = false,
}: {
  id: string;
  alternative: Alternative;
  colors: { [key: string]: string };
  onUpdate?: Function;
  onDelete?: Function;
  onSelection?: Function;
  disabled?: boolean;
}) {
  // Step 1: Initialize state and necessary variables
  const [editingText, setEditingText] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>('');

  // Step 2: Render
  return (
    <div id={id} className={classes.alternativeContainer}>
      <div className={classes.alternativeToolbar}>
        {onUpdate ? (
          <Button
            kind="ghost"
            renderIcon={Edit}
            iconDescription="Edit"
            hasIconOnly
            tooltipAlignment="end"
            tooltipPosition="bottom"
            onClick={() => {
              setEditingText(!editingText);
            }}
          ></Button>
        ) : null}
        {onDelete ? (
          <Button
            kind="ghost"
            renderIcon={TrashCan}
            iconDescription="Delete"
            hasIconOnly
            tooltipAlignment="end"
            tooltipPosition="bottom"
            onClick={() => {
              onDelete(alternative);
            }}
          ></Button>
        ) : null}
      </div>
      {editingText ? (
        <>
          <TextArea
            labelText="Edit Text"
            className={cx(classes.editor)}
            placeholder={alternative.text.replace(/\n/g, ' ')}
            rows={Math.max(Math.floor(alternative.text.length / 100), 3)}
            value={
              editedText ? editedText : alternative.text.replace(/\n/g, ' ')
            }
            autoFocus={editingText === true}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (!isEmpty(editedText) && onUpdate) {
                  // Trigger message edit
                  onUpdate({ ...alternative, text: editedText });

                  // Clear editedMessage
                  setEditedText('');
                }

                // Set editingMessage to false
                setEditingText(false);
              } else if (e.key === 'Escape') {
                // Prevent default behavior
                e.preventDefault();

                // Clear editedMessage
                setEditedText('');

                // Set editingMessage to false
                setEditingText(false);
              }
            }}
            onChange={(e) => setEditedText(e.target.value)}
          ></TextArea>
          <div className={classes.editorWarningContainer}>
            <WarningAlt /> Make sure you hit 'Enter' once you are done editing
          </div>
        </>
      ) : (
        <Balancer
          className={cx(
            classes.alternativeText,
            disabled ? classes.disabled : null,
          )}
          ratio={0.2}
        >
          {alternative.text.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </Balancer>
      )}
      {alternative.enrichments && !isEmpty(alternative.enrichments) ? (
        <EnrichmentsViewer
          enrichments={alternative.enrichments}
          colors={colors}
          id={`${id}__enrichments`}
          showLabel={false}
        />
      ) : null}
    </div>
  );
}

// ===================================================================================
//                                MAIN FUNCTION
// ===================================================================================

export default function Alternatives({
  id,
  message,
  availableEnrichments,
  onUpdate,
  onSelection,
}: {
  id: string;
  message: Message;
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  onUpdate?: Function;
  onSelection?: Function;
}) {
  // Step 1: Initialize state and necessary variables
  const [addingAlternative, setAddingAlternative] = useState<boolean>(false);
  const [alternativeIdx, setAlternativeIdx] = useState<number>(0);
  const size = useMemo(() => {
    if (message.alternatives) {
      return message.alternatives.length + (onUpdate ? 1 : 0);
    } else return onUpdate ? 1 : 0;
  }, [message.alternatives]);

  // Step 2: Run effects
  const colors = useMemo(() => {
    return availableEnrichments
      ? Object.fromEntries(
          Object.keys(availableEnrichments).map((entrichmenType) => [
            entrichmenType,
            availableEnrichments[entrichmenType].color,
          ]),
        )
      : {};
  }, [availableEnrichments]);

  // Step 2: Render
  return (
    <div className={classes.alternativesContainer}>
      {addingAlternative ? (
        <AddAlternative
          open={addingAlternative}
          message={message}
          onAdd={(addedAlternative) => {
            onUpdate
              ? onUpdate(
                  message.alternatives
                    ? [...message.alternatives, addedAlternative]
                    : [addedAlternative],
                )
              : null;
          }}
          onClose={() => setAddingAlternative(false)}
          availableEnrichments={availableEnrichments}
          colors={colors}
        />
      ) : null}
      {onUpdate ? (
        <div className={classes.alternativesSelector}>
          <Button
            id={'alternative--selector-prev'}
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="Previous alternative"
            onClick={() => {
              if (alternativeIdx > 0) {
                setAlternativeIdx(alternativeIdx - 1);
              }
            }}
            disabled={alternativeIdx === 0}
          />
          <span className={classes.documentIndex}>
            {alternativeIdx + 1} / {size}
          </span>
          <Button
            id={'alternative--selector-next'}
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronRight}
            iconDescription="Next alternative"
            onClick={() => {
              if (alternativeIdx < size - 1) {
                setAlternativeIdx(alternativeIdx + 1);
              }
            }}
            disabled={alternativeIdx === size - 1}
          />
        </div>
      ) : null}
      {onUpdate && alternativeIdx === size - 1 ? (
        <div className={classes.alternativeContainer}>
          <span className={cx(classes.alternativeText, classes.center)}>
            Click&nbsp;
            <u
              onClick={() => {
                setAddingAlternative(true);
              }}
            >
              here
            </u>
            &nbsp;to add
          </span>
        </div>
      ) : message.alternatives ? (
        <AlternativeViewer
          id={`${id}__alternative--${alternativeIdx}`}
          alternative={message.alternatives[alternativeIdx]}
          colors={colors}
          onUpdate={
            onUpdate
              ? (updatedAlternative) => {
                  onUpdate(
                    message.alternatives?.toSpliced(
                      alternativeIdx,
                      1,
                      updatedAlternative,
                    ),
                  );
                }
              : undefined
          }
          onDelete={
            onUpdate && message.alternatives && message.alternatives.length > 0
              ? (alternativeToDelete) => {
                  // Step 1: Clone existing alternatives
                  const updatedAlternatives: Alternative[] = cloneDeep(
                    message.alternatives,
                  );

                  // Step 2: Find the index of the document to be deleted
                  const idx = updatedAlternatives.findIndex(
                    (alternative) =>
                      alternative.text === alternativeToDelete.text,
                  );

                  // Step 2: Remove deleted alternative
                  updatedAlternatives.splice(idx, 1);

                  // Step 3: If it's a last document in the list, adjust document index accordingly
                  if (idx >= 0 && idx === size - 1) {
                    setAlternativeIdx(alternativeIdx - 1);
                  }

                  // Step 3: Continue with deletion of document
                  onUpdate(updatedAlternatives);
                }
              : undefined
          }
          onSelection={onSelection}
        />
      ) : onUpdate === undefined ? (
        <AlternativeViewer
          id={`${id}__alternative--${alternativeIdx}`}
          alternative={{ text: 'alternative not provided' }}
          colors={colors}
          disabled={true}
        />
      ) : null}
    </div>
  );
}

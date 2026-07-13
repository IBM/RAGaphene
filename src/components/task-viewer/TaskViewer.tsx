/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useMemo, useRef, useEffect } from 'react';

import { Tag } from '@carbon/react';

import { DatasetTask } from '@/types/custom';
import { collectEnrichments } from '@/src/common/utilities/enrichments';
import { ChatLine } from '@/src/components/chatline/ChatLine';

import classes from './TaskViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  task: DatasetTask;
  onClose: Function;
}

// ===================================================================================
//                               RENDER FUNCTION
// ===================================================================================
function Chat({ task }: { task: DatasetTask }) {
  // Step 1: Identify all available enrichments
  const anchorRef = useRef<HTMLDivElement>(null);

  // Step 2: Run effects
  // Step 2.a: Collect all applied enrichments
  const appliedEnrichments: {
    [key: string]: { values: Set<string>; color: string };
  } = useMemo(() => {
    return collectEnrichments(task.input);
  }, [task.input]);

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
      <div className={classes.taskContainerSection}>
        <span className={classes.taskContainerSectionLabel}>Input</span>
        <div className={classes.taskContainerSectionItems}>
          {task.input.map((message, messageIdx) => (
            <ChatLine
              key={`task__utterance--${messageIdx}`}
              id={`task__utterance--${messageIdx}`}
              message={message}
              user={{ username: 'system', firstName: 'Analyst' }}
              availableEnrichments={appliedEnrichments}
            ></ChatLine>
          ))}
        </div>
      </div>

      <div className={classes.taskContainerSection}>
        <span className={classes.taskContainerSectionLabel}>Target</span>
        <div className={classes.taskContainerSectionItems}>
          <ChatLine
            key={`target__utterance--0`}
            id={`target__utterance--0`}
            message={{ ...task.targets[0], contexts: task.contexts }}
            user={{ username: 'system', firstName: 'Analyst' }}
            availableEnrichments={appliedEnrichments}
            open={true}
          ></ChatLine>
        </div>
      </div>
    </>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function TaskViewer({ task, onClose }: Props) {
  // Step 1: Initialize state and necessary variables

  // Step 1: Run effects
  // Step 1.a: Handle task close event
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
        <div className={classes.container}>
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
          <div className={classes.taskContainer}>
            <Chat task={task}></Chat>
          </div>
        </div>
      </div>
    </>
  );
}

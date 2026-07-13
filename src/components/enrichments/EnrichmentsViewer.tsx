/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Tag } from '@carbon/react';

import classes from './EnrichmentsViewer.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  enrichments: { [key: string]: string[] };
  onDelete?: Function;
  colors: { [key: string]: string };
  id?: string;
  showLabel?: boolean;
}

// ===================================================================================
//                                RENDER FUNCTIONS
// ===================================================================================
export default function EnrichmentsViewer({
  enrichments,
  onDelete,
  colors,
  id = 'message__enrichment',
  showLabel = true,
}: Props) {
  return (
    <div className={classes.enrichmentsViewer}>
      {showLabel ? (
        <span className={classes.enrichmentsTitle}>Applied Enrichments</span>
      ) : null}
      <div className={classes.enrichments}>
        {Object.entries(enrichments).map(
          ([enrichmentType, enrichmentValues], enrichmentIdx) => {
            return Array.from(enrichmentValues).map((enrichmentValue) => (
              <Tag
                key={`{${id}--${enrichmentType}-${enrichmentValue}}`}
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

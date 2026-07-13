/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import React, { useMemo } from 'react';

import { isEmpty } from 'lodash';

import { DonutChart } from '@carbon/charts-react';

import { DatasetTask } from '@/types/custom';
import { useTheme } from '@/src/common/state/theme';

import '@carbon/charts-react/styles.css';
import classes from './Dataset.module.scss';

// --- Types ---

interface Props {
  // Tasks currently selected for the experiment run.
  selectedTasks: DatasetTask[];
  // Total tasks extracted from the uploaded file (the full pool).
  totalTaskCount: number;
  // column — vertical stack in the sticky right panel (≥1312px)
  // grid   — CSS auto-fill grid above the table (672px–1311px)
  layout: 'column' | 'grid';
}

// --- Helpers ---

function DonutGraph({
  data,
  theme,
  centerLabel,
  title,
}: {
  data: { group: string; value: number }[];
  theme: 'g10' | 'g90' | undefined;
  centerLabel: string;
  title: string;
}) {
  return (
    <div className={classes.donutBlock}>
      <p className={classes.donutTitle}>{title}</p>
      <div className={classes.donutWrapper}>
        <DonutChart
          data={data}
          options={{
            donut: {
              center: { label: centerLabel },
              alignment: 'center',
            },
            toolbar: { enabled: false },
            legend: { alignment: 'center' },
            theme,
          }}
        />
      </div>
    </div>
  );
}

// --- Main component ---

export function Statistics({ selectedTasks, totalTaskCount, layout }: Props) {
  const { theme } = useTheme();

  const [turns, contexts, enrichments] = useMemo(() => {
    const turnCounter: { [key: string]: number } = {};
    const contextCounter: { [key: string]: number } = {};
    const enrichmentsCounter: { [key: string]: { [key: string]: number } } = {};

    selectedTasks.forEach((task) => {
      turnCounter[task.turn] = (turnCounter[task.turn] ?? 0) + 1;

      const uniqueContextCount = new Set(
        task.contexts.map((c) => c.document_id),
      ).size;
      contextCounter[uniqueContextCount] =
        (contextCounter[uniqueContextCount] ?? 0) + 1;

      const lastUtterance = task.input[task.input.length - 1];
      if (lastUtterance.enrichments) {
        Object.entries(lastUtterance.enrichments).forEach(
          ([enrichmentType, enrichmentValues]) => {
            if (!enrichmentsCounter[enrichmentType]) {
              enrichmentsCounter[enrichmentType] = {};
            }
            (enrichmentValues as string[]).forEach((value) => {
              enrichmentsCounter[enrichmentType][value] =
                (enrichmentsCounter[enrichmentType][value] ?? 0) + 1;
            });
          },
        );
      }
    });

    return [turnCounter, contextCounter, enrichmentsCounter];
  }, [selectedTasks]);

  const turnsData = Object.entries(turns).map(([group, value]) => ({
    group: `Turn ${group}`,
    value,
  }));

  const contextsData = Object.entries(contexts).map(([group, value]) => ({
    group: `${group} context${Number(group) === 1 ? '' : 's'}`,
    value,
  }));

  const caption =
    selectedTasks.length === totalTaskCount
      ? `All ${totalTaskCount} tasks`
      : `${selectedTasks.length} of ${totalTaskCount} tasks selected`;

  return (
    <div className={classes.statisticsPanel}>
      <p className={classes.statisticsCaption}>{caption}</p>
      <div
        className={
          layout === 'column' ? classes.donutsColumn : classes.donutsGrid
        }
      >
        <DonutGraph
          data={turnsData}
          centerLabel="Turns"
          title="Turn distribution"
          theme={theme}
        />
        <hr className={classes.donutDivider} />
        <DonutGraph
          data={contextsData}
          centerLabel="Contexts"
          title="Context distribution"
          theme={theme}
        />
        {!isEmpty(enrichments) &&
          Object.entries(enrichments).map(
            ([enrichmentType, enrichmentValues]) => (
              <React.Fragment key={enrichmentType}>
                <hr className={classes.donutDivider} />
                <DonutGraph
                  data={Object.entries(enrichmentValues).map(
                    ([group, value]) => ({ group, value }),
                  )}
                  centerLabel={enrichmentType}
                  title={enrichmentType}
                  theme={theme}
                />
              </React.Fragment>
            ),
          )}
      </div>
    </div>
  );
}

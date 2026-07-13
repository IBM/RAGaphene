/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import {
  ExpandableTile,
  TileAboveTheFoldContent,
  TileBelowTheFoldContent,
  Tag,
} from '@carbon/react';
import { Compare } from '@carbon/icons-react';

import { Pipeline, Metric } from '@/types/custom';

import classes from './ExperimentTile.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ExperimentTile({
  name,
  componentToTest,
  numTasks,
  pipelines,
  metrics,
  expanded = true,
}: {
  name: string;
  componentToTest: string;
  numTasks: number;
  pipelines: Pipeline[];
  metrics: Metric[];
  expanded?: boolean;
}) {
  return (
    <div className={classes.container}>
      <ExpandableTile expanded={expanded}>
        <TileAboveTheFoldContent>
          <div className={classes.heading}>
            <Compare className={classes.icon} />
            <span className={classes.title}>{name}</span>
            <Tag
              type={
                componentToTest === 'both'
                  ? 'purple'
                  : componentToTest === 'retriever'
                    ? 'cyan'
                    : componentToTest === 'generator'
                      ? 'teal'
                      : 'outline'
              }
            >
              {componentToTest.charAt(0).toUpperCase() +
                componentToTest.slice(1).toLowerCase()}
            </Tag>
          </div>
        </TileAboveTheFoldContent>
        <TileBelowTheFoldContent>
          <div className={classes.block}>
            <div className={classes.information}>
              <div className={classes.artifact}>
                <div className={classes.artifactTitle}>
                  <span># of tasks</span>
                </div>
                <div className={classes.artifactValue}>
                  <span>{numTasks}</span>
                </div>
              </div>
              <div className={classes.artifact}>
                <div className={classes.artifactTitle}>
                  <span>Pipelines</span>
                </div>
                <div className={classes.artifactValue}>
                  {pipelines.map((pipeline) => (
                    <Tag key={`ExperimentTile__Pipeline--${pipeline.name}`}>
                      {pipeline.name}
                    </Tag>
                  ))}
                </div>
              </div>
              <div className={classes.artifact}>
                <div className={classes.artifactTitle}>
                  <span>Metrics</span>
                </div>
                <div className={classes.artifactValue}>
                  {metrics.map((metric) => (
                    <Tag key={`ExperimentTile__Metric--${metric.name}`}>
                      {metric.displayName ? metric.displayName : metric.name}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TileBelowTheFoldContent>
      </ExpandableTile>
    </div>
  );
}

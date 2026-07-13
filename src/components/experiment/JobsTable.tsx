/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useMemo, useEffect } from 'react';

import {
  DataTable,
  TableContainer,
  Table,
  TableToolbar,
  TableHead,
  TableRow,
  TableToolbarContent,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Button,
  DefinitionTooltip,
  InlineLoading,
  Tag,
} from '@carbon/react';
import {
  Chemistry,
  Export,
  Hourglass,
  IbmWatsonDiscovery,
  WatsonxAi,
} from '@carbon/icons-react';

import { Pipeline, Metric, Document, Job } from '@/types/custom';
import { truncate, fileTimestamp } from '@/src/common/utilities/string';

import classes from './JobsTable.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================

interface Props {
  componentToTest: string;
  jobs: Job[];
  pipelines: Pipeline[];
  metrics: Metric[];
  evalProgress?: { completed: number; total: number } | null;
}

interface Row {
  id: string;
  isSelected: boolean;
  seed: string;
  status:
    | 'success'
    | 'error'
    | 'running'
    | 'retrieving'
    | 'generating'
    | 'evaluating'
    | 'scheduled'
    | 'cancelled';
  [key: string]:
    | string
    | boolean
    | {
        text: string;
        duration?: {
          total: number;
          retriever?: number;
          generator?: number;
          evaluations?: number;
        };
        metrics?: { [key: string]: string | number };
      };
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Helper function to populate jobs table headers and rows
 * @param jobs full set of jobs
 * @returns
 */
function populateTable(
  jobs: Job[],
): [{ key: string; header: string }[], Row[]] {
  const headers = [
    {
      key: 'seed',
      header: 'Question',
    },
    {
      key: 'status',
      header: 'Status',
    },
  ];

  // Add headers based on pipeline names
  jobs[0]['predictions'].forEach((prediction) => {
    headers.push({
      key: prediction.pipelineName,
      header: prediction.pipelineName,
    });
  });

  const rows: Row[] = [];
  jobs.forEach((job, jobIdx) => {
    const row = {
      id: `${jobIdx}`,
      isSelected: false,
      seed: job.task.input[job.task.input.length - 1].text,
      status: job.status,
    };
    job.predictions.forEach((prediction) => {
      row[prediction.pipelineName] = {
        text: prediction.text,
        ...(prediction.duration && { duration: prediction.duration }),
        metrics: Object.fromEntries(
          Object.entries(prediction.evaluations).map(([metric, evaluation]) => [
            metric,
            evaluation.value,
          ]),
        ),
      };
    });

    rows.push(row);
  });

  return [headers, rows];
}

function prepareExportFile(
  componentToTest: string,
  jobs: Job[],
  pipelines: Pipeline[],
  metrics: Metric[],
) {
  const data = {
    name: 'Sample Experiment',
    created_at: Math.floor(Date.now() / 1000),
    models: pipelines.map((pipeline) => {
      return {
        model_id: pipeline.name.toLowerCase().replace(/ /g, '_'),
        name: pipeline.name,
        owner: pipeline.author,
      };
    }),
    metrics: metrics.map((metric) => {
      return {
        name: metric.name,
        displayName: metric.displayName
          ? metric.displayName
          : metric.name.charAt(0).toUpperCase() +
            metric.name.slice(1).toLowerCase(),
        ...(metric.description && { description: metric.description }),
        author: 'algorithm',
        type: metric.type,
        aggregator: metric.aggregator,
        ...(metric.range && { range: metric.range }),
        ...(metric.values && { values: metric.values }),
      };
    }),
    documents: [],
    tasks: [],
    evaluations: [],
  };

  // Step 2: Iterate over each job
  const allContexts: { [key: string]: Document } = {};
  jobs.forEach((job) => {
    // Step 2.a: Add context associated to task to global list of contexts
    job.task.contexts.forEach((context) => {
      if (!allContexts.hasOwnProperty(context.document_id)) {
        const { score, ...reducedContext } = context;
        allContexts[context.document_id] = reducedContext;
      }
    });

    // Step 2: Add task into tasks list
    //@ts-ignore
    data['tasks'].push({
      ...job.task,
      contexts: job.task.contexts.map((context) => {
        return { document_id: context.document_id };
      }),
    });

    // Step 3: Add evaluations based on predictions
    job.predictions.forEach((prediction) => {
      // Step 3.a: Add context to global documents list
      prediction.contexts?.forEach((context) => {
        if (!allContexts.hasOwnProperty(context.document_id)) {
          const { score, query, ...reducedContext } = context;
          allContexts[context.document_id] = reducedContext;
        }
      });

      //@ts-ignore
      data['evaluations'].push({
        task_id: job.task.task_id,
        model_id: prediction.pipelineName.toLowerCase().replace(/ /g, '_'),
        model_response: prediction.text,
        ...(prediction.contexts && {
          contexts: prediction.contexts.map((context) => {
            return {
              document_id: context.document_id,
              ...(context.score && { score: context.score }),
              ...(context.query && { query: context.query }),
            };
          }),
        }),
        annotations: Object.fromEntries(
          Object.entries(prediction.evaluations).map(([metric, evaluation]) => [
            metric,
            {
              system: {
                value: evaluation.value,
                ...(evaluation.duration && { duration: evaluation.duration }),
              },
            },
          ]),
        ),
      });
    });
  });

  // Step 3: Add global contexts
  //@ts-ignore
  data['documents'] = Array.from(Object.values(allContexts));

  return data;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function formatMs(ms: number): string {
  return ms > 1000
    ? `${(ms / 1000).toFixed(2)} seconds`
    : `${Math.floor(ms)} ms`;
}

function Duration({
  duration,
}: {
  duration: {
    total: number;
    retriever?: number;
    generator?: number;
    evaluations?: number;
  };
}) {
  return (
    <div className={classes.predictionArtifact}>
      <Hourglass />
      <DefinitionTooltip
        align="right-end"
        openOnHover
        definition={
          <div className={classes.durationDefinition}>
            {duration.retriever ? (
              <div className={classes.durationDefinitionItem}>
                <IbmWatsonDiscovery />
                <span>{formatMs(duration.retriever)}</span>
              </div>
            ) : null}
            {duration.generator ? (
              <div className={classes.durationDefinitionItem}>
                <WatsonxAi />
                <span>{formatMs(duration.generator)}</span>
              </div>
            ) : null}
            {duration.evaluations ? (
              <div className={classes.durationDefinitionItem}>
                <Chemistry />
                <span>{formatMs(duration.evaluations)}</span>
              </div>
            ) : null}
          </div>
        }
      >
        <span>{formatMs(duration.total)}</span>
      </DefinitionTooltip>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function JobsTable({
  componentToTest,
  jobs,
  pipelines,
  metrics,
  evalProgress,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleRows, setVisibleRows] = useState<Row[]>([]);

  // Step 2: Run effects
  // Step 2.a: Populate table header and rows
  var [headers, rows]: [{ key: string; header: string }[], Row[]] = useMemo(
    () => populateTable(jobs),
    [jobs],
  );

  // Step 2.b: Identify visible rows
  useEffect(() => {
    // Set visible rows
    setVisibleRows(() => {
      if (rows.length <= pageSize) {
        setPage(1);
      }
      return rows.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
    });
  }, [rows, page, pageSize]);

  // Step 3: Render
  return (
    <>
      {headers && rows ? (
        <div className={classes.tableContainer}>
          <DataTable rows={visibleRows} headers={headers} isSortable>
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getToolbarProps,
              getTableProps,
              getTableContainerProps,
            }) => {
              return (
                <TableContainer
                  className={classes.table}
                  {...getTableContainerProps()}
                >
                  <TableToolbar
                    {...getToolbarProps()}
                    className={classes.toolbar}
                  >
                    <TableToolbarContent>
                      <Button
                        renderIcon={Export}
                        disabled={
                          componentToTest !== 'generator' &&
                          componentToTest !== 'both'
                        }
                        onClick={() => {
                          // Step 1.a: Create <a> tag
                          var element = document.createElement('a');

                          // Step 1.b: Set attributes
                          element.setAttribute(
                            'href',
                            'data:application/json;charset=utf-8, ' +
                              encodeURIComponent(
                                JSON.stringify(
                                  prepareExportFile(
                                    componentToTest,
                                    jobs,
                                    pipelines,
                                    metrics,
                                  ),
                                  null,
                                  2,
                                ),
                              ),
                          );
                          element.setAttribute(
                            'download',
                            `analytics_${fileTimestamp()}.json`,
                          );

                          // Step 1.c: Add to DOM tree and click it
                          document.body.appendChild(element);
                          element.click();

                          // Step 1.d : Cleanup
                          document.body.removeChild(element);
                        }}
                      >
                        Export
                      </Button>
                    </TableToolbarContent>
                  </TableToolbar>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => {
                          const { key, ...headerProps } = getHeaderProps({
                            header,
                          });
                          return (
                            //@ts-ignore
                            <TableHeader key={key} {...headerProps}>
                              {header.header}
                            </TableHeader>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const { key, ...rowProps } = getRowProps({ row });
                        return (
                          //@ts-ignore
                          <TableRow key={key} {...rowProps}>
                            {row.cells.map((cell) =>
                              cell.info.header === 'seed' ? (
                                <TableCell key={cell.id}>
                                  <div className={classes.taskCell}>
                                    {truncate(cell.value, 80)}
                                  </div>
                                </TableCell>
                              ) : cell.info.header === 'status' ? (
                                <TableCell key={cell.id}>
                                  {cell.value === 'scheduled' ? (
                                    <Tag type="outline">Scheduled</Tag>
                                  ) : cell.value === 'retrieving' ? (
                                    <InlineLoading
                                      status="active"
                                      description="Retrieving"
                                    />
                                  ) : cell.value === 'generating' ? (
                                    <InlineLoading
                                      status="active"
                                      description="Generating"
                                    />
                                  ) : cell.value === 'evaluating' ? (
                                    <InlineLoading
                                      status="active"
                                      description={
                                        evalProgress
                                          ? `Evaluating (${evalProgress.completed}/${evalProgress.total})`
                                          : 'Evaluating'
                                      }
                                    />
                                  ) : cell.value === 'running' ? (
                                    <InlineLoading
                                      status="active"
                                      description="Running"
                                    />
                                  ) : cell.value === 'success' ? (
                                    <Tag type="green">Done</Tag>
                                  ) : cell.value === 'error' ? (
                                    <Tag type="red">Error</Tag>
                                  ) : cell.value === 'cancelled' ? (
                                    <Tag type="warm-gray">Cancelled</Tag>
                                  ) : null}
                                </TableCell>
                              ) : (
                                <TableCell key={cell.id}>
                                  <div className={classes.tableCell}>
                                    {cell.value ? (
                                      typeof cell.value === 'object' ? (
                                        cell.value['text'] ? (
                                          <div className={classes.prediction}>
                                            <span>{cell.value['text']}</span>
                                            {cell.value['duration'] ? (
                                              <Duration
                                                duration={
                                                  cell.value['duration']
                                                }
                                              />
                                            ) : null}
                                          </div>
                                        ) : (
                                          '-'
                                        )
                                      ) : (
                                        cell.value
                                      )
                                    ) : (
                                      '-'
                                    )}
                                  </div>
                                </TableCell>
                              ),
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            }}
          </DataTable>
          <Pagination
            pageSizes={[10, 25, 50]}
            totalItems={rows.length}
            onChange={(event: any) => {
              // Step 1: Update page size
              setPageSize(event.pageSize);
              // Step 2: Update page
              setPage(event.page);
            }}
          ></Pagination>
        </div>
      ) : null}
    </>
  );
}

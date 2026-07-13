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
  TableBatchActions,
  TableBatchAction,
  TableToolbarContent,
  TableToolbarSearch,
  TableHead,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Tag,
} from '@carbon/react';
import { Export, View, Edit, WarningAlt } from '@carbon/icons-react';

import { DatasetTask } from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';

import classes from './TasksTable.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================

interface Props {
  tasks: DatasetTask[];
  onView: (task: DatasetTask) => void;
  onToggleInclusion: (tasks: DatasetTask[]) => void;
}

interface Row {
  id: string;
  seed: string;
  num_turns: string;
  num_contexts: number;
  unanswerable: boolean;
  is_included: string;
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Helper function to populate tasks table headers and rows
 * @param tasks full set of dataset tasks
 * @returns
 */
function populateTable(
  tasks: DatasetTask[],
): [{ key: string; header: string }[], Row[]] {
  const headers = [
    { key: 'seed', header: 'Question' },
    { key: 'num_turns', header: 'Turn' },
    { key: 'num_contexts', header: 'Unique Contexts' },
    { key: 'unanswerable', header: 'Unanswerable' },
    { key: 'is_included', header: 'Included' },
  ];

  const rows: Row[] = [];
  tasks.forEach((task, taskIdx) => {
    const uniqueContextIds = new Set<string>();
    if (task.contexts) {
      task.contexts.forEach((context) =>
        uniqueContextIds.add(context.document_id),
      );
    }

    const lastUtterance = task.input[task.input.length - 1];
    const enrichments = lastUtterance.enrichments as
      | { [key: string]: string[] }
      | undefined;
    const unanswerable =
      uniqueContextIds.size === 0 ||
      enrichments?.['UNANSWERABLE'] !== undefined;

    rows.push({
      id: `${taskIdx}`,
      seed: task.input[task.input.length - 1].text,
      num_turns: task.turn,
      num_contexts: uniqueContextIds.size,
      unanswerable,
      is_included: task.is_included === 1 ? 'Yes' : 'No',
    });
  });

  return [headers, rows];
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function TasksTable({
  tasks,
  onView,
  onToggleInclusion,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleRows, setVisibleRows] = useState<Row[]>([]);

  // Step 2: Run effects
  // Step 2.a: Populate table header and rows
  var [headers, rows]: [{ key: string; header: string }[], Row[]] = useMemo(
    () => populateTable(tasks),
    [tasks],
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
          <div className={classes.tableScroll}>
            <DataTable rows={visibleRows} headers={headers} isSortable>
              {({
                rows,
                headers,
                getHeaderProps,
                getRowProps,
                getToolbarProps,
                getSelectionProps,
                getBatchActionProps,
                selectedRows,
                getTableProps,
                getTableContainerProps,
                onInputChange,
                selectRow,
              }) => {
                const batchActionProps = {
                  ...getBatchActionProps({
                    onSelectAll: () => {
                      rows.map((row) => {
                        if (!row.isSelected) {
                          selectRow(row.id);
                        }
                      });
                    },
                  }),
                };

                return (
                  <TableContainer
                    className={classes.table}
                    {...getTableContainerProps()}
                  >
                    <TableToolbar {...getToolbarProps()}>
                      <TableBatchActions {...batchActionProps}>
                        <TableBatchAction
                          tabIndex={
                            batchActionProps.shouldShowBatchActions ? 0 : -1
                          }
                          renderIcon={View}
                          onClick={() => {
                            onView(
                              selectedRows.map(
                                (entry) => tasks[parseInt(entry.id)],
                              )[0],
                            );
                          }}
                          disabled={selectedRows.length > 1}
                        >
                          View
                        </TableBatchAction>
                        <TableBatchAction
                          tabIndex={
                            batchActionProps.shouldShowBatchActions ? 0 : -1
                          }
                          renderIcon={Edit}
                          onClick={() => {
                            onToggleInclusion(
                              selectedRows.map(
                                (entry) => tasks[parseInt(entry.id)],
                              ),
                            );
                          }}
                        >
                          Toggle Include/Exclude from Experiment
                        </TableBatchAction>
                        <TableBatchAction
                          tabIndex={
                            batchActionProps.shouldShowBatchActions ? 0 : -1
                          }
                          renderIcon={Export}
                          disabled={true}
                          onClick={() => {
                            // Step 1.a: Create <a> tag
                            var element = document.createElement('a');

                            // Step 1.b: Set attributes
                            element.setAttribute(
                              'href',
                              'data:application/json;charset=utf-8, ' +
                                encodeURIComponent(
                                  JSON.stringify(
                                    selectedRows.map(
                                      (entry) => tasks[parseInt(entry.id)],
                                    ),
                                    null,
                                    2,
                                  ),
                                ),
                            );
                            element.setAttribute('download', `tasks.json`);

                            // Step 1.c: Add to DOM tree and click it
                            document.body.appendChild(element);
                            element.click();

                            // Step 1.d : Cleanup
                            document.body.removeChild(element);
                          }}
                        >
                          Export
                        </TableBatchAction>
                      </TableBatchActions>
                      <TableToolbarContent className={classes.toolbar}>
                        <TableToolbarSearch
                          className={classes.toolbarSearch}
                          onChange={() => onInputChange}
                        />
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {
                            //@ts-ignore
                            <TableSelectAll {...getSelectionProps()} />
                          }
                          {headers.map((header) => {
                            // Destructure key out of getHeaderProps so we set it
                            // explicitly and avoid a duplicate-key React warning.
                            const { key, ...headerProps } = getHeaderProps({
                              header,
                            }) as any;
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
                          // Same pattern: destructure key out so we control it explicitly.
                          const { key, ...rowProps } = getRowProps({
                            row,
                          }) as any;
                          return (
                            //@ts-ignore
                            <TableRow key={key} {...rowProps}>
                              {
                                //@ts-ignore
                                <TableSelectRow
                                  {...getSelectionProps({
                                    row,
                                  })}
                                />
                              }
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'seed') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <div className={classes.taskCell}>
                                        {truncate(cell.value, 80)}
                                      </div>
                                    </TableCell>
                                  );
                                }
                                if (cell.info.header === 'unanswerable') {
                                  return (
                                    <TableCell key={cell.id}>
                                      {cell.value ? (
                                        <Tag type="warm-gray" size="sm">
                                          <WarningAlt size={12} />
                                          &nbsp;Likely unanswerable
                                        </Tag>
                                      ) : null}
                                    </TableCell>
                                  );
                                }
                                return (
                                  <TableCell key={cell.id}>
                                    <div className={classes.tableCell}>
                                      {cell.value !== null &&
                                      cell.value !== undefined &&
                                      cell.value !== false
                                        ? Array.isArray(cell.value)
                                          ? cell.value.join(', ')
                                          : cell.value
                                        : '-'}
                                    </div>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                );
              }}
            </DataTable>
          </div>
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

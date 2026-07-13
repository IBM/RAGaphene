/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
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
import { Export, View } from '@carbon/icons-react';

import { Conversation } from '@/types/custom';
import { truncate, fileTimestamp } from '@/src/common/utilities/string';

import classes from './ConversationsTable.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================

interface Props {
  conversations: Conversation[];
  onView: Function;
}

interface Row {
  id: string;
  seed: string;
  num_turns: number;
  num_edits: number;
  num_contexts: number;
  author: string;
  status: string;
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Helper function to populate conversations table headers and rows
 * @param conversations full set of conversations
 * @returns
 */
function populateTable(
  conversations: Conversation[],
): [{ key: string; header: string }[], Row[]] {
  const headers = [
    {
      key: 'seed',
      header: 'Question',
    },
    {
      key: 'num_turns',
      header: '# of Turns',
    },
    {
      key: 'num_edits',
      header: '# of Edits',
    },
    {
      key: 'num_contexts',
      header: '# of Unique Contexts',
    },
    {
      key: 'author',
      header: 'Author',
    },
    {
      key: 'status',
      header: 'Status',
    },
  ];

  const rows: Row[] = [];
  conversations.forEach((conversation, conversationIdx) => {
    let num_edits = 0;
    const uniqueContextIds = new Set<string>();
    conversation.messages.forEach((message) => {
      // Update number of edits count
      if (message.originalText && !isEmpty(message.originalText)) {
        num_edits += 1;
      }

      // Add context id
      if (message.contexts) {
        message.contexts.forEach((context) =>
          uniqueContextIds.add(context.document_id),
        );
      }
    });

    rows.push({
      id: `${conversationIdx}`,
      seed: conversation.messages[0].text,
      num_turns: conversation.messages.length / 2,
      num_edits: num_edits,
      num_contexts: uniqueContextIds.size,
      author: conversation.author ? conversation.author : '-',
      status: conversation.status ? conversation.status : 'undecided',
    });
  });

  return [headers, rows];
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ConversationsTable({ conversations, onView }: Props) {
  // Step 1: Initialize state and necessary variables
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleRows, setVisibleRows] = useState<Row[]>([]);

  // Step 2: Run effects
  // Step 2.a: Populate table header and rows
  var [headers, rows]: [{ key: string; header: string }[], Row[]] = useMemo(
    () => populateTable(conversations),
    [conversations],
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
        <div>
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
                              (entry) => conversations[parseInt(entry.id)],
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
                        renderIcon={Export}
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
                                    (entry) =>
                                      conversations[parseInt(entry.id)],
                                  ),
                                  null,
                                  2,
                                ),
                              ),
                          );
                          element.setAttribute(
                            'download',
                            `workbench_conversations_${fileTimestamp()}.json`,
                          );

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
                        {headers.map((header, headerIdx) => {
                          return (
                            //@ts-ignore
                            <TableHeader
                              //@ts-ignore
                              key={`conversations-table__header-${headerIdx}`}
                              {...getHeaderProps({ header })}
                            >
                              {header.header}
                            </TableHeader>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row, rowIdx) => (
                        //@ts-ignore
                        <TableRow
                          //@ts-ignore
                          key={`conversations-table__row-${rowIdx}`}
                          {...getRowProps({ row })}
                        >
                          {
                            //@ts-ignore
                            <TableSelectRow
                              {...getSelectionProps({
                                row,
                              })}
                            />
                          }
                          {row.cells.map((cell) =>
                            cell.info.header === 'seed' ? (
                              <TableCell key={cell.id}>
                                <div className={classes.taskCell}>
                                  {truncate(cell.value, 80)}
                                </div>
                              </TableCell>
                            ) : cell.info.header === 'enrichments' ? (
                              <TableCell key={cell.id}>
                                <div className={classes.taskCell}>
                                  {cell.value.map((enrichment) => {
                                    return (
                                      <Tag
                                        key={`${enrichment.split('::').join('--')}`}
                                        type={enrichment.split('::')[0]}
                                      >
                                        {enrichment.split('::')[1]}
                                      </Tag>
                                    );
                                  })}
                                </div>
                              </TableCell>
                            ) : (
                              <TableCell key={cell.id}>
                                <div className={classes.tableCell}>
                                  {cell.value
                                    ? Array.isArray(cell.value)
                                      ? cell.value.join(', ')
                                      : cell.value
                                    : '-'}
                                </div>
                              </TableCell>
                            ),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            }}
          </DataTable>
          <Pagination
            pageSizes={[10, 25, 50, 100]}
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

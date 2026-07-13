/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { isEmpty } from 'lodash';
import { useState } from 'react';

import { Tile, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import { ChatBot, DataVis_4 } from '@carbon/icons-react';
import { DonutChart } from '@carbon/charts-react';

import { Conversation } from '@/types/custom';
import { useTheme } from '@/src/common/state/theme';
import { useWindowResize } from '@/src/common/hooks';
import ConversationsTable from '@/src/components/analyzer/ConversationsTable';
import ConversationViewer from '@/src/components/conversation-viewer/ConversationViewer';

import '@carbon/charts-react/styles.css';
import classes from './Analyzer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  conversations: Conversation[];
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Compute statistics on the uploaded conversations
 * Examples: # of authors, # of editors, # of turns, status distribution, enrichments distribution, # of unique contexts, # of edits per conversations
 * @param conversations
 */
function compute(conversations: Conversation[]) {
  // Step 1: Initialize necessary variables
  const authors: { [key: string]: number } = { unknown: 0 };
  const editors: { [key: string]: number } = {};
  const reviewers: { [key: string]: number } = {};
  const turns: { [key: string]: number } = {};
  const statuses: { [key: string]: number } = {};
  const contexts: { [key: string]: number } = {};
  const collections: { [key: string]: number } = {};
  const edits: { [key: string]: number } = {};
  const enrichments: { [key: string]: { [key: string]: number } } = {};

  // Step 2: Iterate over each conversation
  conversations.forEach((conversation) => {
    // Update authors statistics
    if (conversation.author) {
      if (authors.hasOwnProperty(conversation.author)) {
        authors[conversation.author] += 1;
      } else {
        authors[conversation.author] = 1;
      }
    } else {
      authors['unknown'] += 1;
    }

    // Update editors statistics — unique authors with an 'edited' entry in status_history
    const editorAuthors = new Set(
      (conversation.status_history ?? [])
        .filter((e) => e.status === 'edited')
        .map((e) => e.author),
    );
    editorAuthors.forEach((editorAuthor) => {
      if (editors.hasOwnProperty(editorAuthor)) {
        editors[editorAuthor] += 1;
      } else {
        editors[editorAuthor] = 1;
      }
    });

    // Update reviewers statistics — unique authors with an 'accepted' or 'rejected' entry
    const reviewerAuthors = new Set(
      (conversation.status_history ?? [])
        .filter((e) => e.status === 'accepted' || e.status === 'rejected')
        .map((e) => e.author),
    );
    reviewerAuthors.forEach((reviewerAuthor) => {
      if (reviewers.hasOwnProperty(reviewerAuthor)) {
        reviewers[reviewerAuthor] += 1;
      } else {
        reviewers[reviewerAuthor] = 1;
      }
    });

    // Update turn statistics
    const num_turns = `${conversation.messages.length / 2}`;
    if (turns.hasOwnProperty(num_turns)) {
      turns[num_turns] += 1;
    } else {
      turns[num_turns] = 1;
    }

    // Update collection statistics
    const collection =
      conversation['retriever'] &&
      conversation['retriever']['collection'] &&
      conversation['retriever']['collection']['name']
        ? conversation['retriever']['collection']['name']
        : undefined;
    if (collection) {
      if (collections.hasOwnProperty(collection)) {
        collections[collection] += 1;
      } else {
        collections[collection] = 1;
      }
    }

    // Update status statistics
    const status = conversation.status ? conversation.status : 'undecided';
    if (statuses.hasOwnProperty(status)) {
      statuses[status] += 1;
    } else {
      statuses[status] = 1;
    }

    // Update contexts and enrichment statistics
    const contextIds = new Set<string>();
    let num_edits = 0;
    conversation.messages.forEach((message) => {
      // Update number of edits
      if (message.originalText && !isEmpty(message.originalText)) {
        num_edits += 1;
      }

      // Update enrichments
      if (message.enrichments) {
        Object.entries(message.enrichments).forEach(
          ([entrichmentType, enrichmentValues]) => {
            if (enrichments.hasOwnProperty(entrichmentType)) {
              enrichmentValues.forEach((value) => {
                if (enrichments[entrichmentType].hasOwnProperty(value)) {
                  enrichments[entrichmentType][value] += 1;
                } else {
                  enrichments[entrichmentType][value] = 1;
                }
              });
            } else {
              enrichments[entrichmentType] = Object.fromEntries(
                enrichmentValues.map((value) => [value, 1]),
              );
            }
          },
        );
      }

      // Update unique contexts set
      if (message.contexts) {
        message.contexts.forEach((context) => {
          contextIds.add(context.document_id);
        });
      }
    });

    // Update number of unique contexts information
    if (contexts.hasOwnProperty(contextIds.size)) {
      contexts[contextIds.size] += 1;
    } else {
      contexts[contextIds.size] = 1;
    }

    // Update number of edits
    if (edits.hasOwnProperty(`${num_edits}`)) {
      edits[`${num_edits}`] += 1;
    } else {
      edits[`${num_edits}`] = 1;
    }
  });

  return {
    size: conversations.length,
    authors: authors,
    editors: editors,
    reviewers: reviewers,
    turns: turns,
    edits: edits,
    statuses: statuses,
    contexts: contexts,
    collections: collections,
    enrichments: enrichments,
  };
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function DatasetTile({
  data,
}: {
  data: {
    [key: string]:
      | number
      | { [key: string]: number }
      | { [key: string]: { [key: string]: number } };
  };
}) {
  // Step 1: Initialize necessary variables
  const numConversations: number =
    typeof data['size'] === 'number' ? data['size'] : 1;

  // Step 2: Render
  return (
    <Tile className={classes.tile}>
      <div className={classes.tileArtifact}>
        <div className={classes.tileArtifactTitle}>
          <span># of conversations</span>
        </div>
        <div className={classes.tileArtifactValue}>
          <span>{numConversations}</span>
        </div>
      </div>
      {Object.keys(data['authors']).length > 1 ? (
        <div className={classes.tileArtifact}>
          <div className={classes.tileArtifactTitle}>
            <span># of authors</span>
          </div>
          <div className={classes.tileArtifactValue}>
            <span>{Object.keys(data['authors']).length}</span>
          </div>
        </div>
      ) : null}
      {Object.keys(data['editors']).length > 1 ? (
        <div className={classes.tileArtifact}>
          <div className={classes.tileArtifactTitle}>
            <span># of editors</span>
          </div>
          <div className={classes.tileArtifactValue}>
            <span>{Object.keys(data['editors']).length}</span>
          </div>
        </div>
      ) : null}
      {Object.keys(data['reviewers']).length > 1 ? (
        <div className={classes.tileArtifact}>
          <div className={classes.tileArtifactTitle}>
            <span># of reviewers</span>
          </div>
          <div className={classes.tileArtifactValue}>
            <span>{Object.keys(data['reviewers']).length}</span>
          </div>
        </div>
      ) : null}
      <div className={classes.tileArtifact}>
        <div className={classes.tileArtifactTitle}>
          <span>Status ({`${Object.keys(data['statuses']).join(' / ')}`})</span>
        </div>
        <div className={classes.tileArtifactValue}>
          <span>{Object.values(data['statuses']).join(' / ')}</span>
        </div>
      </div>
      <div className={classes.tileArtifact}>
        <div className={classes.tileArtifactTitle}>
          <span>Avg. # of turns</span>
        </div>
        <div className={classes.tileArtifactValue}>
          <span>
            {(
              Object.entries(data['turns'])
                .map(([numTurns, count]) => parseInt(numTurns) * count)
                .reduce((a, b) => a + b, 0) /
              Object.values(data['turns']).reduce((a, b) => a + b, 0)
            ).toFixed(2)}
          </span>
        </div>
      </div>
      <div className={classes.tileArtifact}>
        <div className={classes.tileArtifactTitle}>
          <span>Avg. # of unique contexts</span>
        </div>
        <div className={classes.tileArtifactValue}>
          <span>
            {(
              Object.entries(data['contexts'])
                .map(([numContexts, count]) => parseInt(numContexts) * count)
                .reduce((a, b) => a + b, 0) / numConversations
            ).toFixed(2)}
          </span>
        </div>
      </div>
      <div className={classes.tileArtifact}>
        <div className={classes.tileArtifactTitle}>
          <span>Avg. # of edits</span>
        </div>
        <div className={classes.tileArtifactValue}>
          <span>
            {(
              Object.entries(data['edits'])
                .map(([numEdits, count]) => parseInt(numEdits) * count)
                .reduce((a, b) => a + b, 0) / numConversations
            ).toFixed(2)}
          </span>
        </div>
      </div>
    </Tile>
  );
}

function DonutGraph({
  key,
  data,
  size = '500px',
  theme,
  label,
}: {
  key?: string;
  data;
  size: string;
  theme: 'g10' | 'g90' | undefined;
  label: string;
}) {
  return (
    <DonutChart
      key={key}
      data={data}
      options={{
        width: size,
        height: size,
        donut: {
          center: {
            label: label,
            number: 100,
            numberFormatter: (number) => number + '%',
          },
          alignment: 'center',
        },
        toolbar: {
          enabled: false,
        },
        theme: theme,
      }}
    ></DonutChart>
  );
}
// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Analyzer({ conversations }: Props) {
  // Step 1: Initialize state and necessary variables
  const { WindowWidth, WindowHeight } = useWindowResize();

  const [selectedConversation, setSelectedConversation] = useState<
    Conversation | undefined
  >(undefined);

  // Step 2: Run effects

  // Step 2.b: Compute statistics on conversations
  const statistics = compute(conversations);

  // Step 2.c: Fetch theme
  const { theme } = useTheme();

  // Step 3: Render
  return (
    <>
      <div className={classes.page}>
        <div
          className={cx(
            classes.conversationOverlay,
            selectedConversation && classes.active,
          )}
        >
          {selectedConversation && (
            <ConversationViewer
              conversation={selectedConversation}
              onClose={() => {
                setSelectedConversation(undefined);
              }}
            />
          )}
        </div>

        <DatasetTile data={statistics} />

        <div className={classes.container}>
          <Tabs>
            <TabList
              className={classes.tabList}
              aria-label="Metrics tab"
              contained
            >
              {
                //@ts-ignore
                <Tab key={'data-characteristics-tab'} renderIcon={DataVis_4}>
                  Data Characteristics
                </Tab>
              }
              {
                //@ts-ignore
                <Tab key={'conversations-tab'} renderIcon={ChatBot}>
                  Conversations
                </Tab>
              }
            </TabList>
            <TabPanels>
              <TabPanel key={'data-characteristics-panel'}>
                <div className={classes.statisticsGroup}>
                  <h4>Conversations</h4>
                  <div className={classes.graphsGrid}>
                    <DonutGraph
                      data={Object.entries(statistics['statuses']).map(
                        ([group, value]) => {
                          return {
                            group: group,
                            value: value,
                          };
                        },
                      )}
                      label="Status"
                      size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                      theme={theme}
                    />
                    <DonutGraph
                      data={Object.entries(statistics['turns']).map(
                        ([group, value]) => {
                          return {
                            group: group,
                            value: value,
                          };
                        },
                      )}
                      label="Turns"
                      size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                      theme={theme}
                    />
                    <DonutGraph
                      data={Object.entries(statistics['contexts']).map(
                        ([group, value]) => {
                          return {
                            group: group,
                            value: value,
                          };
                        },
                      )}
                      label="Unique Contexts"
                      size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                      theme={theme}
                    />

                    {Object.keys(statistics['edits']).length > 1 ? (
                      <DonutGraph
                        data={Object.entries(statistics['edits']).map(
                          ([group, value]) => {
                            return {
                              group: group,
                              value: value,
                            };
                          },
                        )}
                        label="Edits"
                        size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                        theme={theme}
                      />
                    ) : null}

                    {Object.keys(statistics['collections']).length > 1 ? (
                      <DonutGraph
                        data={Object.entries(statistics['collections']).map(
                          ([group, value]) => {
                            return {
                              group: group,
                              value: value,
                            };
                          },
                        )}
                        label="Colletions"
                        size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                        theme={theme}
                      />
                    ) : null}
                  </div>
                </div>

                <div className={classes.statisticsGroup}>
                  <h4>Workers</h4>
                  <div className={classes.graphsGrid}>
                    <DonutGraph
                      data={Object.entries(statistics['authors']).map(
                        ([group, value]) => {
                          return {
                            group: group,
                            value: value,
                          };
                        },
                      )}
                      label="Authors"
                      size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                      theme={theme}
                    />

                    {Object.keys(statistics['editors']).length > 1 ? (
                      <DonutGraph
                        data={Object.entries(statistics['editors']).map(
                          ([group, value]) => {
                            return {
                              group: group,
                              value: value,
                            };
                          },
                        )}
                        label="Editors"
                        size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                        theme={theme}
                      />
                    ) : null}

                    {Object.keys(statistics['reviewers']).length > 1 ? (
                      <DonutGraph
                        data={Object.entries(statistics['reviewers']).map(
                          ([group, value]) => {
                            return {
                              group: group,
                              value: value,
                            };
                          },
                        )}
                        label="Reviewers"
                        size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                        theme={theme}
                      />
                    ) : null}
                  </div>
                </div>

                <div className={classes.statisticsGroup}>
                  <h4>Enrichments</h4>
                  <div className={classes.graphsGrid}>
                    {Object.entries(statistics['enrichments']).map(
                      ([enrichmentType, enrichmentValues]) => {
                        return (
                          <DonutGraph
                            key={`Chart--${enrichmentType}`}
                            data={Object.entries(enrichmentValues).map(
                              ([group, value]) => {
                                return {
                                  group: group,
                                  value: value,
                                };
                              },
                            )}
                            label={enrichmentType}
                            size={`${Math.round(Math.min(WindowWidth, WindowHeight) * 0.3)}px`}
                            theme={theme}
                          ></DonutGraph>
                        );
                      },
                    )}
                  </div>
                </div>
              </TabPanel>
              <TabPanel key={'conversations-panel'}>
                <ConversationsTable
                  conversations={conversations}
                  onView={(conversationToView) => {
                    setSelectedConversation(conversationToView);
                  }}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </div>
    </>
  );
}

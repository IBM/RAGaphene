/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useEffect, useState, useMemo } from 'react';
import { Button, TextArea, Loading, PaginationNav } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

import { ActiveRetriever, Document, Message } from '@/types/custom';
import { useNotification } from '@/src/components/notification/Notification';
import { retrieve } from '@/src/common/utilities/search';
import classes from './SearchPanel.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  retriever: ActiveRetriever | undefined;
  messages: Message[];
  setMessages: Function;
}

// ===================================================================================
//                               HELPER FUNCTION
// ===================================================================================
async function search(
  retriever: ActiveRetriever,
  query: string,
  createNotification: Function,
  setHits: Function,
  setSearching: Function,
) {
  if (retriever) {
    const [results, notifications] = await retrieve(
      retriever,
      query,
      retriever.settings.max_count * 3,
    );

    notifications.forEach((notification) => createNotification(notification));
    setHits(results);
  }

  setSearching(false);
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function Results({
  hits,
  existingContextIds,
  onClick,
  disabled = false,
}: {
  hits: Document[];
  existingContextIds: Set<string>;
  onClick: Function;
  disabled?: boolean;
}) {
  // Step 1: Initialize state and necessary variables
  const [pageNumber, setPageNumber] = useState<number>(0);
  const [visibleHits, setVisibleHits] = useState<Document[]>(
    hits.slice(pageNumber * 3, pageNumber * 3 + 3),
  );

  // Step 2: Run effects
  // Step 2.a: Adjust visible hits
  useEffect(() => {
    setVisibleHits(hits.slice(pageNumber * 3, pageNumber * 3 + 3));
  }, [hits, pageNumber]);

  // Step 3: Render
  return (
    <>
      {!isEmpty(visibleHits) ? (
        <>
          {visibleHits.map((hit, idx) => (
            <div key={`search-hit--${pageNumber * 3 + idx}`}>
              <div
                id={`search-hit--${pageNumber * 3 + idx}`}
                className={classes.hitContainer}
              >
                <Button
                  renderIcon={Add}
                  iconDescription="Add to contexts"
                  hasIconOnly
                  tooltipAlignment="start"
                  disabled={disabled || existingContextIds.has(hit.document_id)}
                  onClick={() => {
                    onClick(hit);
                  }}
                ></Button>
                <div className={classes.hit}>
                  <article className={classes.hitText}>
                    <div className={classes.markdown}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                      >
                        {hit.formatted_text ? hit.formatted_text : hit.text}
                      </ReactMarkdown>
                    </div>
                  </article>
                </div>
              </div>
              <div className={classes.divider} />
            </div>
          ))}
          <PaginationNav
            page={pageNumber}
            itemsShown={3}
            totalItems={hits.length / 3}
            onChange={(pageNumber) => {
              setPageNumber(pageNumber);
            }}
            className={classes.hitsNavigation}
          />
        </>
      ) : (
        <span>
          Failed to find matching documents. Please try rephrasing query and
          asking again.
        </span>
      )}
    </>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function SearchPanel({
  retriever,
  messages,
  setMessages,
}: Props) {
  // Step 1: Initialize necessary variables
  const [searching, setSearching] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [hits, setHits] = useState<Document[] | undefined>(undefined);
  const [latestAgentMessageIndex, setLatestAgentMessageIndex] =
    useState<number>(-1);

  // Step 2: Run effects
  // Step 2.a: Notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Update query, reset hits and update last agent message index
  useEffect(() => {
    // Step 2.b.i: Reset hits
    setHits(undefined);

    // Step 2.b.ii: Upate latest agent message index
    setLatestAgentMessageIndex(
      messages.findLastIndex((message) => message.speaker === 'agent'),
    );
  }, [messages.length]);

  // Step 2.c: Disable adding, if necessary
  const existingContextIds = useMemo(() => {
    if (
      latestAgentMessageIndex > 0 &&
      messages[latestAgentMessageIndex] &&
      messages[latestAgentMessageIndex].contexts
    ) {
      return new Set(
        messages[latestAgentMessageIndex].contexts?.map(
          (context) => context.document_id,
        ),
      );
    } else {
      return new Set<string>();
    }
  }, [
    messages,
    latestAgentMessageIndex,
    messages[latestAgentMessageIndex]?.contexts?.length,
  ]);

  // Step 3: Render
  return (
    <div className={classes.container}>
      <TextArea
        id="query--input"
        type="text"
        labelText="Query"
        rows={3}
        placeholder={'Type your query here'}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value.replace(/^\s+|\n+$/g, ''));
        }}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            if (retriever && !isEmpty(query)) {
              // Step 1: Clear previous hits and set searching to true
              setHits([]);
              setSearching(true);

              // Step 2: Run search
              await search(
                retriever,
                query,
                createNotification,
                setHits,
                setSearching,
              );
            }
          }
        }}
        disabled={!retriever}
        invalid={isEmpty(query)}
        invalidText={'Cannot be empty text'}
        className={classes.queryBox}
      />
      <Button
        kind="primary"
        onClick={async () => {
          if (retriever) {
            // Step 1: Clear previous hits and set searching to true
            setHits([]);
            setSearching(true);

            // Step 2 Run search
            await search(
              retriever,
              query,
              createNotification,
              setHits,
              setSearching,
            );
          }
        }}
        disabled={!retriever || isEmpty(query)}
      >
        Search
      </Button>
      {hits ? (
        <>
          <div className={classes.divider} />
          <h4>Results</h4>
          {searching && isEmpty(hits) ? (
            <Loading withOverlay={false} className={classes.loadingContainer} />
          ) : !searching ? (
            <Results
              hits={hits}
              existingContextIds={existingContextIds}
              onClick={(hit) => {
                // Step 1: Update context for latest agent message
                if (latestAgentMessageIndex > 0) {
                  // Step 1.a: Create copy of latest agent message
                  const updatedMessage = {
                    ...messages[latestAgentMessageIndex],
                  };

                  // Step 1.b: Add hit to contexts list
                  if (
                    updatedMessage.contexts &&
                    Array.isArray(updatedMessage.contexts)
                  ) {
                    updatedMessage.contexts.push(hit);
                  } else {
                    updatedMessage.contexts = [hit];
                  }

                  // Step 1.c: Update messages
                  setMessages(
                    messages.map((message, idx) =>
                      idx === latestAgentMessageIndex
                        ? updatedMessage
                        : message,
                    ),
                  );
                }
              }}
              disabled={latestAgentMessageIndex === -1}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useMemo, useCallback, useEffect } from 'react';
import {
  NumberInputSkeleton,
  NumberInput,
  Button,
  TextArea,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { Reset, CodeBlock } from '@carbon/icons-react';

import type { ActiveRetriever, RetrieverParams } from '@/types/custom';
import { VARIABLE } from '@/src/common/constants';

import classes from './RetrieverSettings.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  loading?: boolean;
  retriever: ActiveRetriever;
  defaults?: RetrieverParams;
  onChange: Function;
  hideLabel?: boolean;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function RetrieverParams({
  loading = false,
  retriever,
  defaults,
  onChange,
  hideLabel = false,
}: Props) {
  // Normalize query_syntax to a string for display and string-based validation
  const querySyntaxStr =
    typeof retriever.settings.query_syntax === 'string'
      ? retriever.settings.query_syntax
      : JSON.stringify(retriever.settings.query_syntax, null, 2);

  const [validQuery, querySyntaxException] = useMemo(() => {
    if (querySyntaxStr) {
      // Step : Validate valid JSON
      try {
        JSON.parse(querySyntaxStr);
      } catch (exception) {
        return [false, 'Must be a valid JSON object as per Elastic guidelines'];
      }

      // Step: Additional checks for 'ElasticSearch' type retriever
      if (retriever.connector.name === 'ElasticSearch') {
        // Step: Validate mandatory 'query' or 'knn' variable exists
        if (
          !(querySyntaxStr.includes('query') || querySyntaxStr.includes('knn'))
        ) {
          return [
            false,
            'Must include at least one of the following fields: "query", "knn"',
          ];
        }
      }

      if (!querySyntaxStr.includes('${QUERY}')) {
        return [false, 'Must include mandatory ${QUERY} variable'];
      }
    }

    return [true, ''];
  }, [querySyntaxStr, retriever.connector.name]);

  const [projectionTemplateException, projectionTemplateWarning] =
    useMemo(() => {
      if (
        retriever.settings.templates.projection &&
        retriever.settings.templates.projection.length > 0
      ) {
        // Step: Validate non-mapped field does not mandatory exists
        const variables: string[] = [];
        let mObj;
        while (
          (mObj = VARIABLE.exec(retriever.settings.templates.projection))
        ) {
          variables.push(mObj[1]);
        }
        if (variables.length === 0) {
          return [
            null,
            "The template doesn't specify any variables. You can ignore this warning if this is an expected behavior.",
          ];
        }

        return [null, null];
      } else {
        return ['Must be a valid markdown', null];
      }
    }, [retriever.settings.templates.projection]);

  const [displayTemplateException, displayTemplateWarning] = useMemo(() => {
    if (
      retriever.settings.templates.display &&
      retriever.settings.templates.display.length > 0
    ) {
      // Step: Validate non-mapped field does not mandatory exists
      const variables: string[] = [];
      let mObj;
      while ((mObj = VARIABLE.exec(retriever.settings.templates.display))) {
        variables.push(mObj[1]);
      }
      if (variables.length === 0) {
        return [
          null,
          "The format template doesn't specify any variables. You can ignore this warning if this is an expected behavior.",
        ];
      }

      return [null, null];
    } else {
      return ['Must be a valid markdown', null];
    }
  }, [retriever.settings.templates.display]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(querySyntaxStr);
      const formatted = JSON.stringify(parsed, null, 2);
      if (formatted !== querySyntaxStr) {
        onChange({ ...retriever.settings, query_syntax: formatted });
      }
    } catch {
      // not valid JSON yet — leave as-is
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(querySyntaxStr);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange({ ...retriever.settings, query_syntax: formatted });
    } catch {
      // invalid JSON — do nothing; the textarea's invalid state already signals the error
    }
  }, [querySyntaxStr, retriever.settings, onChange]);

  const handleQuerySyntaxPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData('text');
      try {
        const parsed = JSON.parse(pasted);
        event.preventDefault();
        onChange({
          ...retriever.settings,
          query_syntax: JSON.stringify(parsed, null, 2),
        });
      } catch {
        // not valid JSON — let the default paste behaviour handle it
      }
    },
    [retriever.settings, onChange],
  );

  return (
    <>
      {hideLabel ? null : <h5 className={classes.title}>Settings</h5>}
      {loading ? (
        <>
          <NumberInputSkeleton />
        </>
      ) : (
        <div className={classes.parametersContainer}>
          <NumberInput
            id="documents-limit--selector"
            min={1}
            max={10}
            value={retriever.settings?.max_count}
            label="Documents limit"
            onChange={(event, state) => {
              // state.value is string|number on steppers, null when typing — normalise to number.
              const value = Number(
                state.value ?? (event.target as HTMLInputElement).value,
              );
              if (!isNaN(value))
                onChange({ ...retriever.settings, max_count: value });
            }}
          />
          <NumberInput
            id="history-limit--selector"
            min={-1}
            max={9}
            step={2}
            value={retriever.settings?.max_utterances}
            label="History"
            helperText="Maximum number of utterances used in the query. Defaults (-1) to all utterances."
            onChange={(event, state) => {
              const value = Number(
                state.value ?? (event.target as HTMLInputElement).value,
              );
              if (!isNaN(value))
                onChange({ ...retriever.settings, max_utterances: value });
            }}
          />
          <div className={classes.querySyntaxContainer}>
            <div className={classes.querySyntaxHeader}>
              <span className={classes.querySyntaxLabel}>Query syntax</span>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={CodeBlock}
                iconDescription="Format JSON"
                hasIconOnly
                tooltipPosition="left"
                onClick={handleFormatJson}
                disabled={!querySyntaxStr}
                className={classes.formatButton}
              />
            </div>
            <TextArea
              id="query-syntax--input"
              labelText=""
              hideLabel
              value={querySyntaxStr}
              rows={8}
              onChange={(event) => {
                onChange({
                  ...retriever.settings,
                  query_syntax: event.target.value,
                });
              }}
              onPaste={handleQuerySyntaxPaste}
              invalid={!validQuery}
              invalidText={querySyntaxException}
              className={classes.querySyntaxTextarea}
            />
          </div>
          {retriever.connector.provider !== 'local' && (
            <>
              <TextArea
                id="projection-template--input"
                labelText="Projection Template"
                helperText={
                  <div className={classes.templateInfo}>
                    <UnorderedList>
                      <ListItem>Must be a valid markdown.</ListItem>
                      <ListItem>
                        {
                          'Built-in support for variables via ${DOCUMENT.field_name} syntax.'
                        }
                      </ListItem>
                    </UnorderedList>
                  </div>
                }
                placeholder="${text}"
                value={retriever.settings.templates.projection}
                rows={4}
                onChange={(event) => {
                  onChange({
                    ...retriever.settings,
                    templates: {
                      ...retriever.settings.templates,
                      projection: event.target.value,
                    },
                  });
                }}
                invalid={projectionTemplateException !== null}
                invalidText={projectionTemplateException}
                warn={projectionTemplateWarning !== null}
                warnText={projectionTemplateWarning}
              />
              <TextArea
                id="display-template--input"
                labelText="Display Template"
                helperText={
                  <div className={classes.templateInfo}>
                    <UnorderedList>
                      <ListItem>Must be a valid markdown.</ListItem>
                      <ListItem>
                        {
                          'Built-in support for variables via ${DOCUMENT.field_name} syntax.'
                        }
                      </ListItem>
                    </UnorderedList>
                  </div>
                }
                placeholder="${text}"
                value={retriever.settings.templates.display}
                rows={4}
                onChange={(event) => {
                  onChange({
                    ...retriever.settings,
                    templates: {
                      ...retriever.settings.templates,
                      display: event.target.value,
                    },
                  });
                }}
                invalid={displayTemplateException !== null}
                invalidText={displayTemplateException}
                warn={displayTemplateWarning !== null}
                warnText={displayTemplateWarning}
              />
            </>
          )}

          {defaults ? (
            <Button
              id="reset-parameters"
              kind="ghost"
              renderIcon={Reset}
              onClick={() => {
                onChange(defaults);
              }}
              disabled={loading}
            >
              Reset to default
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}

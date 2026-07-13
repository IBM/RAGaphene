/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck

'use client';

import { isEmpty } from 'lodash';
import { useState, useMemo } from 'react';
import {
  Accordion,
  AccordionItem,
  ToggleSkeleton,
  NumberInputSkeleton,
  TextInputSkeleton,
  Slider,
  NumberInput,
  TextInput,
  TextArea,
  Button,
  Tag,
} from '@carbon/react';
import { UpdateNow, Add } from '@carbon/icons-react';

import { ActiveGenerator } from '@/types/custom';
import { hash } from '@/src/common/utilities/string';
import classes from './GeneratorSettings.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  loading?: boolean;
  generator: ActiveGenerator;
  onChange: Function;
  open?: boolean;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function DecodingParameters({
  loading = false,
  generator,
  onChange,
}: {
  loading: boolean;
  generator: ActiveGenerator;
  onChange: Function;
}) {
  const params = generator.settings?.parameters;
  const updateParams = (patch) =>
    onChange({
      ...generator,
      settings: { ...generator.settings, parameters: { ...params, ...patch } },
    });

  return (
    <div className={classes.decodingParameters}>
      {loading ? (
        <>
          <ToggleSkeleton /> <NumberInputSkeleton /> <NumberInputSkeleton />
        </>
      ) : (
        <>
          <Slider
            id={'temperature--selector'}
            labelText="Temperature"
            value={params?.temperature | 1.0}
            min={0}
            max={1.0}
            step={0.05}
            stepMultiplier={10}
            onChange={(data) => updateParams({ temperature: data.value })}
            warn={
              params?.temperature !== undefined &&
              params?.temperature !== 1.0 &&
              params?.top_p !== undefined &&
              params?.top_p !== 1.0
            }
            warnText={
              'We generally recommend altering this or Top P but not both.'
            }
          />
          <Slider
            id={'top_p--selector'}
            labelText="Top P"
            value={params?.top_p | 1.0}
            min={0}
            max={1.0}
            step={0.05}
            stepMultiplier={10}
            onChange={(data) => updateParams({ top_p: data.value })}
            warn={
              params?.temperature !== undefined &&
              params?.temperature !== 1.0 &&
              params?.top_p !== undefined &&
              params?.top_p !== 1.0
            }
            warnText={
              'We generally recommend altering this or temperature but not both.'
            }
          />

          {params?.repetition_penalty ? (
            <Slider
              id={'repetition_penalty--selector'}
              labelText="Repetition penalty"
              value={params?.repetition_penalty}
              min={0}
              max={2.0}
              step={0.05}
              stepMultiplier={20}
              onChange={(data) =>
                updateParams({ repetition_penalty: data.value })
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function StoppingCriteriaParameters({
  loading = false,
  generator,
  onChange,
}: {
  loading: boolean;
  generator: ActiveGenerator;
  onChange: Function;
}) {
  const [stopSequence, setStopSequence] = useState<string>('');
  const params = generator.settings?.parameters;
  const updateParams = (patch) =>
    onChange({
      ...generator,
      settings: { ...generator.settings, parameters: { ...params, ...patch } },
    });

  return (
    <div className={classes.decodingParameters}>
      {loading ? (
        <>
          <TextInputSkeleton />
          <NumberInputSkeleton />
        </>
      ) : (
        <>
          <div className={classes.stopSequences}>
            <TextInput
              id="stop-sequences--input"
              type="text"
              labelText="Stop sequences"
              placeholder="Type string and click + to add"
              value={stopSequence}
              onChange={(event) => {
                setStopSequence(event.target.value);
              }}
            />
            <Button
              id="stop-sequences--add-btn"
              kind="secondary"
              renderIcon={Add}
              iconDescription="Add stop sequence"
              tooltipPosition="bottom"
              hasIconOnly
              disabled={
                isEmpty(stopSequence) ||
                params?.stop_sequences?.includes(stopSequence)
              }
              onClick={() => {
                if (
                  !isEmpty(stopSequence) &&
                  !params?.stop_sequences?.includes(stopSequence)
                ) {
                  updateParams({
                    stop_sequences: params?.stop_sequences
                      ? [...params.stop_sequences, stopSequence]
                      : [stopSequence],
                  });
                }
                setStopSequence('');
              }}
            />
          </div>
          {params?.stop_sequences ? (
            <div className={classes.stopSequenceTags}>
              {params?.stop_sequences.map((seq) => (
                <Tag
                  key={`stop-sequence--${seq}`}
                  className={classes.stopSequenceTag}
                  filter
                  onClose={() => {
                    updateParams({
                      stop_sequences: params?.stop_sequences
                        ? params.stop_sequences.filter((entry) => entry !== seq)
                        : [],
                    });
                  }}
                >
                  {seq}
                </Tag>
              ))}
            </div>
          ) : null}
          <div
            id={'token-limit--selectors'}
            className={classes.tokenLimitSelectors}
          >
            <NumberInput
              id="min-token-limit--selector"
              min={1}
              max={
                generator['token_limits'] &&
                generator['token_limits'][0]['token_limit']
                  ? generator['token_limits'][0]['token_limit']
                  : 1024
              }
              value={params?.min_new_tokens}
              label="Min new tokens"
              onChange={(event, state) => {
                // state.value is string|number on steppers, null when typing — normalise to number.
                const value = Number(
                  state.value ?? (event.target as HTMLInputElement).value,
                );
                if (!isNaN(value)) updateParams({ min_new_tokens: value });
              }}
            />
            <NumberInput
              id="max-token-limit--selector"
              min={1}
              max={
                generator['token_limits'] &&
                generator['token_limits'][0]['token_limit']
                  ? generator['token_limits'][0]['token_limit']
                  : 1024
              }
              value={params?.max_new_tokens}
              label="Max new tokens"
              onChange={(event, state) => {
                // state.value is string|number on steppers, null when typing — normalise to number.
                const value = Number(
                  state.value ?? (event.target as HTMLInputElement).value,
                );
                if (!isNaN(value)) updateParams({ max_new_tokens: value });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PromptParameters({
  loading = false,
  generator,
  onChange,
}: {
  loading: boolean;
  generator: ActiveGenerator;
  onChange: Function;
}) {
  const prompt = generator.settings?.prompt;
  const [promptTemplate, setPromptTemplate] = useState<string>(
    prompt?.template,
  );
  const [inputTemplate, setInputTemplate] = useState<string>(prompt?.input);
  const [contextTemplate, setContextTemplate] = useState<string | undefined>(
    prompt?.context,
  );
  const [systemInstruction, setSystemInstruction] = useState<
    string | undefined
  >(prompt?.system_instruction);

  const [invalidInputTemplate, inputTemplateException] = useMemo(() => {
    if (!inputTemplate?.includes('${TEXT}')) {
      return [true, 'Must include mandatory ${TEXT} variable'];
    }
    return [false, ''];
  }, [inputTemplate]);

  const [invalidPromptTemplate, promptTemplateException] = useMemo(() => {
    if (!promptTemplate?.includes('${INPUT}')) {
      return [true, 'Must include mandatory ${INPUT} variable'];
    }
    return [false, ''];
  }, [promptTemplate]);

  const [invalidContextTemplate, contextTemplateException] = useMemo(() => {
    if (contextTemplate && !contextTemplate.includes('${TEXT}')) {
      return [true, 'Must include mandatory ${TEXT} variable'];
    }
    return [false, ''];
  }, [contextTemplate]);

  const [invalidSystemInstruction, systemInstructionException] = useMemo(() => {
    return [false, ''];
  }, []);

  return (
    <div className={classes.promptParameters}>
      {loading ? (
        <>
          <TextInputSkeleton />
          <TextInputSkeleton />
        </>
      ) : (
        <>
          <TextArea
            id="prompt-template--input"
            type="text"
            labelText="Prompt Template"
            placeholder={prompt?.template}
            value={promptTemplate}
            onChange={(event) => setPromptTemplate(event.target.value)}
            invalid={invalidPromptTemplate}
            invalidText={promptTemplateException}
          />

          <TextArea
            id="input-template--input"
            type="text"
            labelText="Input Template"
            rows={2}
            placeholder={prompt?.input}
            value={inputTemplate}
            onChange={(event) => setInputTemplate(event.target.value)}
            invalid={invalidInputTemplate}
            invalidText={inputTemplateException}
          />

          {prompt?.context ? (
            <TextArea
              id="context-template--input"
              type="text"
              labelText="Context Template"
              rows={3}
              placeholder={prompt?.context}
              value={contextTemplate}
              onChange={(event) => setContextTemplate(event.target.value)}
              invalid={invalidContextTemplate}
              invalidText={contextTemplateException}
            />
          ) : null}

          {prompt?.system_instruction ? (
            <TextArea
              id="system_instruction--input"
              type="text"
              labelText="System Instruction"
              placeholder={prompt?.system_instruction}
              value={systemInstruction}
              onChange={(event) => setSystemInstruction(event.target.value)}
              invalid={invalidSystemInstruction}
              invalidText={systemInstructionException}
            />
          ) : null}

          <Button
            id="prompt--update-btn"
            kind="primary"
            renderIcon={UpdateNow}
            disabled={
              isEmpty(promptTemplate) ||
              isEmpty(inputTemplate) ||
              (prompt?.context && isEmpty(contextTemplate)) ||
              (prompt?.system_instruction && isEmpty(systemInstruction))
            }
            onClick={() => {
              onChange({
                ...generator,
                settings: {
                  ...generator.settings,
                  prompt: {
                    template: promptTemplate,
                    input: inputTemplate,
                    ...(contextTemplate && { context: contextTemplate }),
                    ...(systemInstruction && {
                      system_instruction: systemInstruction,
                    }),
                  },
                },
              });
            }}
          >
            Update
          </Button>
        </>
      )}
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function TextCompletionSettingsSelector({
  loading = false,
  generator,
  onChange,
  open = false,
}: Props) {
  return (
    <Accordion className={classes.accordionContent}>
      <AccordionItem title="Prompt" open={open}>
        <PromptParameters
          key={`prompt-parameters--${hash(JSON.stringify(generator.settings?.prompt))}`}
          loading={loading}
          generator={generator}
          onChange={onChange}
        />
      </AccordionItem>
      <AccordionItem title="Decoding" open={open}>
        <DecodingParameters
          loading={loading}
          generator={generator}
          onChange={onChange}
        />
      </AccordionItem>
      <AccordionItem title="Stopping Criteria" open={true}>
        <StoppingCriteriaParameters
          loading={loading}
          generator={generator}
          onChange={onChange}
        />
      </AccordionItem>
    </Accordion>
  );
}

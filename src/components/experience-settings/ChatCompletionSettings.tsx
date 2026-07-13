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
            value={params?.temperature}
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
            labelText="top_p"
            value={params?.top_p}
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
  const [stop, setStop] = useState<string>('');
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
              id="stop--input"
              type="text"
              labelText="Stop"
              placeholder="Type string and click + to add"
              value={stop}
              onChange={(event) => setStop(event.target.value)}
            />
            <Button
              id="stop-sequences--add-btn"
              kind="secondary"
              renderIcon={Add}
              iconDescription="Add stop sequence"
              tooltipPosition="bottom"
              hasIconOnly
              disabled={isEmpty(stop) || params?.stop?.includes(stop)}
              onClick={() => {
                if (!isEmpty(stop) && !params?.stop?.includes(stop)) {
                  updateParams({
                    stop: params?.stop ? [...params.stop, stop] : [stop],
                  });
                }
                setStop('');
              }}
            />
          </div>
          {params?.stop ? (
            <div className={classes.stopSequenceTags}>
              {params?.stop.map((s) => (
                <Tag
                  key={`stop-sequence--${s}`}
                  className={classes.stopSequenceTag}
                  filter
                  onClose={() => {
                    updateParams({
                      stop: params?.stop
                        ? params.stop.filter((entry) => entry !== s)
                        : [],
                    });
                  }}
                >
                  {s}
                </Tag>
              ))}
            </div>
          ) : null}
          <div
            id={'token-limit--selectors'}
            className={classes.tokenLimitSelectors}
          >
            <NumberInput
              id="max-token-limit--selector"
              min={1}
              max={
                generator['token_limits'] &&
                generator['token_limits'][0]['token_limit']
                  ? generator['token_limits'][0]['token_limit']
                  : 1024
              }
              value={params?.max_completion_tokens}
              label="Max new tokens"
              onChange={(event, state) => {
                // state.value is string|number on steppers, null when typing — normalise to number.
                const value = Number(
                  state.value ?? (event.target as HTMLInputElement).value,
                );
                if (!isNaN(value))
                  updateParams({ max_completion_tokens: value });
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
  const [systemInstruction, setSystemInstruction] = useState<
    string | undefined
  >(prompt?.system_instruction);
  const [contextTemplate, setContextTemplate] = useState<string | undefined>(
    prompt?.context,
  );

  const [invalidSystemInstruction, systemInstructionException] = useMemo(() => {
    return [false, ''];
  }, []);

  const [invalidContextTemplate, contextTemplateException] = useMemo(() => {
    if (contextTemplate && !contextTemplate.includes('${TEXT}')) {
      return [true, 'Must include mandatory ${TEXT} variable'];
    }
    return [false, ''];
  }, [contextTemplate]);

  return (
    <div className={classes.promptParameters}>
      {loading ? (
        <>
          <TextInputSkeleton />
          <TextInputSkeleton />
        </>
      ) : (
        <>
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

          <Button
            id="prompt--update-btn"
            kind="primary"
            renderIcon={UpdateNow}
            disabled={prompt?.system_instruction && isEmpty(systemInstruction)}
            onClick={() => {
              onChange({
                ...generator,
                settings: {
                  ...generator.settings,
                  prompt: {
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
export default function ChatCompletionSettingsSelector({
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
          key={`decoding-parameters--${generator.settings?.parameters?.repetition_penalty}`}
          loading={loading}
          generator={generator}
          onChange={onChange}
        />
      </AccordionItem>
      <AccordionItem title="Stopping Criteria" open={true}>
        <StoppingCriteriaParameters
          key={`decoding-parameters--${hash(JSON.stringify(generator.settings?.parameters))}`}
          loading={loading}
          generator={generator}
          onChange={onChange}
        />
      </AccordionItem>
    </Accordion>
  );
}

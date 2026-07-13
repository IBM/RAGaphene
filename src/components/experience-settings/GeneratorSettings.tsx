/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Button, Toggle } from '@carbon/react';
import { Reset } from '@carbon/icons-react';

import {
  ActiveGenerator,
  TextCompletionPromptSettings,
  ChatCompletionPromptSettings,
  TextCompletionParameters,
  ChatCompletionParameters,
} from '@/types/custom';
import TextCompletionSettingsSelector from '@/src/components/experience-settings/TextCompletionSettings';
import ChatCompletionSettingsSelector from '@/src/components/experience-settings/ChatCompletionSettings';

import classes from './GeneratorSettings.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  loading?: boolean;
  generator: ActiveGenerator;
  defaults?: {
    prompt: TextCompletionPromptSettings | ChatCompletionPromptSettings;
    parameters?: TextCompletionParameters | ChatCompletionParameters;
  };
  onChange: Function;
  open?: boolean;
  hideLabel?: boolean;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function GeneratorParams({
  loading = false,
  generator,
  defaults,
  onChange,
  open = false,
  hideLabel = false,
}: Props) {
  const supportedModes = generator.connector.settings.supported_modes;
  const supportsCompletion =
    !supportedModes || supportedModes.includes('completion');
  const supportsChatCompletion =
    !supportedModes || supportedModes.includes('chat_completion');
  const showModeToggle = supportsCompletion && supportsChatCompletion;

  return (
    <>
      {hideLabel ? null : <h5 className={classes.title}>Settings</h5>}
      {showModeToggle ? (
        <div className={classes.chatCompletionSettings}>
          <Toggle
            key={`toggle__mode--${generator.connector.name}-${generator.mode}`}
            id="toggle__mode"
            labelText="Completion mode"
            toggled={generator.mode === 'chat_completion'}
            labelA="Text completion"
            labelB="Chat completion"
            onToggle={(checked) => {
              const newMode = checked ? 'chat_completion' : 'completion';
              const {
                max_new_tokens,
                stop_sequences,
                max_completion_tokens,
                stop,
                ...sharedParams
              } = (generator.settings?.parameters ?? {}) as any;
              const remappedParams =
                newMode === 'chat_completion'
                  ? {
                      ...sharedParams,
                      max_completion_tokens:
                        max_new_tokens ?? max_completion_tokens,
                      ...(stop_sequences?.length && { stop: stop_sequences }),
                      ...(stop?.length && { stop }),
                    }
                  : {
                      ...sharedParams,
                      max_new_tokens: max_completion_tokens ?? max_new_tokens,
                      ...(stop?.length && { stop_sequences: stop }),
                      ...(stop_sequences?.length && { stop_sequences }),
                    };
              onChange({
                ...generator,
                mode: newMode,
                settings: { ...generator.settings, parameters: remappedParams },
              });
            }}
          ></Toggle>
        </div>
      ) : null}

      {generator.mode === 'chat_completion' ? (
        <ChatCompletionSettingsSelector
          loading={loading}
          generator={generator}
          onChange={onChange}
          open={open}
        />
      ) : (
        <TextCompletionSettingsSelector
          loading={loading}
          generator={generator}
          onChange={onChange}
          open={open}
        />
      )}
      {defaults ? (
        <Button
          id="reset-parameters"
          kind="ghost"
          renderIcon={Reset}
          onClick={() => {
            onChange({ ...generator, ...defaults });
          }}
          disabled={loading}
        >
          Reset to default
        </Button>
      ) : null}
    </>
  );
}

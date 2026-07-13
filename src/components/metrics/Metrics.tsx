/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';
import { isEmpty } from 'lodash';
import { useEffect, useState } from 'react';
import {
  Button,
  Modal,
  TextInput,
  PasswordInput,
  Search,
  RadioTile,
  SelectableTile,
  Select,
  SelectItem,
  TextArea,
  Tag,
} from '@carbon/react';
import { ArrowRight, ArrowLeft, Settings, ModelAlt } from '@carbon/icons-react';
import ConnectorTag from '@/src/components/connector-tag/ConnectorTag';
import {
  SystemConfiguration,
  Metric,
  ActiveGenerator,
  GeneratorConfig,
  TextCompletionPromptSettings,
  GeneratorSnapshot,
} from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';
import { useNotification } from '@/src/components/notification/Notification';

import classes from './Metrics.module.scss';

// --- Types ---

interface Props {
  systemConfiguration: SystemConfiguration;
  componentToTest: string;
  metrics: Metric[];
  onUpdate: (updated: Metric[]) => void;
  onPrevious: () => void;
  onNext?: () => void;
}

// --- Constants ---

const METRICS: Metric[] = [
  {
    name: 'context_recall',
    displayName: 'Context Recall',
    description:
      'Fraction of gold context document IDs found in the retrieved results ' +
      '(|retrieved ∩ gold| / |gold|). Recall is measured against annotated gold contexts.',
    author: 'IBM Research',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 1.0, 0.1],
    tags: ['Retriever'],
  },
  {
    name: 'char_length',
    displayName: 'Length (in characters)',
    description:
      'Measure the character count of the generated response. Useful for detecting truncation or verbosity patterns across the task set.',
    author: 'IBM Research',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [1, 1000, 50],
    tags: ['Generator'],
  },
  {
    name: 'f1',
    displayName: 'F1 (word-level)',
    description:
      'Harmonic mean of word-level precision and recall against the reference answer. Partial credit for responses that share vocabulary with the gold answer.',
    author: 'IBM Research',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 1.0, 0.1],
    tags: ['Generator'],
  },
  {
    name: 'em',
    displayName: 'Exact Match',
    description:
      'Binary score — 1 if the generated response matches the reference answer exactly (after normalisation), 0 otherwise. A strict upper-bound check.',
    author: 'IBM Research',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 1.0, 0.1],
    tags: ['Generator'],
  },
  {
    name: 'recall',
    displayName: 'Recall (word-level)',
    description:
      'Fraction of reference answer words that appear in the generated response. High recall indicates good coverage; does not penalise verbosity.',
    author: 'IBM Research',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 1.0, 0.1],
    tags: ['Generator'],
  },
  {
    name: 'rouge-l',
    displayName: 'RougeL',
    description:
      'Longest common subsequence overlap between the generated response and the reference answer. Captures fluency and order of content better than bag-of-words metrics.',
    author: 'Third Party (rouge-score)',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 1.0, 0.1],
    tags: ['Generator'],
  },
  {
    name: 'bleu',
    displayName: 'Bleu',
    description:
      'N-gram precision of the generated response against the reference answer, with a brevity penalty. Commonly used for translation and generation quality benchmarking.',
    author: 'Third Party (sacrebleu)',
    kind: 'algorithm',
    type: 'numerical',
    aggregator: 'average',
    range: [0.0, 100, 10],
    tags: ['Generator'],
  },
  {
    name: 'grounded',
    displayName: 'Grounded',
    description:
      'LLM-as-judge assessment of whether the generated response is supported by the retrieved context, with no reliance on external knowledge. Requires a configured judge model.',
    author: 'IBM Research - Almaden',
    kind: 'llm',
    type: 'categorical',
    aggregator: 'majority',
    values: [
      { value: 'no', displayValue: 'No', numericValue: 0 },
      { value: 'unsure', displayValue: 'Unsure', numericValue: 0.5 },
      { value: 'yes', displayValue: 'Yes', numericValue: 1 },
      // 'error' is assigned when the judge call fails or produces unparseable output.
      // numericValue matches 'unsure' (0.5) — avoids conflating a judge failure with a
      // genuine 'no' (0) result when InspectorRAGet aggregates numeric scores.
      { value: 'error', displayValue: 'Error', numericValue: 0.5 },
    ],
    tags: ['Generator', 'Experimental'],
    // Requires a generator to be configured before it can be selected.
    disabled: true,
  },
  {
    name: 'pertinent',
    displayName: 'Pertinent',
    description:
      'LLM-as-judge assessment of whether the generated response directly addresses the question asked, without irrelevant or off-topic content. Requires a configured judge model.',
    author: 'IBM Research - Almaden',
    kind: 'llm',
    type: 'categorical',
    aggregator: 'majority',
    values: [
      { value: 'no', displayValue: 'No', numericValue: 0 },
      { value: 'unsure', displayValue: 'Unsure', numericValue: 0.5 },
      { value: 'yes', displayValue: 'Yes', numericValue: 1 },
      // 'error' is assigned when the judge call fails or produces unparseable output.
      // numericValue matches 'unsure' (0.5) — avoids conflating a judge failure with a
      // genuine 'no' (0) result when InspectorRAGet aggregates numeric scores.
      { value: 'error', displayValue: 'Error', numericValue: 0.5 },
    ],
    tags: ['Generator', 'Experimental'],
    disabled: true,
  },
  {
    name: 'coherent',
    displayName: 'Coherent',
    description:
      'LLM-as-judge assessment of whether the generated response is logically consistent and well-formed — no self-contradictions, abrupt topic shifts, or incomplete reasoning. Complements Grounded and Pertinent: a response can be grounded and on-topic yet still be incoherent. Requires a configured judge model.',
    author: 'IBM Research - Almaden',
    kind: 'llm',
    type: 'categorical',
    aggregator: 'majority',
    values: [
      { value: 'no', displayValue: 'No', numericValue: 0 },
      { value: 'unsure', displayValue: 'Unsure', numericValue: 0.5 },
      { value: 'yes', displayValue: 'Yes', numericValue: 1 },
      // 'error' is assigned when the judge call fails or produces unparseable output.
      // numericValue matches 'unsure' (0.5) — avoids conflating a judge failure with a
      // genuine 'no' (0) result when InspectorRAGet aggregates numeric scores.
      { value: 'error', displayValue: 'Error', numericValue: 0.5 },
    ],
    tags: ['Generator', 'Experimental'],
    disabled: true,
  },
  {
    name: 'concise',
    displayName: 'Concise',
    description:
      'LLM-as-judge assessment of whether the generated response answers the question without unnecessary padding, repetition, or filler. Complements Length (in characters): a response can be short yet padded, or long yet purposeful. Requires a configured judge model.',
    author: 'IBM Research - Almaden',
    kind: 'llm',
    type: 'categorical',
    aggregator: 'majority',
    values: [
      { value: 'no', displayValue: 'No', numericValue: 0 },
      { value: 'unsure', displayValue: 'Unsure', numericValue: 0.5 },
      { value: 'yes', displayValue: 'Yes', numericValue: 1 },
      // 'error' is assigned when the judge call fails or produces unparseable output.
      // numericValue matches 'unsure' (0.5) — avoids conflating a judge failure with a
      // genuine 'no' (0) result when InspectorRAGet aggregates numeric scores.
      { value: 'error', displayValue: 'Error', numericValue: 0.5 },
    ],
    tags: ['Generator', 'Experimental'],
    disabled: true,
  },
  {
    name: 'context_sufficient',
    displayName: 'Context Sufficient',
    description:
      'LLM-as-judge assessment of whether the retrieved context contains enough information to answer the question, independent of what the generator produced. A low score indicates a retriever configuration problem, not a generator problem. Requires a configured judge model.',
    author: 'IBM Research - Almaden',
    kind: 'llm',
    type: 'categorical',
    aggregator: 'majority',
    values: [
      { value: 'no', displayValue: 'No', numericValue: 0 },
      { value: 'unsure', displayValue: 'Unsure', numericValue: 0.5 },
      { value: 'yes', displayValue: 'Yes', numericValue: 1 },
      // 'error' is assigned when the judge call fails or produces unparseable output.
      // numericValue matches 'unsure' (0.5) — avoids conflating a judge failure with a
      // genuine 'no' (0) result when InspectorRAGet aggregates numeric scores.
      { value: 'error', displayValue: 'Error', numericValue: 0.5 },
    ],
    // Surfaces under all three componentToTest modes — retriever-only runs have no
    // prediction but the context + input alone are enough to judge sufficiency.
    tags: ['Retriever', 'Generator', 'Experimental'],
    disabled: true,
  },
];

// --- Helpers ---

// Returns catalog entries relevant for the given componentToTest value.
// Tags drive the filter: 'generator' → Generator-tagged only, 'retriever' → Retriever-tagged
// only, 'both' → everything.
function metricsForComponent(component: string): Metric[] {
  return METRICS.filter((m) => {
    if (!m.tags) return true;
    if (component === 'generator') return m.tags.includes('Generator');
    if (component === 'retriever') return m.tags.includes('Retriever');
    return true; // 'both'
  });
}

// --- ConfigureMetric ---

// Prompt templates owned by each LLM metric. The metric catalog definition
// controls the evaluation prompt, not the connector defaults.
const METRIC_PROMPTS: Record<string, TextCompletionPromptSettings> = {
  grounded: {
    // ${SYSTEM_INST} is substituted first so the model sees the task framing
    // and format rules before the content. [Judgement] is the final token —
    // the model continues directly into the <reasoning> block.
    template:
      '${SYSTEM_INST}\n\n[Input]\n${INPUT}[Context]\n${CONTEXT}[Prediction]\n${PREDICTION}\n[Judgement]\n',
    input: '${SPEAKER}: ${TEXT}\n',
    system_instruction:
      'You are a grounding judge. Read the [Context] and the [Prediction].\n\nStep 1 — List each distinct factual claim made in the prediction.\nStep 2 — For each claim, state whether it is Supported, Contradicted, or Absent from the context.\nStep 3 — Write your verdict inside <verdict> tags.\n\nRules:\n- Yes    if every claim is Supported.\n- No     if any claim is Contradicted or Absent.\n- Unsure if you cannot determine support from the context alone.\n\nBudget: you have 2048 tokens total. Keep your reasoning concise — group minor claims, cap at 10 items. Always end with a <verdict> tag.\n\nUse this exact format:\n<reasoning>\nClaim 1: [claim text] → [Supported / Contradicted / Absent]\nClaim 2: [claim text] → [Supported / Contradicted / Absent]\n</reasoning>\n<verdict>Yes</verdict>',
    context: '[DOCUMENT]\n${TEXT}\n[END]\n',
  },
  pertinent: {
    template:
      '${SYSTEM_INST}\n\n[Input]\n${INPUT}[Prediction]\n${PREDICTION}\n[Judgement]\n',
    input: '${SPEAKER}: ${TEXT}\n',
    system_instruction:
      'You are a pertinence judge. Read the [Input] and the [Prediction].\n\nStep 1 — Identify what the input is asking for.\nStep 2 — List each distinct claim or piece of content in the prediction.\nStep 3 — For each, state whether it Addresses, Partially addresses, or is Off-topic relative to the input.\nStep 4 — Write your verdict inside <verdict> tags.\n\nRules:\n- Yes    if the prediction fully addresses the input with no off-topic content.\n- No     if the prediction is off-topic, incomplete, or includes unrequested content.\n- Unsure if you cannot determine pertinence from the input alone.\n\nBudget: you have 2048 tokens total. Keep your reasoning concise — group minor claims, cap at 10 items. Always end with a <verdict> tag.\n\nUse this exact format:\n<reasoning>\nWhat input asks for: [summary]\nClaim 1: [claim text] → [Addresses / Partially addresses / Off-topic]\nClaim 2: [claim text] → [Addresses / Partially addresses / Off-topic]\n</reasoning>\n<verdict>Yes</verdict>',
  },
  coherent: {
    template:
      '${SYSTEM_INST}\n\n[Input]\n${INPUT}[Prediction]\n${PREDICTION}\n[Judgement]\n',
    input: '${SPEAKER}: ${TEXT}\n',
    system_instruction:
      'You are a coherence judge. Read the [Prediction].\n\nStep 1 — List each sentence or logical unit in the prediction.\nStep 2 — For each, identify any internal contradiction, abrupt topic shift, incomplete reasoning, or grammatical breakdown.\nStep 3 — Write your verdict inside <verdict> tags.\n\nRules:\n- Yes    if the prediction reads as a logically consistent, well-formed response with no contradictions or gaps.\n- No     if the prediction contains a self-contradiction, an unexplained jump, or an incomplete thought.\n- Unsure if you cannot determine coherence from the prediction alone.\n\nBudget: you have 2048 tokens total. Keep your reasoning concise — group minor units, cap at 10 items. Always end with a <verdict> tag.\n\nUse this exact format:\n<reasoning>\nUnit 1: [sentence or clause] → [Consistent / Contradicts unit N / Incomplete / Off-track]\nUnit 2: [sentence or clause] → [Consistent / Contradicts unit N / Incomplete / Off-track]\n</reasoning>\n<verdict>Yes</verdict>',
  },
  concise: {
    template:
      '${SYSTEM_INST}\n\n[Input]\n${INPUT}[Prediction]\n${PREDICTION}\n[Judgement]\n',
    input: '${SPEAKER}: ${TEXT}\n',
    system_instruction:
      'You are a conciseness judge. Read the [Input] and the [Prediction].\n\nStep 1 — Identify the core information needed to answer the input.\nStep 2 — List each part of the prediction and classify it as Necessary, Helpful context, or Padding/repetition.\nStep 3 — Write your verdict inside <verdict> tags.\n\nRules:\n- Yes    if the prediction contains only necessary content and helpful context, with no padding or repetition.\n- No     if the prediction contains filler phrases, repeated points, or content that adds no informational value.\n- Unsure if you cannot determine whether the extra content is padding or purposeful.\n\nBudget: you have 2048 tokens total. Keep your reasoning concise — group minor parts, cap at 10 items. Always end with a <verdict> tag.\n\nUse this exact format:\n<reasoning>\nCore answer needed: [summary]\nPart 1: [text] → [Necessary / Helpful context / Padding]\nPart 2: [text] → [Necessary / Helpful context / Padding]\n</reasoning>\n<verdict>Yes</verdict>',
  },
  context_sufficient: {
    // No ${PREDICTION} — this metric judges the retrieved context against the question,
    // independent of what the generator produced. Usable in retriever-only mode too.
    template:
      '${SYSTEM_INST}\n\n[Input]\n${INPUT}[Context]\n${CONTEXT}[Judgement]\n',
    input: '${SPEAKER}: ${TEXT}\n',
    system_instruction:
      'You are a context sufficiency judge. Read the [Input] and the [Context].\n\nStep 1 — Identify what information is needed to answer the input.\nStep 2 — For each required piece of information, state whether it is Present, Partially present, or Absent from the context.\nStep 3 — Write your verdict inside <verdict> tags.\n\nRules:\n- Yes    if the context contains all the information needed to fully answer the input.\n- No     if the context is missing information that would be required to answer the input.\n- Unsure if you cannot determine sufficiency from the context alone.\n\nBudget: you have 2048 tokens total. Keep your reasoning concise — group minor items, cap at 10 items. Always end with a <verdict> tag.\n\nUse this exact format:\n<reasoning>\nInformation needed: [summary]\nRequired item 1: [description] → [Present / Partially present / Absent]\nRequired item 2: [description] → [Present / Partially present / Absent]\n</reasoning>\n<verdict>Yes</verdict>',
    context: '[DOCUMENT]\n${TEXT}\n[END]\n',
  },
};

function ConfigureMetric({
  configuration,
  metric,
  onSave,
  onClose,
}: {
  configuration: SystemConfiguration;
  metric: Metric;
  onSave: (updated: Metric) => void;
  onClose: () => void;
}) {
  const { createNotification } = useNotification();

  const [step, setStep] = useState<'connect' | 'configure'>('connect');
  const [selectedConnector, setSelectedConnector] = useState<GeneratorConfig>(
    configuration.generators[0],
  );
  const [connecting, setConnecting] = useState<boolean>(false);
  const [models, setModels] = useState<ActiveGenerator[]>([]);
  const [selectedGenerator, setSelectedGenerator] = useState<
    ActiveGenerator | undefined
  >(undefined);

  // Returns true when required client credential fields are missing.
  function isConnectIncomplete(): boolean {
    if (selectedConnector.credentials.provider !== 'client') return false;
    if (isEmpty(selectedConnector.endpoint)) return true;
    // No-auth connectors need only an endpoint; no key/project to validate.
    if (selectedConnector.authentication === 'none') return false;
    if (isEmpty(selectedConnector.credentials.api_key)) return true;
    if (
      selectedConnector.name === 'WatsonX.AI' &&
      isEmpty(selectedConnector.credentials.project_id)
    )
      return true;
    return false;
  }

  async function connect() {
    setConnecting(true);

    // Store credentials in session before calling /api/models if client-managed.
    // No-auth connectors skip the store (nothing to store) — avoids the cookie race.
    if (
      selectedConnector.credentials.provider === 'client' &&
      selectedConnector.authentication !== 'none'
    ) {
      const { storeConnectorCredentials } =
        await import('@/src/common/utilities/credentials');
      await storeConnectorCredentials(undefined, {
        [selectedConnector.name]: {
          endpoint: selectedConnector.endpoint,
          api_key: selectedConnector.credentials.api_key,
          project_id: selectedConnector.credentials.project_id,
        },
      });
    }

    const params = new URLSearchParams({
      connector_name: selectedConnector.name,
      provider: selectedConnector.credentials.provider,
    });
    // No-auth connectors may override the config endpoint (SSRF-guarded server-side).
    if (
      selectedConnector.authentication === 'none' &&
      selectedConnector.endpoint
    ) {
      params.set('endpoint', selectedConnector.endpoint);
    }

    let fetched: ActiveGenerator[];
    try {
      const res = await fetch(`/api/models?${params.toString()}`);
      if (!res.ok) {
        createNotification({
          kind: 'error',
          title: 'Failed to fetch models.',
          subtitle: 'Please verify your credentials and try again.',
          timeout: 10000,
        });
        setConnecting(false);
        return;
      }
      const data = await res.json();
      if (!data || data.length === 0) {
        createNotification({
          kind: 'warning',
          title: 'No models available.',
          subtitle: 'The connector returned an empty model list.',
          timeout: 10000,
        });
        setConnecting(false);
        return;
      }

      // LLM judge metrics use completion mode; fall back to completion when the
      // connector's supported_modes doesn't list it explicitly.
      const supportedModes = selectedConnector.settings.supported_modes;
      const mode: 'completion' | 'chat_completion' =
        supportedModes && !supportedModes.includes('completion')
          ? 'chat_completion'
          : 'completion';

      const metricPrompt = METRIC_PROMPTS[metric.name];

      fetched = data.map((m: ActiveGenerator) => ({
        ...m,
        mode,
        // Hard-code 2048 output tokens for judge models so multi-claim CoT
        // reasoning doesn't get truncated before the <verdict> tag is written.
        // The connector-level default (512) is not enough for long predictions.
        settings: {
          prompt: metricPrompt,
          parameters: { max_new_tokens: 2048 },
        },
        connector: selectedConnector,
      }));
    } catch {
      createNotification({
        kind: 'error',
        title: 'Failed to fetch models.',
        subtitle: 'An unexpected error occurred.',
        timeout: 10000,
      });
      setConnecting(false);
      return;
    }

    setModels(fetched);
    setSelectedGenerator(fetched[0]);
    setConnecting(false);
    setStep('configure');
  }

  // Build a credentials-free GeneratorSnapshot from the selected ActiveGenerator
  // so the Metric type contract is satisfied (Metric.generator: GeneratorSnapshot).
  function buildSnapshot(gen: ActiveGenerator): GeneratorSnapshot {
    return {
      id: gen.id,
      name: gen.name,
      mode: gen.mode,
      settings: gen.settings,
      connector: { name: gen.connector.name, endpoint: gen.connector.endpoint },
    };
  }

  const metricPrompt = METRIC_PROMPTS[metric.name] as
    | TextCompletionPromptSettings
    | undefined;

  return (
    <Modal
      open={true}
      size="lg"
      className={classes.configureMetricModal}
      modalLabel={`Configure ${metric.displayName ?? metric.name} metric`}
      primaryButtonText={
        step === 'connect' ? (connecting ? 'Connecting…' : 'Connect') : 'Save'
      }
      secondaryButtonText={step === 'connect' ? 'Cancel' : 'Back'}
      primaryButtonDisabled={
        step === 'connect'
          ? connecting || isConnectIncomplete()
          : selectedGenerator === undefined
      }
      onRequestSubmit={() => {
        if (step === 'connect') {
          connect();
        } else if (selectedGenerator) {
          onSave({
            ...metric,
            generator: buildSnapshot(selectedGenerator),
            disabled: false,
          });
          onClose();
        }
      }}
      onRequestClose={() => {
        if (step === 'configure') {
          setStep('connect');
          setModels([]);
          setSelectedGenerator(undefined);
        } else {
          onClose();
        }
      }}
    >
      <div className={classes.configureMetricContainer}>
        {step === 'connect' ? (
          <>
            <h4>Connectors</h4>
            <div className={classes.connectors}>
              {configuration.generators.map((connector) => (
                <RadioTile
                  key={`formatSelector__generator--${connector.name}`}
                  id={`formatSelector__generator--${connector.name}`}
                  value={`${connector.name}`}
                  checked={selectedConnector.name === connector.name}
                  onChange={() => setSelectedConnector(connector)}
                  disabled={connector.disabled}
                >
                  <div className={classes.connector}>
                    <span className={classes.connectorTitle}>
                      {connector.name}
                    </span>
                    {connector.description ? (
                      <span className={classes.connectorDescription}>
                        {truncate(connector.description, 200)}
                      </span>
                    ) : null}
                    {connector.tags ? (
                      <div className={classes.connectorTags}>
                        {connector.tags.map((tag) => (
                          <ConnectorTag
                            key={`generator__tag--${tag}`}
                            tag={tag}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </RadioTile>
              ))}
            </div>
            {selectedConnector.credentials.provider === 'client' ? (
              <>
                <TextInput
                  id="connector__endpoint--input"
                  labelText="Endpoint"
                  value={selectedConnector.endpoint ?? ''}
                  invalid={isEmpty(selectedConnector.endpoint)}
                  invalidText="Endpoint must be specified."
                  onChange={(event) => {
                    setSelectedConnector({
                      ...selectedConnector,
                      endpoint: event.target.value.trim(),
                    });
                  }}
                />
                {/* No-auth connectors (e.g. Ollama) need only an endpoint. */}
                {selectedConnector.authentication !== 'none' ? (
                  <PasswordInput
                    id="retriever__login-api-key--input"
                    labelText="API Key"
                    value={selectedConnector.credentials.api_key ?? ''}
                    showPasswordLabel="Show API key"
                    hidePasswordLabel="Hide API key"
                    invalid={isEmpty(selectedConnector.credentials.api_key)}
                    invalidText="API Key must be specified."
                    onChange={(event) => {
                      setSelectedConnector({
                        ...selectedConnector,
                        credentials: {
                          ...selectedConnector.credentials,
                          api_key: event.target.value.trim(),
                        },
                      });
                    }}
                  />
                ) : null}
                {selectedConnector.name === 'WatsonX.AI' ? (
                  // @ts-ignore
                  <TextInput
                    id="generator__project-id-input"
                    labelText="Project ID"
                    invalid={isEmpty(selectedConnector.credentials.project_id)}
                    invalidText="Project ID must be specified."
                    onChange={(event) => {
                      setSelectedConnector({
                        ...selectedConnector,
                        credentials: {
                          ...selectedConnector.credentials,
                          project_id: event.target.value.trim(),
                        },
                      });
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <div className={classes.configureStep}>
            <Select
              id="metric__model-select"
              labelText="Model"
              value={selectedGenerator?.id ?? ''}
              onChange={(event) => {
                const model = models.find((m) => m.id === event.target.value);
                if (model && selectedGenerator) {
                  // Preserve prompt settings chosen for this metric when the
                  // researcher switches models — the prompt belongs to the metric,
                  // not the model.
                  setSelectedGenerator({
                    ...model,
                    settings: selectedGenerator.settings,
                  });
                }
              }}
            >
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} text={m.name} />
              ))}
            </Select>
            {metricPrompt ? (
              <div className={classes.promptSection}>
                <span className={classes.promptSectionLabel}>
                  Judge prompt (read-only)
                </span>
                <div className={classes.promptField}>
                  <span className={classes.promptSectionLabel}>Template</span>
                  <TextArea
                    id="metric__prompt-template"
                    labelText=""
                    value={metricPrompt.template}
                    readOnly
                    rows={4}
                  />
                </div>
                {metricPrompt.system_instruction ? (
                  <div className={classes.promptField}>
                    <span className={classes.promptSectionLabel}>
                      System instruction
                    </span>
                    <TextArea
                      id="metric__system-instruction"
                      labelText=""
                      value={metricPrompt.system_instruction}
                      readOnly
                      rows={3}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}

// --- Main component ---

export default function MetricsSelector({
  systemConfiguration,
  componentToTest,
  metrics,
  onUpdate,
  onPrevious,
  onNext,
}: Props) {
  const [searchString, setSearchString] = useState<string>('');
  const [configuringMetric, setConfiguringMetric] = useState<
    Metric | undefined
  >(undefined);

  const { createNotification } = useNotification();

  useEffect(() => {
    if (metrics.length === 0) {
      document.getElementById('searchMetric__input')?.focus();
    }
  }, [metrics]);

  // Merge catalog with any already-configured metrics from props. The catalog
  // entry is always used as the base (it owns description, tags, range, etc.).
  // Only the runtime fields that the researcher sets — generator and disabled —
  // are overlaid from the configured entry, so a pre-populated metric with a
  // partial definition never hides the catalog description.
  const catalogForComponent = metricsForComponent(componentToTest).map(
    (catalogEntry) => {
      const configured = metrics.find((m) => m.name === catalogEntry.name);
      if (!configured) return catalogEntry;
      return {
        ...catalogEntry,
        ...(configured.generator !== undefined && {
          generator: configured.generator,
        }),
        ...(configured.disabled !== undefined && {
          disabled: configured.disabled,
        }),
      };
    },
  );

  // Search uses .includes so "F1" matches "F1 (word-level)", etc.
  const visibleMetrics = searchString
    ? catalogForComponent.filter((m) =>
        m.displayName?.toLowerCase().includes(searchString.toLowerCase()),
      )
    : catalogForComponent;

  return (
    <div className={classes.page}>
      {configuringMetric ? (
        <ConfigureMetric
          configuration={systemConfiguration}
          metric={configuringMetric}
          onSave={(updatedMetric) => {
            // Replace in-place if already selected (keeps selection active with
            // new generator config); append if not yet selected.
            const alreadySelected = metrics.some(
              (m) => m.name === updatedMetric.name,
            );
            onUpdate(
              alreadySelected
                ? metrics.map((m) =>
                    m.name === updatedMetric.name ? updatedMetric : m,
                  )
                : [...metrics, updatedMetric],
            );
          }}
          onClose={() => setConfiguringMetric(undefined)}
        />
      ) : null}
      <div className={classes.header}>
        <h2 className={classes.title}>Choose your metrics</h2>
        <div className={classes.navigationButtons}>
          <Button kind="secondary" renderIcon={ArrowLeft} onClick={onPrevious}>
            Previous
          </Button>
          <Button
            renderIcon={ArrowRight}
            disabled={isEmpty(metrics) || onNext === undefined}
            onClick={() => onNext?.()}
          >
            Next
          </Button>
        </div>
      </div>
      <div className={classes.container}>
        <ModelAlt size={56} className={classes.categlogIcon} />
        <Search
          id="searchMetric__input"
          size="lg"
          placeholder="Find Metrics"
          labelText="Search"
          closeButtonLabelText="Clear search input"
          onChange={(event) => setSearchString(event.target.value)}
          className={classes.catelogSearchBar}
        />

        <div className={classes.catelog}>
          {visibleMetrics.map((metric) => (
            <SelectableTile
              key={`metric__${metric.name}`}
              id={`metric__${metric.name}`}
              selected={metrics.map((e) => e.name).includes(metric.name)}
              onClick={() => {
                // LLM metrics without a configured generator cannot be selected —
                // prompt the researcher to configure first.
                if (metric.kind === 'llm' && !metric.generator) {
                  createNotification({
                    kind: 'error',
                    title: 'Failed to select.',
                    subtitle:
                      'You must configure this metric before selecting it.',
                    timeout: 10000,
                  });
                } else {
                  onUpdate(
                    metrics.map((e) => e.name).includes(metric.name)
                      ? metrics.filter((e) => e.name !== metric.name)
                      : [...metrics, metric],
                  );
                }
              }}
            >
              <div className={classes.catelogItem}>
                <span className={classes.catelogItemTitle}>
                  {metric.displayName ?? metric.name}
                </span>
                {metric.description ? (
                  <span className={classes.catelogItemDescription}>
                    {truncate(metric.description, 200)}
                  </span>
                ) : null}
                {metric.tags ? (
                  <div className={classes.catelogItemTags}>
                    {metric.tags.map((tag) => (
                      <Tag key={`metrics__${metric.name}--${tag}`}>{tag}</Tag>
                    ))}
                  </div>
                ) : null}
                {metric.kind === 'llm' ? (
                  <div className={classes.catelogItemFooter}>
                    <span className={classes.catelogItemHelper}>
                      {metric.generator
                        ? 'Configured'
                        : 'Requires configuration'}
                    </span>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Settings}
                      iconDescription="Configure metric"
                      hasIconOnly
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfiguringMetric(metric);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </SelectableTile>
          ))}
        </div>
      </div>
    </div>
  );
}

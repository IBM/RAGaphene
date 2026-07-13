/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty, cloneDeep } from 'lodash';
import cx from 'classnames';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@carbon/react';
import { ArrowLeft, Chemistry } from '@carbon/icons-react';

import {
  DatasetTask,
  GeneratorSnapshot,
  Metric,
  Pipeline,
  Prediction,
  SystemConfiguration,
  Utterance,
  Document,
  ActiveGenerator,
  Job,
  Message,
  TextCompletionPromptSettings,
} from '@/types/custom';
import { retrieve } from '@/src/common/utilities/search';
import ExperimentTile from '@/src/components/experiment/ExperimentTile';
import JobsTable from '@/src/components/experiment/JobsTable';

import classes from './Runner.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  componentToTest: string;
  tasks: DatasetTask[];
  pipelines: Pipeline[];
  metrics: Metric[];
  systemConfiguration: SystemConfiguration;
  onPrevious: () => void;
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
function create_input(
  utterances: Utterance[],
  template: string,
  skip: boolean = false,
): string {
  // Step 1: Initialize necessary variables
  let conversation = '';

  // Step 2: Iterate over messages to form conversation
  utterances.forEach((message, messageIdx) => {
    // Step 1.a: Copy over input template
    let text: string = template;

    // Step 2.b: If first message
    if (messageIdx === 0) {
      // Step 2.b.i: Replace ${SPEAKER} variable
      text = text.replaceAll(
        '${SPEAKER}',
        skip ? '' : message.speaker === 'user' ? 'user' : 'assistant',
      );

      // Step 2.b.ii: Replace ${TEXT} variable with message's text
      text = text.replaceAll('${TEXT}', message.text.trim());

      // Step 2.b.iii: Add to conversation
      conversation += text;
    } else {
      // Step 2.c.i: Replace ${SPEAKER} variable
      text = text.replaceAll(
        '${SPEAKER}',
        message.speaker === 'user' ? 'user' : 'assistant',
      );

      // Step 2.c.ii: Replace ${TEXT} variable with message's text
      text = text.replaceAll('${TEXT}', message.text.trim());

      // Step 2.c.iii: Add to conversation
      conversation += text;
    }
  });

  // Step 3: Return
  return conversation.endsWith('\n') ? conversation.slice(0, -1) : conversation;
}

function create_context(
  documents: Document[] | undefined,
  template: string,
): string {
  let context = '';
  documents?.forEach((document) => {
    context += template.replaceAll('${TEXT}', document.text.trim());
  });
  return context.endsWith('\n') ? context.slice(0, -1) : context;
}

// Builds the full judge prompt by substituting the four template variables.
// Reuses create_input / create_context so substitution logic is not duplicated.
function fillJudgePrompt(
  prompt: TextCompletionPromptSettings,
  utterances: Utterance[],
  prediction: string,
  documents: Document[] | undefined,
): string {
  const context = create_context(
    documents,
    prompt.context ?? '[DOCUMENT]\n${TEXT}\n[END]\n',
  );
  const input = create_input(utterances, prompt.input, false);

  let filled = prompt.template;
  filled = prompt.system_instruction
    ? filled.replaceAll('${SYSTEM_INST}', prompt.system_instruction)
    : filled;
  filled = filled.replaceAll('${EXAMPLES}', '');
  filled = filled.replaceAll('${CONTEXT}', context);
  filled = filled.replaceAll('${INPUT}', input);
  filled = filled.replaceAll('${PREDICTION}', prediction);
  return filled;
}

// Maps raw LLM output to a categorical value string from the metric's values array.
// Returns 'error' if the output does not match any known scoreable value
// (hallucination, refusal, unparseable output, etc.) so that InspectorRAGet
// always receives a value that is declared in the metric's values catalog.
//
// Extraction order:
//   1. <verdict>…</verdict> tag — preferred; models using the CoT prompt write
//      their reasoning in <reasoning> and the final word in <verdict>.
//   2. First non-empty line — fallback for models that ignore the tag structure
//      and write the verdict word directly (old prompt behaviour).
function parseJudgement(raw: string, metric: Metric): string {
  if (!metric.values) return 'error';

  // Try to extract content from <verdict> tags first.
  const tagMatch = raw.match(/<verdict>(.*?)<\/verdict>/is);
  const candidate = tagMatch
    ? tagMatch[1].trim()
    : (raw.split('\n').find((l) => l.trim().length > 0) ?? raw).trim();

  const normalized = candidate.toLowerCase();
  const match = metric.values.find(
    (v) => String(v.value).toLowerCase() === normalized && v.value !== 'error',
  );
  if (!match) {
    console.warn(
      `[judge] parse failure — metric="${metric.name}" raw="${raw}" (extracted="${candidate}")`,
    );
  }
  return match ? String(match.value) : 'error';
}

// Calls /api/messages with the judge model and returns the parsed categorical value
// plus the wall-clock ms the call took. Returns 'error' on any failure — never throws.
// The duration is tracked separately from the generator duration so the UI can show
// users how much of the total elapsed time was spent on LLM judging vs. generation.
async function judge(
  metric: Metric,
  systemConfiguration: SystemConfiguration,
  utterances: Utterance[],
  prediction: string,
  documents: Document[] | undefined,
): Promise<{ verdict: string; durationMs: number }> {
  const judgeStart = Date.now();

  const snapshot = metric.generator as GeneratorSnapshot | undefined;
  if (!snapshot) {
    console.warn(
      `[judge] no snapshot — metric="${metric.name}" (metric not configured)`,
    );
    return { verdict: 'error', durationMs: Date.now() - judgeStart };
  }

  // Resolve provider from system config — ConnectorRef does not carry it.
  const connectorConfig = systemConfiguration.generators.find(
    (g) => g.name === snapshot.connector.name,
  );
  if (!connectorConfig) {
    console.warn(
      `[judge] connector not found — metric="${metric.name}" connector="${snapshot.connector.name}" (removed from system config?)`,
    );
    return { verdict: 'error', durationMs: Date.now() - judgeStart };
  }

  const prompt = snapshot.settings.prompt as TextCompletionPromptSettings;
  const filledPrompt = fillJudgePrompt(
    prompt,
    utterances,
    prediction,
    documents,
  );

  // For client connectors the credentials are already in the NextAuth session cookie
  // from the ConfigureMetric connect step. Calling storeConnectorCredentials with the
  // (possibly empty) fields from connectorConfig is harmless — the existing cookie value
  // takes precedence. This mirrors the same pattern in generate().
  // No-auth connectors have no cookie to store and resolve from config server-side.
  if (
    connectorConfig.credentials.provider === 'client' &&
    connectorConfig.authentication !== 'none'
  ) {
    const { storeConnectorCredentials } =
      await import('@/src/common/utilities/credentials');
    await storeConnectorCredentials(undefined, {
      [snapshot.connector.name]: {
        endpoint: snapshot.connector.endpoint,
        api_key: connectorConfig.credentials.api_key,
        project_id: connectorConfig.credentials.project_id,
      },
    });
  }

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connector_name: snapshot.connector.name,
        provider: connectorConfig.credentials.provider,
        model_id: snapshot.id,
        mode: 'completion',
        input: filledPrompt,
        parameters: snapshot.settings.parameters,
      }),
      // 3 min — judge prompts with 2048 max_new_tokens can take significantly
      // longer than standard generation calls.
      signal: AbortSignal.timeout(180000),
    });

    if (!res.ok) {
      console.warn(
        `[judge] generation failure — metric="${metric.name}" model="${snapshot.id}" HTTP ${res.status}`,
      );
      return { verdict: 'error', durationMs: Date.now() - judgeStart };
    }

    const data = await res.json();
    if (!data?.results?.[0]?.generated_text) {
      console.warn(
        `[judge] generation failure — metric="${metric.name}" model="${snapshot.id}" response missing generated_text`,
        data,
      );
      return { verdict: 'error', durationMs: Date.now() - judgeStart };
    }

    const raw: string = data.results[0].generated_text.trim();
    return {
      verdict: parseJudgement(raw, metric),
      durationMs: Date.now() - judgeStart,
    };
  } catch (err) {
    console.warn(
      `[judge] generation failure — metric="${metric.name}" model="${snapshot.id}"`,
      err,
    );
    return { verdict: 'error', durationMs: Date.now() - judgeStart };
  }
}

export async function generate(
  generator: ActiveGenerator,
  utterances: Utterance[],
  documents: Document[] | undefined,
): Promise<string> {
  // Step 1: Form context from documents
  const context = create_context(
    documents,
    (generator.settings.prompt as TextCompletionPromptSettings).context ??
      '[DOCUMENT]\n${TEXT}\n[END]\n',
  );

  // Step 2: Create input
  const input = create_input(
    utterances,
    (generator.settings.prompt as TextCompletionPromptSettings).input,
    false,
  );

  // Step 3: Create prompt
  // Step 3.a: Copy prompt template
  let prompt = (generator.settings.prompt as TextCompletionPromptSettings)
    .template;

  // Step 3.b: Replace ${SYSTEM_INST} variable
  prompt = generator.settings.prompt.system_instruction
    ? prompt.replaceAll(
        '${SYSTEM_INST}',
        generator.settings.prompt.system_instruction,
      )
    : prompt;

  // Step 3.c: Replace ${CONTEXT} variable
  prompt = prompt.replaceAll('${CONTEXT}', context);

  // Step 3.d: Replace ${INPUT} variable
  prompt = prompt.replaceAll('${INPUT}', input);

  // Step 4: Generate
  try {
    // Store credentials in session if client-managed. No-auth connectors skip the
    // store (nothing to store) and resolve from config server-side.
    if (
      generator.connector.credentials.provider === 'client' &&
      generator.connector.authentication !== 'none'
    ) {
      const { storeConnectorCredentials } =
        await import('@/src/common/utilities/credentials');
      await storeConnectorCredentials(undefined, {
        [generator.connector.name]: {
          endpoint: generator.connector.endpoint,
          api_key: generator.connector.credentials.api_key,
          project_id: generator.connector.credentials.project_id,
        },
      });
    }

    // Step 4.a: Invoke API call
    const generate_request = await fetch(`/api/messages`, {
      method: 'POST',
      body: JSON.stringify({
        connector_name: generator.connector.name,
        provider: generator.connector.credentials.provider,
        model_id: generator.id,
        mode: 'completion',
        input: prompt,
        parameters: generator.settings.parameters,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(90000),
    });

    // Step 4.b: Wait on response
    const response = await generate_request.json();

    // Step 4.c: Process response and set output
    if (
      response.results &&
      Array.isArray(response.results) &&
      !isEmpty(response.results)
    ) {
      return response.results[0].generated_text.replace(/^\s/gm, '');
    } else {
      return 'Failed to generate response';
    }
  } catch (exception: any) {
    return exception.name === 'TimeoutError'
      ? 'Failed to generate response due to timeout.'
      : 'Failed to generate response due to unknown exception.';
  }
}

export async function chat(
  generator: ActiveGenerator,
  messages: Message[],
  documents: Document[] | undefined,
): Promise<string> {
  // Generate — send raw app data; connector builds wire messages server-side
  try {
    // Store credentials in session if client-managed. No-auth connectors skip the
    // store (nothing to store) and resolve from config server-side.
    if (
      generator.connector.credentials.provider === 'client' &&
      generator.connector.authentication !== 'none'
    ) {
      const { storeConnectorCredentials } =
        await import('@/src/common/utilities/credentials');
      await storeConnectorCredentials(undefined, {
        [generator.connector.name]: {
          endpoint: generator.connector.endpoint,
          api_key: generator.connector.credentials.api_key,
          project_id: generator.connector.credentials.project_id,
        },
      });
    }

    // Invoke API call
    const generate_request = await fetch(`/api/messages`, {
      method: 'POST',
      body: JSON.stringify({
        connector_name: generator.connector.name,
        provider: generator.connector.credentials.provider,
        model_id: generator.id,
        mode: 'chat_completion',
        conversation: messages,
        documents: documents,
        system_instruction: generator.settings.prompt.system_instruction,
        context_template: generator.settings.prompt.context,
        parameters: generator.settings.parameters,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    // Wait on response
    const response = await generate_request.json();

    // Process response and set output
    if (
      response.results &&
      Array.isArray(response.results) &&
      !isEmpty(response.results)
    ) {
      return response.results[0].generated_text.replace(/^\s/gm, '');
    } else {
      return 'Failed to generate response';
    }
  } catch (exception: any) {
    return exception.name === 'TimeoutError'
      ? 'Failed to generate response due to timeout.'
      : 'Failed to generate response due to unknown exception.';
  }
}

async function launch(
  componentToTest: string,
  task: DatasetTask,
  pipeline: Pipeline,
  metrics: Metric[],
  systemConfiguration: SystemConfiguration,
): Promise<Prediction> {
  if (componentToTest === 'retriever') {
    // Step 1: Intialize variables
    const startTime = Date.now();

    // Step 2: Retrieve relevant documents
    // Step 2.a: Create subset utterances as per retriever history parameter
    const subsetUtterances = pipeline.retriever
      ? pipeline.retriever.settings.max_utterances === -1
        ? task.input
        : task.input.slice(
            Math.max(
              task.input.length - pipeline.retriever.settings.max_utterances,
              0,
            ),
          )
      : task.input;

    let retrieverQueryText = '';
    subsetUtterances.forEach((utterance) => {
      retrieverQueryText += `${utterance.speaker === 'agent' ? '|assistant|:' : '|user|:'} ${utterance.text}\n`;
    });

    // Step 2.b: Retrieve
    const [documents, retrieveExceptions] = pipeline.retriever
      ? await retrieve(pipeline.retriever, retrieverQueryText.slice(0, -1))
      : [
          [],
          [
            {
              title: 'Missing retriever',
              subtitle: 'Current and future responses may be impacted.',
              kind: 'warning',
              timeout: 8000,
            },
          ],
        ];

    // Step 3: Evaluate
    const existing_contexts = new Set(
      task.contexts.map((context) => context.document_id),
    );
    const retrieved_contexts = new Set(
      documents.map((document) => document.document_id),
    );
    const evaluations = {
      recall: {
        value: parseFloat(
          (
            (new Set(
              [...existing_contexts].filter((x) => retrieved_contexts.has(x)),
            ).size /
              existing_contexts.size) *
            100
          ).toFixed(2),
        ),
      },
    };

    // Step 4: Return
    const endTime = Date.now();
    return {
      pipelineName: pipeline.name,
      contexts: documents,
      evaluations: evaluations,
      duration: { total: endTime - startTime, retriever: endTime - startTime },
    };
  } else if (componentToTest === 'generator') {
    // Step 1: Intialize variables
    const startTime = Date.now();

    // Step 2: Generate
    const predictedText = pipeline.generator
      ? pipeline.generator.mode === 'completion'
        ? await generate(pipeline.generator, task.input, task.contexts)
        : await chat(pipeline.generator, task.input, task.contexts)
      : 'Failed to generate response due to missing generator';

    const generatorEndTime = Date.now();

    // Fill LLM metric values right after generation, before handing off to Python.
    // Algorithmic metric values stay null and are filled by the Python evaluator batch.
    const llmEvaluations: Record<string, { value: string }> = {};
    let evaluationsDuration = 0;
    for (const metric of metrics.filter((m) => m.kind === 'llm')) {
      const { verdict, durationMs } = await judge(
        metric,
        systemConfiguration,
        task.input,
        predictedText,
        task.contexts,
      );
      llmEvaluations[metric.name] = { value: verdict };
      evaluationsDuration += durationMs;
    }

    const evaluationsObj = {
      ...Object.fromEntries(metrics.map((m) => [m.name, { value: null }])),
      ...llmEvaluations,
    };

    const endTime = Date.now();
    return {
      pipelineName: pipeline.name,
      text: predictedText,
      evaluations: evaluationsObj,
      duration: {
        total: endTime - startTime,
        generator: generatorEndTime - startTime,
        ...(evaluationsDuration > 0 && { evaluations: evaluationsDuration }),
      },
    };
  } else {
    // Step 1: Intialize variables
    const startTime = Date.now();

    // Step 2: Retrieve relevant documents
    // Step 2.a: Create subset utterances as per retriever history parameter
    const subsetUtterances = pipeline.retriever
      ? pipeline.retriever.settings.max_utterances === -1
        ? task.input
        : task.input.slice(
            Math.max(
              task.input.length - pipeline.retriever.settings.max_utterances,
              0,
            ),
          )
      : task.input;

    let retrieverQueryText = '';
    subsetUtterances.forEach((utterance) => {
      retrieverQueryText += `${utterance.speaker === 'agent' ? '|assistant|:' : '|user|:'} ${utterance.text}\n`;
    });

    // Step 2.b: Retrieve
    const [documents, retrieveExceptions] = pipeline.retriever
      ? await retrieve(
          { ...pipeline.retriever, collection: { name: task.collection } },
          retrieverQueryText.slice(0, -1),
        )
      : [
          task.contexts,
          [
            {
              title: 'Missing retriever',
              subtitle: 'Current and future responses may be impacted.',
              kind: 'warning',
              timeout: 8000,
            },
          ],
        ];
    const retrieverEndTime = Date.now();

    // Step 2: Generate
    const predictedText = pipeline.generator
      ? await generate(pipeline.generator, task.input, documents)
      : 'Failed to generate response due to missing generator';

    const generatorEndTime = Date.now();

    // Fill LLM metric values right after generation, before handing off to Python.
    // Algorithmic metric values stay null and are filled by the Python evaluator batch.
    const llmEvaluations: Record<string, { value: string }> = {};
    let evaluationsDuration = 0;
    for (const metric of metrics.filter((m) => m.kind === 'llm')) {
      const { verdict, durationMs } = await judge(
        metric,
        systemConfiguration,
        task.input,
        predictedText,
        documents,
      );
      llmEvaluations[metric.name] = { value: verdict };
      evaluationsDuration += durationMs;
    }

    const evaluationsObj = {
      ...Object.fromEntries(metrics.map((m) => [m.name, { value: null }])),
      ...llmEvaluations,
    };

    const endTime = Date.now();
    return {
      pipelineName: pipeline.name,
      text: predictedText,
      contexts: documents,
      evaluations: evaluationsObj,
      duration: {
        total: endTime - startTime,
        retriever: retrieverEndTime - startTime,
        generator: generatorEndTime - retrieverEndTime,
        ...(evaluationsDuration > 0 && { evaluations: evaluationsDuration }),
      },
    };
  }
}

async function run(
  componentToTest: string,
  jobs: Job[],
  pipelines: Pipeline[],
  metrics: Metric[],
  systemConfiguration: SystemConfiguration,
  onUpdate: (updater: (prev: Job[]) => Job[]) => void,
  signal: AbortSignal,
) {
  // Process jobs one at a time so state updates are strictly ordered and there are
  // no races between the status-update write and the predictions write for each job.
  // Predictions within a single job still run in parallel across pipelines.
  for (const [jobIdx, job] of jobs.entries()) {
    if (signal.aborted) {
      // Mark all remaining unstarted jobs as cancelled in one pass.
      onUpdate((prevJobs) =>
        prevJobs.map((j) =>
          j.status === 'scheduled' ? { ...j, status: 'cancelled' } : j,
        ),
      );
      break;
    }

    onUpdate((prevJobs) =>
      prevJobs.toSpliced(jobIdx, 1, {
        ...job,
        status: componentToTest === 'retriever' ? 'retrieving' : 'generating',
        predictions: [],
      }),
    );

    const predictions = await Promise.all(
      pipelines.map((pipeline) =>
        launch(
          componentToTest,
          job.task,
          pipeline,
          metrics,
          systemConfiguration,
        ),
      ),
    );

    if (signal.aborted) {
      // Job finished but Stop was hit while it was in-flight — mark it cancelled
      // rather than advancing it to 'evaluating' (which would re-trigger the eval effect).
      onUpdate((prevJobs) =>
        prevJobs.map((j) =>
          j.status === 'retrieving' ||
          j.status === 'generating' ||
          j.status === 'scheduled'
            ? { ...j, status: 'cancelled' }
            : j,
        ),
      );
      break;
    }

    onUpdate((prevJobs) =>
      prevJobs.toSpliced(jobIdx, 1, {
        ...job,
        predictions,
        status: 'evaluating',
      }),
    );
  }
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Runner({
  componentToTest,
  tasks,
  pipelines,
  metrics,
  systemConfiguration,
  onPrevious,
}: Props) {
  // Step 1: Initialize state and necessary variables
  // Only run tasks the researcher explicitly included in the dataset stage.
  const filteredTasks = tasks.filter((t) => t['is_included'] === 1);
  const [running, setRunning] = useState<boolean>(false);
  // Latches to true once the first run starts; keeps the banner visible after the run ends.
  const [hasRun, setHasRun] = useState<boolean>(false);
  const [jobs, setJobs] = useState<Job[]>(
    filteredTasks.map((task) => {
      return { task: task, status: 'scheduled', predictions: [] };
    }),
  );
  const time = Math.floor(
    filteredTasks.length * pipelines.length * metrics.length * 0.5,
  );
  const [evaluationID, setEvaluationID] = useState<string>();
  const [timer, setTimer] = useState<number>(time);
  const [evalProgress, setEvalProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  // useRef so the cleanup effect always sees the current interval without stale closures
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // AbortController for the in-flight run() loop — replaced on each new run
  const abortRef = useRef<AbortController>(new AbortController());
  // Timestamp when the Python evaluation batch was dispatched — used to compute
  // Python wall time and add it to each job's evaluations duration bucket.
  const evalBatchStartRef = useRef<number>(0);

  // --- Effects ---

  useEffect(() => {
    document.getElementById('experiment_run--btn')?.focus();
  }, []);

  // Clear the polling interval on unmount to avoid calling setJobs on an unmounted component.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // When all jobs reach 'evaluating', kick off the Python evaluation batch.
  useEffect(() => {
    if (
      running &&
      jobs.filter((job) => job.status === 'evaluating').length === jobs.length
    ) {
      async function evaluate() {
        evalBatchStartRef.current = Date.now();
        await fetch('/api/evaluations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // LLM metrics are evaluated inline in launch() — exclude them here so the
            // Python evaluator (which has no handler for them) doesn't clobber the values.
            metrics: metrics.filter((m) => m.kind !== 'llm').map((m) => m.name),
            pipelines: pipelines.map((pipeline) => pipeline.name),
            tasks: jobs.map((job) => {
              return {
                task_id: job.task.task_id,
                ...Object.fromEntries(
                  job.predictions.map((prediction) => [
                    prediction.pipelineName,
                    {
                      predictions: [prediction.text],
                      targets: job.task.targets.map((target) => target.text),
                    },
                  ]),
                ),
              };
            }),
          }),
        }).then(async (response) => {
          const data = await response.json();
          setEvaluationID(data['evaluationID']);

          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimer(time);
          intervalRef.current = setInterval(() => setTimer((t) => t - 1), 1000);
        });
      }

      evaluate();
    }
  }, [running, jobs]);

  // Poll the evaluation result once per timer tick.
  useEffect(() => {
    if (timer < 1) {
      // evaluationID is set asynchronously — skip the tick if it hasn't landed yet.
      if (!evaluationID) {
        setTimer(time);
        return;
      }

      fetch(`/api/evaluations?id=${evaluationID}`).then(async (response) => {
        if (response.status === 200) {
          const evaluations = await response.json();

          if (evaluations.status === 'running') {
            // Evaluation is still in progress — update the progress counter and
            // wait for the next tick rather than trying to read tasks (not present yet).
            setEvalProgress({
              completed: evaluations.completed,
              total: evaluations.total,
            });
            return;
          }

          // Final results arrived — clear the progress counter.
          setEvalProgress(null);

          // Python batch wall time, divided evenly across jobs. Each job's
          // evaluations duration already holds the LLM judge time from launch();
          // this adds the algorithmic evaluator's share on top.
          const pythonMs = Date.now() - evalBatchStartRef.current;
          const jobCount = jobs.length || 1;
          const pythonMsPerJob = Math.round(pythonMs / jobCount);

          // Use a functional updater so we operate on the latest jobs array, not a stale closure.
          if (evaluations.tasks) {
            setJobs((prevJobs) => {
              let next = prevJobs;
              evaluations.tasks.forEach((task) => {
                const jobIdx = next.findIndex(
                  (j) => j.task.task_id === task.task_id,
                );
                if (jobIdx === -1) return;
                const updatedJob = cloneDeep(next[jobIdx]);
                updatedJob.predictions.forEach((prediction) => {
                  Object.keys(prediction.evaluations).forEach((metricName) => {
                    const pythonResult =
                      task[prediction.pipelineName]?.results?.[metricName];
                    // LLM metrics are evaluated inline in launch() and are absent
                    // from the Python results — skip the overwrite so the value
                    // set by judge() (including 'error') is preserved.
                    if (pythonResult === undefined) return;
                    prediction.evaluations[metricName] = {
                      value: pythonResult,
                    };
                  });
                  // Merge Python batch time into the evaluations duration slot.
                  if (prediction.duration) {
                    prediction.duration.evaluations =
                      (prediction.duration.evaluations ?? 0) + pythonMsPerJob;
                    prediction.duration.total += pythonMsPerJob;
                  }
                });
                next = next.toSpliced(jobIdx, 1, {
                  ...updatedJob,
                  status: 'success',
                });
              });
              return next;
            });
          }
        }
      });

      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimer(time);
      intervalRef.current = setInterval(() => setTimer((t) => t - 1), 1000);
    }
  }, [timer]);

  // Stop running once every job has reached a terminal state.
  useEffect(() => {
    if (
      running &&
      jobs.every(
        (job) =>
          job.status === 'success' ||
          job.status === 'error' ||
          job.status === 'cancelled',
      )
    ) {
      setRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [running, jobs]);

  // Step 3: Render
  return (
    <>
      <div className={classes.header}>
        <h2 className={classes.title}>Run your experiment</h2>
        <div className={classes.navigationButtons}>
          <Button
            kind="secondary"
            renderIcon={ArrowLeft}
            onClick={() => {
              onPrevious();
            }}
          >
            Previous
          </Button>
          {running ? (
            <Button
              kind="danger"
              onClick={() => {
                // Abort the in-flight run() loop so no further jobs are dispatched.
                // Jobs already mid-flight finish naturally but won't advance to 'evaluating'.
                abortRef.current.abort();
                setRunning(false);
                if (intervalRef.current) clearInterval(intervalRef.current);
              }}
            >
              Stop
            </Button>
          ) : (
            <Button
              id="experiment_run--btn"
              disabled={isEmpty(filteredTasks) || isEmpty(pipelines)}
              onClick={async () => {
                // Fresh controller for this run; previous one may already be aborted.
                abortRef.current = new AbortController();

                // Build a fresh jobs array so re-runs don't carry stale predictions
                // from the previous run.
                const resetJobs = filteredTasks.map((task) => ({
                  task,
                  status: 'scheduled' as const,
                  predictions: [],
                }));
                setJobs(resetJobs);
                setHasRun(true);
                setRunning(true);
                run(
                  componentToTest,
                  resetJobs,
                  pipelines,
                  metrics,
                  systemConfiguration,
                  setJobs,
                  abortRef.current.signal,
                );
              }}
            >
              Run
            </Button>
          )}
        </div>
      </div>
      <div
        className={cx(
          classes.statusBanner,
          hasRun ? classes.visible : null,
          running ? classes.animated : null,
        )}
      >
        <Chemistry />
        <span>
          {running
            ? evalProgress
              ? `Evaluating responses... (${evalProgress.completed} of ${evalProgress.total} complete)`
              : 'Your experiment is running ...'
            : 'Your experiment has completed.'}
        </span>
      </div>

      <ExperimentTile
        name="Your experiment"
        componentToTest={componentToTest}
        numTasks={filteredTasks.length}
        pipelines={pipelines}
        metrics={metrics}
      />
      <h4>Jobs</h4>
      <JobsTable
        componentToTest={componentToTest}
        jobs={jobs}
        pipelines={pipelines}
        metrics={metrics}
        evalProgress={evalProgress}
      />
    </>
  );
}

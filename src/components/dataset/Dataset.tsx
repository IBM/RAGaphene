/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { isEmpty, countBy } from 'lodash';
import { useState, useMemo, useCallback } from 'react';

import {
  FileUploaderButton,
  FileUploaderItem,
  Button,
  RadioButtonGroup,
  RadioButton,
  DefinitionTooltip,
  Tag,
  Dropdown,
} from '@carbon/react';
import { ArrowLeft, ArrowRight, Warning } from '@carbon/icons-react';

import { Conversation, DatasetConversation, DatasetTask } from '@/types/custom';
import { camelCaseKeys } from '@/src/common/utilities/objects';
import { hash } from '@/src/common/utilities/string';
import { useNotification } from '@/src/components/notification/Notification';
import { validateConversation } from '@/src/common/utilities/validators';
import { migrateConversation } from '@/src/common/utilities/migration';
import { MAX_NUM_TASKS_IN_EXPERIMENT } from '@/src/common/constants';
import TasksTable from '@/src/components/tasks-table/TasksTable';
import TaskViewer from '@/src/components/task-viewer/TaskViewer';
import { Statistics } from './Statistics';

import '@carbon/charts-react/styles.css';
import classes from './Dataset.module.scss';

// --- Types ---

interface Props {
  onPrevious: () => void;
  onNext: (tasks: DatasetTask[], componentToTest: string) => void;
  tasks: DatasetTask[] | undefined;
}

type Strategy = 'midpoint' | 'first' | 'last' | 'all';

const STRATEGY_OPTIONS: { id: Strategy; label: string }[] = [
  { id: 'midpoint', label: 'Midpoint per conversation (default)' },
  { id: 'first', label: 'First turn per conversation' },
  { id: 'last', label: 'Last turn per conversation' },
  { id: 'all', label: 'All turns' },
];

// --- Helpers ---

function processConversation(conversation: Conversation): DatasetConversation {
  const processedConversation: DatasetConversation = {
    conversation_id: hash(JSON.stringify(conversation)),
    collection: conversation.retriever?.collection.name || 'unknown',
    all_contexts: {},
    messages: [],
  };

  conversation.messages.forEach((message) => {
    const processedUtterance = {
      speaker: message.speaker,
      text: message.text,
      timestamp: message.timestamp,
      metadata: {
        author_type: message.speaker === 'user' ? 'human' : 'model',
        author_id:
          message.speaker === 'user'
            ? conversation.author
            : conversation.generator
              ? conversation.generator.name
              : 'system',
        created_at: message.timestamp,
      },
    };

    if (message.enrichments && !isEmpty(message.enrichments)) {
      processedUtterance['enrichments'] = message.enrichments;
    }

    if (message.speaker === 'agent') {
      processedUtterance['retrieved_contexts'] = [];
    }

    if (message.contexts && !isEmpty(message.contexts)) {
      message.contexts.forEach((context) => {
        // Skip context if majority of annotators voted it irrelevant.
        if (
          context.feedback &&
          !isEmpty(context.feedback) &&
          context.feedback.hasOwnProperty('relevant') &&
          !isEmpty(context.feedback['relevant'])
        ) {
          const votes = countBy(
            Object.values(context.feedback['relevant']).map(
              (annotation) => annotation['value'],
            ),
          );
          const yesCount = votes['yes'] ?? 0;
          const totalCount = (Object.values(votes) as number[]).reduce(
            (a, b) => a + b,
            0,
          );
          if (yesCount <= totalCount / 2) {
            return;
          }
        }

        if (
          !processedConversation.all_contexts.hasOwnProperty(
            context.document_id,
          )
        ) {
          processedConversation.all_contexts[context.document_id] = context;
        }

        processedUtterance['retrieved_contexts'].push(context.document_id);
      });
    }

    processedConversation.messages.push(processedUtterance);
  });

  return processedConversation;
}

function createAllTasks(conversation: DatasetConversation): DatasetTask[] {
  const tasks: DatasetTask[] = [];

  for (
    let turn = 0;
    turn < Math.floor(conversation.messages.length / 2);
    turn++
  ) {
    const task: DatasetTask = {
      conversation_id: conversation.conversation_id,
      task_id: `${conversation.conversation_id}::${turn + 1}`,
      task_type: 'rag',
      turn: `${turn + 1}`,
      collection: conversation.collection,
      contexts: [],
      input: conversation.messages.slice(0, turn * 2 + 1),
      targets: [conversation.messages[turn * 2 + 1]],
    };

    // Merge enrichments from the question utterance into the task.
    if (
      task.input[turn * 2].enrichments &&
      !isEmpty(task.input[turn * 2].enrichments)
    ) {
      Object.entries(
        task.input[turn * 2].enrichments as { [key: string]: string[] },
      ).forEach(([enrichmentType, enrichmentValues]) => {
        if (task.hasOwnProperty(enrichmentType)) {
          (enrichmentValues as string[]).forEach((value) => {
            if (!task[enrichmentType].includes(value)) {
              task[enrichmentType].push(value);
            }
          });
        } else {
          task[enrichmentType] = Array.from(
            new Set(enrichmentValues as string[]),
          );
        }
      });
    }

    // Populate gold contexts from the target utterance's retrieved context IDs.
    if (
      task.targets[0].hasOwnProperty('retrieved_contexts') &&
      task.targets[0]['retrieved_contexts'] &&
      !isEmpty(task.targets[0]['retrieved_contexts'])
    ) {
      task.targets[0]['retrieved_contexts'].forEach((context_id) => {
        task.contexts.push(conversation.all_contexts[context_id]);
      });
    }

    tasks.push(task);
  }

  return tasks;
}

/**
 * Returns true if a task is likely unanswerable: either all its gold contexts
 * were voted irrelevant (empty contexts array after the relevancy filter) or
 * the question utterance carries an UNANSWERABLE enrichment tag.
 */
function isLikelyUnanswerable(task: DatasetTask): boolean {
  if (isEmpty(task.contexts)) return true;
  const lastUtterance = task.input[task.input.length - 1];
  const enrichments = lastUtterance.enrichments as
    | { [key: string]: string[] }
    | undefined;
  return enrichments?.['UNANSWERABLE'] !== undefined;
}

/**
 * Returns the 0-based index of the task to pre-select from a group of tasks
 * that all belong to the same conversation, applying the given strategy.
 * Tasks are assumed to be ordered by turn (turn 1 first).
 */
function selectIndexForStrategy(
  conversationTasks: DatasetTask[],
  strategy: Strategy,
): number {
  const count = conversationTasks.length;
  if (strategy === 'first') return 0;
  if (strategy === 'last') return count - 1;
  if (strategy === 'midpoint') return Math.ceil(count / 2) - 1;
  // 'all' — caller handles this case by selecting every task.
  return 0;
}

/**
 * Applies a selection strategy across all conversations, returning an updated
 * tasks array with is_included set accordingly. Caps at MAX_NUM_TASKS_IN_EXPERIMENT.
 */
function applyStrategy(
  tasks: DatasetTask[],
  strategy: Strategy,
): DatasetTask[] {
  // Group tasks by conversation_id preserving order.
  const byConversation = new Map<string, DatasetTask[]>();
  tasks.forEach((task) => {
    if (!byConversation.has(task.conversation_id)) {
      byConversation.set(task.conversation_id, []);
    }
    byConversation.get(task.conversation_id)!.push(task);
  });

  const updated = tasks.map((t) => ({ ...t, is_included: 0 }));

  // Track how many tasks have been included so far to respect the cap.
  let included = 0;

  byConversation.forEach((convTasks) => {
    if (strategy === 'all') {
      convTasks.forEach((task) => {
        if (included < MAX_NUM_TASKS_IN_EXPERIMENT) {
          const idx = tasks.indexOf(task);
          updated[idx] = { ...updated[idx], is_included: 1 };
          included++;
        }
      });
    } else {
      const localIdx = selectIndexForStrategy(convTasks, strategy);
      const task = convTasks[localIdx];
      if (included < MAX_NUM_TASKS_IN_EXPERIMENT) {
        const idx = tasks.indexOf(task);
        updated[idx] = { ...updated[idx], is_included: 1 };
        included++;
      }
    }
  });

  return updated;
}

// --- File uploader subcomponent ---

// Uses FileUploaderButton + FileUploaderItem rather than FileUploader so the
// displayed filename is controlled React state. Carbon's composite FileUploader
// is fully uncontrolled — its filename chip is lost whenever the parent
// re-renders or the user navigates away and back within the same stage.
function ConversationFileUploader({
  filename,
  onLoad,
  onClear,
}: {
  filename: string | undefined;
  onLoad: (rawData: any, filename: string) => void;
  onClear: () => void;
}) {
  const { createNotification } = useNotification();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result !== 'string') return;
      try {
        onLoad(JSON.parse(e.target.result), file.name);
      } catch {
        createNotification({
          kind: 'error',
          title: 'Failed to parse file.',
          subtitle: 'Make sure you are uploading a valid JSON file.',
          timeout: 10000,
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <p className="cds--file--label">
        Upload a conversations file in RAGAPhene format
      </p>
      <p className="cds--label-description">
        JSON format only. Files above 5 MB may be slow to process.
      </p>
      {!filename && (
        //@ts-ignore
        <FileUploaderButton
          labelText="Choose file"
          buttonKind="primary"
          size="md"
          accept={['.json']}
          multiple={false}
          onChange={handleChange}
        />
      )}
      {filename && (
        //@ts-ignore
        <FileUploaderItem
          name={filename}
          status="edit"
          iconDescription="Remove file"
          onDelete={onClear}
        />
      )}
    </div>
  );
}

// --- Main component ---

export default function DatasetBuilder({ onPrevious, onNext, tasks }: Props) {
  const [datasetTasks, setDatasetTasks] = useState<DatasetTask[] | undefined>(
    tasks,
  );
  // Three internal states:
  //   upload    — no file loaded yet
  //   configure — file validated, researcher answers "which component to evaluate?"
  //   review    — researcher clicks Next, task table + statistics shown
  const [pageStage, setPageStage] = useState<'upload' | 'configure' | 'review'>(
    tasks ? 'review' : 'upload',
  );
  const [componentToTest, setComponentToTest] = useState<string>('generator');
  const [selectedTask, setSelectedTask] = useState<DatasetTask | undefined>(
    undefined,
  );
  const [isWideScreen, setIsWideScreen] = useState<boolean>(
    typeof window !== 'undefined' && window.innerWidth >= 1312,
  );
  // Statistics are shown above the table on medium screens (672px–1311px),
  // in a sticky right panel on wide screens (≥1312px), and hidden entirely
  // below 672px where a donut chart is too small to read.
  const [isMediumScreen, setIsMediumScreen] = useState<boolean>(
    typeof window !== 'undefined' &&
      window.innerWidth >= 672 &&
      window.innerWidth < 1312,
  );
  const [loadedFilename, setLoadedFilename] = useState<string | undefined>(
    undefined,
  );

  const { createNotification } = useNotification();

  // Update layout on resize.
  useState(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setIsWideScreen(window.innerWidth >= 1312);
      setIsMediumScreen(window.innerWidth >= 672 && window.innerWidth < 1312);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  });

  const selectedTasks = useMemo(
    () => (datasetTasks ?? []).filter((t) => t.is_included === 1),
    [datasetTasks],
  );

  const collections = useMemo(
    () =>
      datasetTasks
        ? Array.from(new Set(datasetTasks.map((t) => t.collection)))
        : [],
    [datasetTasks],
  );

  const unanswerableCount = useMemo(
    () => (datasetTasks ?? []).filter(isLikelyUnanswerable).length,
    [datasetTasks],
  );

  const conversationCount = useMemo(
    () =>
      datasetTasks
        ? new Set(datasetTasks.map((t) => t.conversation_id)).size
        : 0,
    [datasetTasks],
  );

  const onToggleInclusion = useCallback(
    (tasksToToggle: DatasetTask[]) => {
      if (!datasetTasks) return;
      const toggleIds = new Set(tasksToToggle.map((t) => t.task_id));
      const updated = datasetTasks.map((t) =>
        toggleIds.has(t.task_id)
          ? { ...t, is_included: t.is_included === 1 ? 0 : 1 }
          : t,
      );
      if (
        updated.filter((t) => t.is_included === 1).length >
        MAX_NUM_TASKS_IN_EXPERIMENT
      ) {
        createNotification({
          kind: 'error',
          title: `Cannot exceed ${MAX_NUM_TASKS_IN_EXPERIMENT} tasks.`,
          subtitle: 'Deselect some tasks before including more.',
          timeout: 8000,
        });
        return;
      }
      setDatasetTasks(updated);
    },
    [datasetTasks, createNotification],
  );

  const onApplyStrategy = useCallback(
    (strategy: Strategy) => {
      if (!datasetTasks) return;
      const updated = applyStrategy(datasetTasks, strategy);
      const includedCount = updated.filter((t) => t.is_included === 1).length;
      if (
        strategy === 'all' &&
        datasetTasks.length > MAX_NUM_TASKS_IN_EXPERIMENT
      ) {
        createNotification({
          kind: 'warning',
          title: `Capped at ${MAX_NUM_TASKS_IN_EXPERIMENT} tasks.`,
          subtitle: `${datasetTasks.length} tasks in pool. Only the first ${MAX_NUM_TASKS_IN_EXPERIMENT} were selected.`,
          timeout: 8000,
        });
      }
      setDatasetTasks(updated);
    },
    [datasetTasks, createNotification],
  );

  // rawData comes directly from JSON.parse — any is the correct type at this boundary.
  function handleFileLoad(rawData: any, filename: string) {
    let fileData: any;
    let migrated = false;

    if (Array.isArray(rawData)) {
      const results = rawData.map((c) => migrateConversation(c));
      fileData = results.map((r) => r.conversation);
      migrated = results.some((r) => r.migrated);
    } else {
      const result = migrateConversation(rawData);
      fileData = result.conversation;
      migrated = result.migrated;
    }

    if (migrated) {
      createNotification({
        kind: 'info',
        title: 'Legacy format detected and updated automatically.',
        subtitle: '',
        timeout: 4000,
      });
    }

    const invalidIdxs: number[] = [];
    const conversations: Conversation[] = [];

    if (Array.isArray(fileData)) {
      fileData.forEach((conversation: any, idx: number) => {
        const status = validateConversation(conversation, true);
        if (!status.valid) {
          invalidIdxs.push(idx);
        } else {
          conversations.push(camelCaseKeys(conversation) as Conversation);
        }
      });
    } else {
      const status = validateConversation(fileData, true);
      if (!status.valid) {
        status.errors?.forEach((reason) => {
          createNotification({
            kind: 'error',
            title: 'Failed to load file.',
            subtitle: reason.kind,
            timeout: 10000,
          });
        });
        return;
      }
      conversations.push(camelCaseKeys(fileData) as Conversation);
    }

    if (!isEmpty(invalidIdxs)) {
      createNotification({
        kind: 'error',
        title: 'Some conversations were skipped.',
        subtitle: `Conversations at positions ${invalidIdxs.join(', ')} had format issues and were excluded.`,
        timeout: 10000,
      });
    }

    if (isEmpty(conversations)) return;

    // Extract all tasks from every conversation, then apply the midpoint
    // default selection so the table opens in a useful state.
    const allTasks: DatasetTask[] = [];
    conversations.forEach((conversation) => {
      createAllTasks(processConversation(conversation)).forEach((task) => {
        allTasks.push({ ...task, is_included: 0 });
      });
    });

    const withDefaults = applyStrategy(allTasks, 'midpoint');

    if (allTasks.length > MAX_NUM_TASKS_IN_EXPERIMENT) {
      createNotification({
        kind: 'warning',
        title: `Large dataset detected.`,
        subtitle: `${allTasks.length} tasks extracted. The midpoint turn from each conversation is pre-selected up to the ${MAX_NUM_TASKS_IN_EXPERIMENT} task limit.`,
        timeout: 10000,
      });
    } else {
      createNotification({
        kind: 'success',
        title: 'Dataset loaded.',
        subtitle: `${withDefaults.filter((t) => t.is_included === 1).length} tasks pre-selected. Review and adjust before continuing.`,
        timeout: 2000,
      });
    }

    setDatasetTasks(withDefaults);
    setLoadedFilename(filename);
    setPageStage('configure');
  }

  // The component-to-test selector and file uploader are always visible.
  // Once a file loads successfully, the tasks panel replaces the uploader area.
  const componentSelector = (
    <div className={classes.componentSelector}>
      <RadioButtonGroup
        legendText="Which component would you like to evaluate?"
        name="componentToTest"
        valueSelected={componentToTest}
        orientation="vertical"
        onChange={(value) => {
          if (typeof value === 'string') setComponentToTest(value);
        }}
      >
        <RadioButton
          labelText={
            <span className={classes.radioLabel}>
              <span className={classes.radioLabelTitle}>Generator</span>
              <span className={classes.radioLabelDescription}>
                Evaluate whether models produce correct answers from retrieved
                context, not from memory.
              </span>
            </span>
          }
          value="generator"
          id="componentToTest--generator"
        />
        <RadioButton
          labelText={
            <span className={classes.radioLabel}>
              <span className={classes.radioLabelTitle}>Retriever</span>
              <span className={classes.radioLabelDescription}>
                Evaluate whether retrievers find the right documents for each
                question.
              </span>
            </span>
          }
          value="retriever"
          id="componentToTest--retriever"
        />
        <RadioButton
          labelText={
            <span className={classes.radioLabel}>
              <span className={classes.radioLabelTitle}>Both</span>
              <span className={classes.radioLabelDescription}>
                Evaluate the full pipeline, retrieval quality and generation
                quality together.
              </span>
            </span>
          }
          value="both"
          id="componentToTest--both"
        />
      </RadioButtonGroup>
    </div>
  );

  // Stat labels with DefinitionTooltip — used in both configure and review strips.
  // The tooltip trigger is wrapped in .summaryStatLabelTooltip which resets
  // text-transform so the tooltip content is not uppercased by the parent label style.
  const tasksInPoolLabel = (
    <span className={classes.summaryStatLabelTooltip}>
      <DefinitionTooltip
        openOnHover
        align="bottom"
        definition="Each conversation turn becomes one task."
      >
        Tasks in pool
      </DefinitionTooltip>
    </span>
  );

  const selectedLabel = (
    <span className={classes.summaryStatLabelTooltip}>
      <DefinitionTooltip
        openOnHover
        align="bottom"
        definition="Tasks selected for this run. By default, the midpoint turn of each conversation is pre-selected. Use the strategy dropdown to change the selection."
      >
        Selected
      </DefinitionTooltip>
    </span>
  );

  const unanswerableLabel = (
    <span className={classes.summaryStatLabelTooltip}>
      <DefinitionTooltip
        openOnHover
        align="bottom"
        definition="Tasks where all gold contexts were voted irrelevant, or the question is tagged UNANSWERABLE. Low scores on these tasks may indicate correct model behaviour, not failure."
      >
        Likely unanswerable
      </DefinitionTooltip>
    </span>
  );

  // Summary strip shown in the configure state — pool-level counts only.
  // Gives the researcher immediate feedback that the file was understood correctly.
  const configureSummaryStrip = datasetTasks && (
    <div className={classes.configureSummaryBox}>
      <div className={classes.summaryStrip}>
        <div className={classes.summaryStat}>
          <span className={classes.summaryStatLabel}>Conversations</span>
          <span className={classes.summaryStatValue}>{conversationCount}</span>
        </div>
        <div className={classes.summaryStat}>
          {tasksInPoolLabel}
          <span className={classes.summaryStatValue}>
            {datasetTasks.length}
          </span>
        </div>
        <div className={classes.summaryStat}>
          <span className={classes.summaryStatLabel}>Collections</span>
          <div className={classes.summaryTags}>
            {collections.map((c) => (
              <Tag key={c} type="blue" size="sm">
                {c}
              </Tag>
            ))}
          </div>
        </div>
        {unanswerableCount > 0 && (
          <div className={classes.summaryStat}>
            {unanswerableLabel}
            <div className={classes.summaryStatValue}>
              <Warning size={16} className={classes.warningIcon} />
              <span>{unanswerableCount}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Shared file uploader — used in both upload and configure states.
  const fileUploader = (
    <ConversationFileUploader
      filename={loadedFilename}
      onLoad={handleFileLoad}
      onClear={() => {
        setDatasetTasks(undefined);
        setLoadedFilename(undefined);
        setPageStage('upload');
      }}
    />
  );

  // --- Render: upload state ---

  if (pageStage === 'upload') {
    return (
      <div className={classes.page}>
        <div className={classes.header}>
          <h2 className={classes.title}>Load your dataset</h2>
          <div className={classes.navigationButtons}>
            <Button
              kind="secondary"
              renderIcon={ArrowLeft}
              onClick={onPrevious}
            >
              Previous
            </Button>
            <Button renderIcon={ArrowRight} disabled>
              Next
            </Button>
          </div>
        </div>
        <div className={classes.uploadContainer}>{fileUploader}</div>
      </div>
    );
  }

  // --- Render: configure state (file valid, awaiting component selection) ---

  if (pageStage === 'configure') {
    return (
      <div className={classes.page}>
        <div className={classes.header}>
          <h2 className={classes.title}>Load your dataset</h2>
          <div className={classes.navigationButtons}>
            <Button
              kind="secondary"
              renderIcon={ArrowLeft}
              onClick={() => {
                setDatasetTasks(undefined);
                setLoadedFilename(undefined);
                setPageStage('upload');
              }}
            >
              Previous
            </Button>
            <Button
              renderIcon={ArrowRight}
              onClick={() => setPageStage('review')}
            >
              Next
            </Button>
          </div>
        </div>
        <div className={classes.uploadContainer}>
          {fileUploader}
          <hr className={classes.uploadDivider} />
          {configureSummaryStrip}
          {componentSelector}
        </div>
      </div>
    );
  }

  // --- Render: review state (task table + statistics) ---
  // pageStage === 'review' is only reachable after handleFileLoad sets datasetTasks.
  const tasks_ = datasetTasks!;

  return (
    <div className={classes.page}>
      {selectedTask && (
        <div className={cx(classes.taskOverlay, classes.active)}>
          <TaskViewer
            task={selectedTask}
            onClose={() => setSelectedTask(undefined)}
          />
        </div>
      )}

      <div className={classes.header}>
        <h2 className={classes.title}>Load your dataset</h2>
        <div className={classes.navigationButtons}>
          <Button
            kind="secondary"
            renderIcon={ArrowLeft}
            onClick={() => setPageStage('configure')}
          >
            Previous
          </Button>
          <Button
            renderIcon={ArrowRight}
            disabled={isEmpty(selectedTasks)}
            onClick={() => onNext(datasetTasks!, componentToTest)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className={classes.reviewSummaryBox}>
        <div className={classes.summaryStrip}>
          <div className={classes.summaryStat}>
            <span className={classes.summaryStatLabel}>Conversations</span>
            <span className={classes.summaryStatValue}>
              {conversationCount}
            </span>
          </div>
          <div className={classes.summaryStat}>
            {tasksInPoolLabel}
            <span className={classes.summaryStatValue}>{tasks_.length}</span>
          </div>
          <div className={classes.summaryStat}>
            {selectedLabel}
            <span className={classes.summaryStatValue}>
              {selectedTasks.length}
            </span>
          </div>
          <div className={classes.summaryStat}>
            <span className={classes.summaryStatLabel}>Collections</span>
            <div className={classes.summaryTags}>
              {collections.map((c) => (
                <Tag key={c} type="blue" size="sm">
                  {c}
                </Tag>
              ))}
            </div>
          </div>
          {unanswerableCount > 0 && (
            <div className={classes.summaryStat}>
              {unanswerableLabel}
              <div className={classes.summaryStatValue}>
                <Warning size={16} className={classes.warningIcon} />
                <span>{unanswerableCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {tasks_.length > MAX_NUM_TASKS_IN_EXPERIMENT && (
        <div className={classes.overLimitBanner}>
          <Warning size={16} className={classes.warningIcon} />
          <span>
            {tasks_.length} tasks in pool. Only {MAX_NUM_TASKS_IN_EXPERIMENT}{' '}
            can be included in a single run. Adjust your selection below.
          </span>
        </div>
      )}

      {/* Main content: table + statistics */}
      <div
        className={isWideScreen ? classes.contentWide : classes.contentNarrow}
      >
        {/* Statistics — grid above the table on medium screens (672px–1311px),
            hidden below 672px where charts are too small to be useful */}
        {isMediumScreen && (
          <div>
            <h4 className={classes.sectionTitle}>Statistics</h4>
            <Statistics
              selectedTasks={selectedTasks}
              totalTaskCount={tasks_.length}
              layout="grid"
            />
          </div>
        )}

        {/* Task table */}
        <div className={classes.tableSection}>
          <div className={classes.tableSectionHeader}>
            <h4 className={classes.sectionTitle}>Tasks</h4>
            <div className={classes.tableToolbarExtra}>
              <Dropdown
                id="strategy-dropdown"
                label=""
                titleText=""
                initialSelectedItem={STRATEGY_OPTIONS[0]}
                items={STRATEGY_OPTIONS}
                itemToString={(item) => item?.label ?? ''}
                onChange={({ selectedItem }) => {
                  if (selectedItem) onApplyStrategy(selectedItem.id);
                }}
              />
            </div>
          </div>
          <TasksTable
            tasks={tasks_}
            onView={(task: DatasetTask) => setSelectedTask(task)}
            onToggleInclusion={onToggleInclusion}
          />
        </div>

        {/* Statistics sticky right panel on wide screens */}
        {isWideScreen && (
          <div className={classes.statisticsSticky}>
            <h4 className={classes.sectionTitle}>Statistics</h4>
            <Statistics
              selectedTasks={selectedTasks}
              totalTaskCount={tasks_.length}
              layout="column"
            />
          </div>
        )}
      </div>
    </div>
  );
}

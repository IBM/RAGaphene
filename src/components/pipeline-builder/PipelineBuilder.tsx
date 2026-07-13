/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import cx from 'classnames';
import { useEffect, useState } from 'react';
import {
  Button,
  Modal,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  TextInput,
} from '@carbon/react';
import {
  ArrowRight,
  ArrowLeft,
  Add,
  Edit,
  Copy,
  TrashCan,
  IbmWatsonDiscovery,
  WatsonxAi,
  WarningAlt,
} from '@carbon/icons-react';
import { User, SystemConfiguration, Pipeline } from '@/types/custom';

import GeneratorSettings from '@/src/components/experience-settings/GeneratorSettings';
import RetrieverSettings from '@/src/components/experience-settings/RetrieverSettings';
import NewPipeline from '@/src/components/pipeline-builder/NewPipeline';

import classes from './PipelineBuilder.module.scss';

// --- Types ---

interface Props {
  user: User;
  systemConfiguration: SystemConfiguration;
  componentToTest: string;
  pipelines: Pipeline[];
  onUpdate: (pipelines: Pipeline[]) => void;
  onPrevious: () => void;
  onNext?: () => void;
  collectionNames?: string[];
}

// --- Render helpers ---

function DeletePipeline({
  open,
  onDelete,
  onCancel,
}: {
  open: boolean;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      danger
      onRequestSubmit={onDelete}
      onRequestClose={onCancel}
      modalHeading="Are you sure you want to delete this pipeline?"
      modalLabel="Pipeline"
      primaryButtonText="Delete"
      secondaryButtonText="Cancel"
    />
  );
}

function PipelineTile({
  pipeline,
  onSelect,
  onEdit,
  onDelete,
  onCopy,
  isSelected = false,
}: {
  pipeline: Pipeline;
  onSelect: () => void;
  onEdit: (name: string) => void;
  onDelete: () => void;
  onCopy?: () => void;
  isSelected?: boolean;
}) {
  const [editing, setEditing] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>(pipeline.name);

  return (
    <div
      className={cx(classes.pipelineTile, isSelected ? classes.active : null)}
      onClick={onSelect}
    >
      <div className={classes.pipelineHeader}>
        {editing ? (
          <div className={classes.nameEditor}>
            <TextInput
              id="input--pipelineName"
              labelText="Name"
              hideLabel
              autoFocus={editing}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isEmpty(editedName)) {
                  event.stopPropagation();
                  onEdit(editedName);
                  setEditing(false);
                }
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setEditing(false);
                }
              }}
              placeholder="Pipeline name"
              value={editedName}
              invalid={isEmpty(editedName)}
              invalidText="Pipeline name cannot be empty"
              onChange={(event) => {
                event.stopPropagation();
                setEditedName(event.target.value);
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            />
            <div className={classes.nameEditorWarningContainer}>
              <WarningAlt size={16} /> Press 'Enter' to save
            </div>
          </div>
        ) : (
          <h4>{pipeline.name}</h4>
        )}
        <Button
          kind="ghost"
          renderIcon={Edit}
          hasIconOnly
          iconDescription="Edit pipeline name"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(!editing);
          }}
        />
        <Button
          kind="ghost"
          renderIcon={Copy}
          hasIconOnly
          iconDescription="Copy pipeline"
          disabled={onCopy === undefined}
          onClick={(event) => {
            event.stopPropagation();
            onCopy?.();
          }}
        />
        <Button
          kind="ghost"
          renderIcon={TrashCan}
          hasIconOnly
          iconDescription="Delete pipeline"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        />
      </div>
      {pipeline.description ? (
        <span className={classes.pipelineDescription}>
          {pipeline.description}
        </span>
      ) : null}
      <div className={classes.pipelineComponents}>
        {pipeline.retriever ? (
          <div className={classes.pipelineComponent}>
            <span className={classes.pipelineComponentTitle}>Retriever</span>
            <span className={classes.pipelineComponentValue}>
              {pipeline.retriever.connector.name}
            </span>
            <span className={classes.pipelineComponentDetail}>
              {pipeline.retriever.collection.name || '(no collection)'}
            </span>
          </div>
        ) : null}
        {pipeline.generator ? (
          <div className={classes.pipelineComponent}>
            <span className={classes.pipelineComponentTitle}>Generator</span>
            <span className={classes.pipelineComponentValue}>
              {pipeline.generator.connector.name}
            </span>
            <span className={classes.pipelineComponentDetail}>
              {pipeline.generator.name}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- Main component ---

export default function PipelineBuilder({
  user,
  systemConfiguration,
  componentToTest,
  pipelines,
  onUpdate,
  onPrevious,
  onNext,
  collectionNames,
}: Props) {
  const MAX_NUM_PIPELINES = 3;
  const [creating, setCreating] = useState<boolean>(false);
  const [pipelineToDeleteIdx, setPipelineToDeleteIdx] = useState<
    number | undefined
  >(undefined);
  const [selectedPipelineIdx, setSelectedPipelineIdx] = useState<number>(-1);

  useEffect(() => {
    if (pipelines.length === 0) {
      document.getElementById('createPipeline--btn')?.focus();
      setSelectedPipelineIdx(-1);
    }
  }, [pipelines]);

  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <h2 className={classes.title}>Build your pipelines</h2>
        <div className={classes.navigationButtons}>
          <Button kind="secondary" renderIcon={ArrowLeft} onClick={onPrevious}>
            Previous
          </Button>
          <Button
            renderIcon={ArrowRight}
            disabled={isEmpty(pipelines) || onNext === undefined}
            onClick={() => onNext?.()}
          >
            Next
          </Button>
        </div>
      </div>

      <div className={classes.container}>
        {creating ? (
          <NewPipeline
            user={user}
            name={`Custom-${pipelines.length}`}
            systemConfiguration={systemConfiguration}
            componentToTest={componentToTest}
            existingPipelineNames={pipelines.map((p) => p.name)}
            open={creating}
            onAdd={(pipeline: Pipeline) => {
              const updatedPipelines: Pipeline[] = [...pipelines, pipeline];
              onUpdate(updatedPipelines);
              setSelectedPipelineIdx(updatedPipelines.length - 1);
              setCreating(false);
            }}
            onClose={() => setCreating(false)}
            collectionNames={collectionNames}
          />
        ) : null}
        <DeletePipeline
          open={pipelineToDeleteIdx !== undefined}
          onCancel={() => setPipelineToDeleteIdx(undefined)}
          onDelete={() => {
            if (pipelineToDeleteIdx !== undefined) {
              onUpdate(pipelines.toSpliced(pipelineToDeleteIdx, 1));
              setSelectedPipelineIdx(
                pipelineToDeleteIdx === 0
                  ? pipelines.length > 1
                    ? 0
                    : -1
                  : pipelineToDeleteIdx - 1,
              );
              setPipelineToDeleteIdx(undefined);
            }
          }}
        />
        <div className={classes.leftPanel}>
          {pipelines.map((pipeline, pipelineIdx) => (
            <PipelineTile
              key={`pipeline--${pipelineIdx}`}
              pipeline={pipeline}
              onEdit={(editedName) => {
                onUpdate(
                  pipelines.toSpliced(pipelineIdx, 1, {
                    ...pipelines[pipelineIdx],
                    name: editedName,
                  }),
                );
              }}
              onCopy={
                pipelines.length >= MAX_NUM_PIPELINES
                  ? undefined
                  : () => {
                      const updatedPipelines = [
                        ...pipelines,
                        {
                          ...pipelines[pipelineIdx],
                          name: `${pipelines[pipelineIdx].name}-1`,
                        },
                      ];
                      onUpdate(updatedPipelines);
                      setSelectedPipelineIdx(updatedPipelines.length - 1);
                    }
              }
              onDelete={() => setPipelineToDeleteIdx(pipelineIdx)}
              onSelect={() => setSelectedPipelineIdx(pipelineIdx)}
              isSelected={
                selectedPipelineIdx !== -1
                  ? selectedPipelineIdx === pipelineIdx
                  : false
              }
            />
          ))}
          <div className={classes.spacer}>
            <Button
              id="createPipeline--btn"
              renderIcon={Add}
              onClick={() => setCreating(true)}
              disabled={pipelines.length >= MAX_NUM_PIPELINES}
            >
              Create
            </Button>
            {pipelines.length >= MAX_NUM_PIPELINES ? (
              <div className={classes.addPipelinesWarningContainer}>
                <WarningAlt size={20} />
                <span>
                  You have reached maximum number of pipelines (
                  {MAX_NUM_PIPELINES}) allowed.
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className={classes.mainPanel}>
          {pipelines.length === 0 ? (
            <div className={classes.hintContainer}>
              <span className={classes.hintContainerTitle}>
                No pipelines yet
              </span>
              <span className={classes.hintContainerSubTitle}>
                {componentToTest === 'retriever'
                  ? 'Create a pipeline to configure the retriever you want to test.'
                  : componentToTest === 'generator'
                    ? 'Create a pipeline to configure the generator you want to test.'
                    : 'Create a pipeline to configure the retriever and generator you want to test together.'}
              </span>
            </div>
          ) : selectedPipelineIdx !== -1 ? (
            <>
              {pipelines[selectedPipelineIdx].retriever &&
              pipelines[selectedPipelineIdx].generator ? (
                <Tabs>
                  <TabList aria-label="experience-settings" contained fullWidth>
                    {
                      //@ts-ignore
                      <Tab renderIcon={IbmWatsonDiscovery}>Retriever</Tab>
                    }
                    {
                      //@ts-ignore
                      <Tab renderIcon={WatsonxAi}>Generator</Tab>
                    }
                  </TabList>
                  <TabPanels>
                    <TabPanel>
                      <RetrieverSettings
                        //@ts-ignore
                        retriever={pipelines[selectedPipelineIdx].retriever}
                        onChange={(updatedParameters) => {
                          onUpdate(
                            pipelines.toSpliced(selectedPipelineIdx, 1, {
                              ...pipelines[selectedPipelineIdx],
                              //@ts-ignore
                              retriever: {
                                ...pipelines[selectedPipelineIdx].retriever,
                                settings: updatedParameters,
                              },
                            }),
                          );
                        }}
                      />
                    </TabPanel>
                    <TabPanel>
                      <GeneratorSettings
                        //@ts-ignore
                        generator={pipelines[selectedPipelineIdx].generator}
                        onChange={(updatedGenerator) => {
                          onUpdate(
                            pipelines.toSpliced(selectedPipelineIdx, 1, {
                              ...pipelines[selectedPipelineIdx],
                              generator: updatedGenerator,
                            }),
                          );
                        }}
                        open={true}
                      />
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              ) : pipelines[selectedPipelineIdx].retriever ? (
                <RetrieverSettings
                  //@ts-ignore
                  retriever={pipelines[selectedPipelineIdx].retriever}
                  onChange={(updatedParameters) => {
                    onUpdate(
                      pipelines.toSpliced(selectedPipelineIdx, 1, {
                        ...pipelines[selectedPipelineIdx],
                        //@ts-ignore
                        retriever: {
                          ...pipelines[selectedPipelineIdx].retriever,
                          settings: updatedParameters,
                        },
                      }),
                    );
                  }}
                  hideLabel={true}
                />
              ) : pipelines[selectedPipelineIdx].generator ? (
                <GeneratorSettings
                  //@ts-ignore
                  generator={pipelines[selectedPipelineIdx].generator}
                  onChange={(updatedGenerator) => {
                    onUpdate(
                      pipelines.toSpliced(selectedPipelineIdx, 1, {
                        ...pipelines[selectedPipelineIdx],
                        generator: updatedGenerator,
                      }),
                    );
                  }}
                  open={true}
                  hideLabel={true}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

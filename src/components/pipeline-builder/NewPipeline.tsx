/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { isEmpty } from 'lodash';
import { useState, useEffect } from 'react';
import {
  Modal,
  TextInput,
  PasswordInput,
  Button,
  RadioTile,
  Tag,
  ProgressIndicator,
  ProgressStep,
  Select,
  SelectItem,
  InlineNotification,
} from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import ConnectorTag from '@/src/components/connector-tag/ConnectorTag';
import {
  SystemConfiguration,
  RetrieverConfig,
  GeneratorConfig,
  ActiveRetriever,
  ActiveGenerator,
  Pipeline,
  User,
  Notification,
} from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';
import { useNotification } from '@/src/components/notification/Notification';
import RetrieverSettings from '@/src/components/experience-settings/RetrieverSettings';
import GeneratorSettings from '@/src/components/experience-settings/GeneratorSettings';

import classes from './NewPipeline.module.scss';

// --- Types ---

type WizardStep = 'retriever' | 'generator' | 'confirm';

interface Props {
  user: User;
  name: string;
  systemConfiguration: SystemConfiguration;
  componentToTest: string;
  existingPipelineNames: string[];
  open: boolean;
  onAdd: (pipeline: Pipeline) => void;
  onClose: () => void;
  collectionNames?: string[];
}

// --- Render helpers ---

function RetrieverConfigurator({
  connectors,
  onException,
  onNext,
  collectionNames,
}: {
  connectors: RetrieverConfig[];
  onException: (notification: Notification) => void;
  onNext: (retriever: ActiveRetriever) => void;
  collectionNames?: string[];
}) {
  const [testing, setTesting] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [selectedConnector, setSelectedConnector] = useState<RetrieverConfig>(
    connectors[0],
  );
  const [retrieverLoginType, setRetrieverLoginType] = useState<
    'username' | 'api_key'
  >('username');
  const [retriever, setRetriever] = useState<ActiveRetriever | undefined>(
    undefined,
  );
  // Non-empty when a successful connect found dataset collections missing from the retriever.
  // Stored as a hard block — the researcher must choose a different retriever or fix the
  // environment before they can proceed.
  const [missingCollections, setMissingCollections] = useState<string[]>([]);

  // Verify connectivity and validate collection availability when the Connect button is clicked.
  // selectedConnector is included in deps because the closure captures it and the researcher
  // may change the selection between clicks.
  useEffect(() => {
    async function connect(connector: RetrieverConfig) {
      // Store credentials in session before calling the API if they are client-managed.
      // No-auth connectors carry no secret, so they skip the store entirely — this
      // avoids the credential-store cookie race and lets the route resolve from config.
      if (
        connector.credentials.provider === 'client' &&
        connector.authentication !== 'none'
      ) {
        const { storeConnectorCredentials } =
          await import('@/src/common/utilities/credentials');
        await storeConnectorCredentials(
          {
            [connector.name]: {
              endpoint: connector.endpoint,
              credentials: connector.credentials,
            },
          },
          undefined,
        );
      }

      const params = new URLSearchParams({
        connector_name: connector.name,
        provider: connector.credentials.provider,
      });

      const response = await fetch(`/api/collections?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        onException({
          title: 'Failed to connect to a retriever',
          subtitle:
            'Please verify your credentials for retriever and try again.',
          kind: 'error',
          timeout: 10000,
        });
        setTesting(false);
        return;
      }

      const collections: { name: string }[] = await response.json();
      const returnedNames = collections.map((c) => c.name);

      // Check that every collection the dataset references is available on this retriever.
      // A missing collection means retrieval metrics will be meaningless — hard block.
      const missing = (collectionNames ?? []).filter(
        (name) => !returnedNames.includes(name),
      );

      if (missing.length > 0) {
        setMissingCollections(missing);
        // Stay on the Connect step — the researcher must pick a different retriever.
        setTesting(false);
        return;
      }

      setMissingCollections([]);
      setRetriever({
        collection: { name: '' },
        settings: {
          ...connector.settings,
          ...(connector.settings.query_syntax && {
            query_syntax: JSON.stringify(
              connector.settings.query_syntax,
              null,
              2,
            ),
          }),
        },
        connector: connector,
      });

      setCurrentStepIndex(1);
      setTesting(false);
    }

    if (testing && selectedConnector) {
      connect(selectedConnector);
    }
  }, [testing, selectedConnector]);

  return (
    <div className={classes.modalContainer}>
      <div className={classes.stepTracker}>
        <ProgressIndicator currentIndex={currentStepIndex} vertical={true}>
          <ProgressStep label="1. Connect" />
          <ProgressStep label="2. Configure" />
        </ProgressIndicator>
      </div>
      <div className={classes.step}>
        {currentStepIndex === 0 ? (
          <>
            <h4>Connections</h4>
            <div className={classes.retrieverSelectors}>
              {connectors.map((connector) => (
                <RadioTile
                  key={`formatSelector__retriever--${connector.name}`}
                  id={`formatSelector__retriever--${connector.name}`}
                  value={`${connector.name}`}
                  checked={selectedConnector.name === `${connector.name}`}
                  onChange={() => {
                    setSelectedConnector(connector);
                    // Clear any previous collection-miss error when the researcher
                    // selects a different retriever.
                    setMissingCollections([]);
                  }}
                  disabled={connector.disabled}
                >
                  <div className={classes.retrieverSelector}>
                    <span className={classes.retrieverSelectorTitle}>
                      {connector.name}
                    </span>
                    {connector.description ? (
                      <span className={classes.retrieverSelectorDescription}>
                        {truncate(connector.description, 200)}
                      </span>
                    ) : null}
                    {connector.tags ? (
                      <div className={classes.retrieverSelectorTags}>
                        {connector.tags.map((tag) => (
                          <Tag key={`retriever--${tag}`}>{tag}</Tag>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </RadioTile>
              ))}
            </div>
            {/* Pre-connect hint — shown before the researcher clicks Connect */}
            <div className={classes.warningContainer}>
              <WarningAlt size={24} />
              <span className={classes.warningText}>
                Please make sure that
                {collectionNames && !isEmpty(collectionNames)
                  ? ` following collection${collectionNames.length > 1 ? `s (${collectionNames.join('", "')}) are ` : ` ("${collectionNames[0]}") is`} `
                  : ' all collections associated with dataset are'}
                available to the retriever.
              </span>
            </div>
            {/* Post-connect error — shown only when collections were found missing */}
            {missingCollections.length > 0 ? (
              <div className={classes.collectionError}>
                <InlineNotification
                  kind="error"
                  title="Missing collections"
                  subtitle={`The following collection${missingCollections.length > 1 ? 's are' : ' is'} not available on this retriever: ${missingCollections.join(', ')}. Choose a different retriever or create the missing collection${missingCollections.length > 1 ? 's' : ''} before continuing.`}
                  hideCloseButton
                />
              </div>
            ) : null}
            {selectedConnector.credentials.provider === 'client' ? (
              <>
                <TextInput
                  id="retriever__endpoint--input"
                  labelText="Endpoint"
                  invalid={isEmpty(selectedConnector.endpoint)}
                  invalidText="Retriever endpoint must be specified."
                  onChange={(event) => {
                    setSelectedConnector({
                      ...selectedConnector,
                      endpoint: event.target.value.trim(),
                    });
                  }}
                />
                <div className={classes.retrieverLoginTypeSelectors}>
                  <RadioTile
                    id="retrieverLoginTypeSelector--username"
                    value="username"
                    checked={retrieverLoginType === 'username'}
                    onChange={() => setRetrieverLoginType('username')}
                  >
                    Username
                  </RadioTile>
                  <RadioTile
                    id="retrieverLoginTypeSelector--api_key"
                    value="api_key"
                    checked={retrieverLoginType === 'api_key'}
                    onChange={() => setRetrieverLoginType('api_key')}
                  >
                    API Key
                  </RadioTile>
                </div>
                {retrieverLoginType === 'username' ? (
                  <>
                    <TextInput
                      id="retriever__login-username--input"
                      labelText="Username"
                      value={selectedConnector.credentials.username ?? ''}
                      invalid={isEmpty(selectedConnector.credentials.username)}
                      invalidText="Username must be specified."
                      onChange={(event) => {
                        setSelectedConnector({
                          ...selectedConnector,
                          credentials: {
                            ...selectedConnector.credentials,
                            username: event.target.value.trim(),
                          },
                        });
                      }}
                    />
                    <PasswordInput
                      id="retriever__login-password--input"
                      labelText="Password"
                      value={selectedConnector.credentials.password ?? ''}
                      showPasswordLabel="Show password"
                      hidePasswordLabel="Hide password"
                      invalid={isEmpty(selectedConnector.credentials.password)}
                      invalidText="Password must be specified."
                      onChange={(event) => {
                        setSelectedConnector({
                          ...selectedConnector,
                          credentials: {
                            ...selectedConnector.credentials,
                            password: event.target.value.trim(),
                          },
                        });
                      }}
                    />
                  </>
                ) : (
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
                )}
              </>
            ) : null}
            <Button onClick={() => setTesting(true)} disabled={testing}>
              {testing ? 'Connecting…' : 'Connect'}
            </Button>
          </>
        ) : currentStepIndex === 1 && retriever ? (
          <>
            <RetrieverSettings
              loading={testing}
              retriever={retriever}
              onChange={(updatedParameters) => {
                setRetriever({ ...retriever, settings: updatedParameters });
              }}
              defaults={{
                ...selectedConnector.settings,
                ...(selectedConnector.settings.query_syntax && {
                  query_syntax: JSON.stringify(
                    selectedConnector.settings.query_syntax,
                    null,
                    2,
                  ),
                }),
              }}
            />
            <div className={classes.configuratorNav}>
              <Button
                kind="secondary"
                onClick={() => {
                  setCurrentStepIndex(0);
                  setRetriever(undefined);
                }}
              >
                Back
              </Button>
              <Button onClick={() => onNext(retriever)}>Continue</Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GeneratorConfigurator({
  connectors,
  onException,
  onNext,
}: {
  connectors: GeneratorConfig[];
  onException: (notification: Notification) => void;
  onNext: (generator: ActiveGenerator) => void;
}) {
  const [testing, setTesting] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [selectedConnector, setSelectedConnector] = useState<GeneratorConfig>(
    connectors[0],
  );

  const [generators, setGenerators] = useState<ActiveGenerator[]>([]);
  const [selectedGenerator, setSelectedGenerator] = useState<
    ActiveGenerator | undefined
  >(undefined);

  // selectedConnector is included in deps — the closure captures the connector value
  // at click time; stale ref would silently test the wrong provider.
  useEffect(() => {
    async function connect(connector: GeneratorConfig) {
      // Store credentials in session before calling the API if they are client-managed.
      // No-auth connectors skip the store (nothing to store) — avoids the cookie race.
      if (
        connector.credentials.provider === 'client' &&
        connector.authentication !== 'none'
      ) {
        const { storeConnectorCredentials } =
          await import('@/src/common/utilities/credentials');
        await storeConnectorCredentials(undefined, {
          [connector.name]: {
            endpoint: connector.endpoint,
            api_key: connector.credentials.api_key,
            project_id: connector.credentials.project_id,
          },
        });
      }

      const params = new URLSearchParams({
        connector_name: connector.name,
        provider: connector.credentials.provider,
      });
      // No-auth connectors may override the config endpoint (SSRF-guarded server-side).
      if (connector.authentication === 'none' && connector.endpoint) {
        params.set('endpoint', connector.endpoint);
      }

      const response = await fetch(`/api/models?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        onException({
          title: 'Failed to connect to a generator',
          subtitle:
            'Please verify your credentials for generator and try again.',
          kind: 'error',
          timeout: 10000,
        });
        setTesting(false);
        return;
      }

      const models = await response.json();

      // Prefer supported_modes array; fall back to 'completion' if absent.
      // A connector that only lists 'chat_completion' cannot run completion mode.
      const supportedModes = connector.settings.supported_modes;
      const initialMode: 'completion' | 'chat_completion' =
        supportedModes && !supportedModes.includes('completion')
          ? 'chat_completion'
          : 'completion';

      const fetched: ActiveGenerator[] = models.map((model) => ({
        ...model,
        mode: initialMode,
        settings: {
          prompt: connector.settings.prompt,
          parameters: connector.settings.parameters,
        },
        connector: connector,
      }));

      setGenerators(fetched);
      setSelectedGenerator(fetched[0]);
      setCurrentStepIndex(1);
      setTesting(false);
    }

    if (testing && selectedConnector) {
      connect(selectedConnector);
    }
  }, [testing, selectedConnector]);

  return (
    <div className={classes.modalContainer}>
      <div className={classes.stepTracker}>
        <ProgressIndicator currentIndex={currentStepIndex} vertical={true}>
          <ProgressStep label="1. Connect" />
          <ProgressStep label="2. Configure" />
        </ProgressIndicator>
      </div>
      <div className={classes.step}>
        {currentStepIndex === 0 ? (
          <>
            <h4>Connections</h4>
            <div
              className={cx(classes.generatorSelectors, {
                [classes.generatorSelectorsGrid]: connectors.length > 4,
              })}
            >
              {connectors.map((connector) => (
                <RadioTile
                  key={`formatSelector__generator--${connector.name}`}
                  id={`formatSelector__generator--${connector.name}`}
                  value={`${connector.name}`}
                  checked={selectedConnector.name === `${connector.name}`}
                  onChange={() => setSelectedConnector(connector)}
                  disabled={connector.disabled}
                >
                  <div className={classes.generatorSelector}>
                    <span className={classes.generatorSelectorTitle}>
                      {connector.name}
                    </span>
                    {connector.description ? (
                      <span className={classes.generatorSelectorDescription}>
                        {truncate(connector.description, 200)}
                      </span>
                    ) : null}
                    {connector.tags ? (
                      <div className={classes.generatorSelectorTags}>
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
            {selectedConnector.credentials.provider === 'client' &&
            selectedConnector.authentication !== 'none' ? (
              <PasswordInput
                id="generator-api-key--input"
                labelText="API Key"
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
            {/* No-auth connectors (e.g. Ollama) may override the config endpoint. */}
            {selectedConnector.authentication === 'none' ? (
              <TextInput
                id="generator-endpoint--input"
                labelText="Endpoint"
                value={selectedConnector.endpoint ?? ''}
                helperText="Optional — defaults to the configured local endpoint."
                onChange={(event) => {
                  setSelectedConnector({
                    ...selectedConnector,
                    endpoint: event.target.value.trim(),
                  });
                }}
              />
            ) : null}
            <Button onClick={() => setTesting(true)} disabled={testing}>
              {testing ? 'Connecting…' : 'Connect'}
            </Button>
          </>
        ) : currentStepIndex === 1 &&
          generators.length > 0 &&
          selectedGenerator ? (
          <>
            <Select
              id="generator-selector"
              labelText="Choose a model"
              onChange={(event) => {
                const generator = generators.find(
                  (entry) => entry.id === event.target.value,
                );
                if (generator) {
                  setSelectedGenerator({
                    ...generator,
                    settings: selectedGenerator?.settings ?? generator.settings,
                  });
                }
              }}
              defaultValue={selectedGenerator.id}
            >
              {generators.map((generator) => (
                <SelectItem
                  key={`${generator.id}-selector`}
                  value={generator.id}
                  text={generator.name}
                />
              ))}
            </Select>
            <GeneratorSettings
              loading={testing}
              generator={selectedGenerator}
              defaults={{
                prompt: selectedConnector.settings.prompt,
                parameters: selectedConnector.settings.parameters,
              }}
              onChange={(generator) => {
                if (selectedGenerator) {
                  setSelectedGenerator({ ...selectedGenerator, ...generator });
                }
              }}
            />
            <div className={classes.configuratorNav}>
              <Button
                kind="secondary"
                onClick={() => {
                  setCurrentStepIndex(0);
                  setGenerators([]);
                  setSelectedGenerator(undefined);
                }}
              >
                Back
              </Button>
              <Button onClick={() => onNext(selectedGenerator)}>
                Continue
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// --- Confirm step (shared across all componentToTest values) ---

function ConfirmStep({
  defaultName,
  existingPipelineNames,
  user,
  pipelineName,
  description,
  onChangeName,
  onChangeDescription,
}: {
  defaultName: string;
  existingPipelineNames: string[];
  user: User;
  pipelineName: string;
  description: string;
  onChangeName: (name: string) => void;
  onChangeDescription: (desc: string) => void;
}) {
  const nameInvalid =
    isEmpty(pipelineName) || existingPipelineNames.includes(pipelineName);
  const nameInvalidText = isEmpty(pipelineName)
    ? 'Pipeline name cannot be empty'
    : 'A pipeline with this name already exists';

  return (
    <div className={classes.step}>
      <TextInput
        id="pipeline-name--input"
        labelText="Name"
        placeholder={defaultName}
        value={pipelineName}
        invalid={nameInvalid}
        invalidText={nameInvalidText}
        onChange={(event) => onChangeName(event.target.value)}
      />
      <TextInput
        id="pipeline-author--input"
        labelText="Author"
        value={user.username}
        disabled={true}
      />
      <TextInput
        id="pipeline-description--input"
        labelText="Description"
        value={description}
        onChange={(event) => onChangeDescription(event.target.value)}
      />
    </div>
  );
}

// --- Step label helpers ---

const STEP_LABELS: Record<WizardStep, string> = {
  retriever: 'Retriever',
  generator: 'Generator',
  confirm: 'Confirm',
};

const STEP_SECONDARY_LABELS: Partial<Record<WizardStep, string>> = {
  retriever: 'Configure retriever',
  generator: 'Configure generator',
};

// --- Main component ---

export default function NewPipeline({
  user,
  name,
  systemConfiguration,
  componentToTest,
  existingPipelineNames,
  open,
  onAdd,
  onClose,
  collectionNames,
}: Props) {
  const [pipelineName, setPipelineName] = useState<string>(name);
  const [description, setDescription] = useState<string>('');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [retriever, setRetriever] = useState<ActiveRetriever | undefined>();
  const [generator, setGenerator] = useState<ActiveGenerator | undefined>();

  const { createNotification } = useNotification();

  // Derive the ordered wizard steps from componentToTest once — a single source of
  // truth that drives both the ProgressIndicator and the step dispatcher below.
  const steps: WizardStep[] =
    componentToTest === 'both'
      ? ['retriever', 'generator', 'confirm']
      : componentToTest === 'retriever'
        ? ['retriever', 'confirm']
        : ['generator', 'confirm'];

  const nameInvalid =
    isEmpty(pipelineName) || existingPipelineNames.includes(pipelineName);

  // Whether the configured components satisfy what componentToTest requires.
  const componentsReady =
    ((componentToTest === 'retriever' || componentToTest === 'both') &&
      retriever === undefined) ||
    ((componentToTest === 'generator' || componentToTest === 'both') &&
      generator === undefined)
      ? false
      : true;

  const addDisabled = !componentsReady || nameInvalid;

  return (
    <Modal
      open={open}
      size="lg"
      modalLabel="Add pipeline"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        onAdd({
          name: pipelineName,
          author: user.username,
          ...(!isEmpty(description) && {
            description: description as unknown as number,
          }),
          timestamp: Math.floor(Date.now() / 1000),
          retriever: retriever,
          generator: generator,
        });
        onClose();
      }}
      onRequestClose={onClose}
      primaryButtonDisabled={addDisabled}
    >
      <div className={classes.progressTracker}>
        <ProgressIndicator
          currentIndex={currentStepIndex}
          spaceEqually={true}
          onChange={(stepIndex) => setCurrentStepIndex(stepIndex)}
        >
          {steps.map((step) => (
            <ProgressStep
              key={step}
              label={STEP_LABELS[step]}
              secondaryLabel={STEP_SECONDARY_LABELS[step]}
            />
          ))}
        </ProgressIndicator>
      </div>

      {steps[currentStepIndex] === 'retriever' ? (
        <RetrieverConfigurator
          connectors={systemConfiguration.retrievers}
          onException={createNotification}
          onNext={(r) => {
            setRetriever(r);
            setCurrentStepIndex((i) => i + 1);
          }}
          collectionNames={collectionNames}
        />
      ) : steps[currentStepIndex] === 'generator' ? (
        <GeneratorConfigurator
          connectors={systemConfiguration.generators}
          onException={createNotification}
          onNext={(g) => {
            setGenerator(g);
            setCurrentStepIndex((i) => i + 1);
          }}
        />
      ) : (
        <ConfirmStep
          defaultName={name}
          existingPipelineNames={existingPipelineNames}
          user={user}
          pipelineName={pipelineName}
          description={description}
          onChangeName={setPipelineName}
          onChangeDescription={setDescription}
        />
      )}
    </Modal>
  );
}

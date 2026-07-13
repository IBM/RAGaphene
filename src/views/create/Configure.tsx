/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { isEmpty } from 'lodash';
import { useState, useEffect } from 'react';
import {
  TextInput,
  PasswordInput,
  Button,
  RadioTile,
  Tag,
  Loading,
  ClickableTile,
} from '@carbon/react';
import { ArrowRight, Add, Upload } from '@carbon/icons-react';
import ConnectorTag from '@/src/components/connector-tag/ConnectorTag';

import {
  SystemConfiguration,
  Notification,
  RetrieverConfig,
  GeneratorConfig,
  SelectedConnectors,
  Conversation,
} from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';
import { useNotification } from '@/src/components/notification/Notification';
import ConversationUploader from '@/src/views/create/ConversationUploader';
import LocalCollectionsManager from '@/src/components/local-collections/LocalCollectionsManager';

import classes from './Configure.module.scss';
// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  systemConfiguration: SystemConfiguration;
  onProceed: Function;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function RetrieverConfigurator({
  connectors,
  selectedConnector,
  onSelect,
  onUpdate,
  onChange,
}: {
  connectors: RetrieverConfig[];
  selectedConnector: RetrieverConfig;
  onSelect: Function;
  onUpdate: Function;
  onChange: Function;
}) {
  // Step 1: Initialize state and necessary variables
  const [retrieverLoginType, setRetrieverLoginType] = useState<
    'username' | 'api_key'
  >(selectedConnector.credentials.api_key ? 'api_key' : 'username');

  // Step 2: Render
  return (
    <div className={classes.retrieverConfigurations}>
      <h4>Retriever</h4>
      <div className={classes.retrieverSelectors}>
        {connectors.map((connector) => (
          <RadioTile
            key={`formatSelector__retriever--${connector.name}`}
            id={`formatSelector__retriever--${connector.name}`}
            value={`${connector.name}`}
            checked={selectedConnector.name === `${connector.name}`}
            onChange={() => onSelect(connector)}
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
                    <ConnectorTag key={`retriever__tag--${tag}`} tag={tag} />
                  ))}
                </div>
              ) : null}
            </div>
          </RadioTile>
        ))}
      </div>
      {selectedConnector.provider === 'local' ? (
        <LocalCollectionsManager onChange={onChange} />
      ) : selectedConnector.credentials.provider === 'client' ? (
        <>
          <TextInput
            id="retriever__endpoint--input"
            labelText="Endpoint"
            value={selectedConnector.endpoint}
            invalid={isEmpty(selectedConnector.endpoint)}
            invalidText={'Retriever endpoint must be specified.'}
            onChange={(event) => {
              onUpdate({
                ...selectedConnector,
                endpoint: event.target.value.trim(),
              });
            }}
          />
          <div className={classes.retrieverLoginTypeSelectors}>
            <RadioTile
              id={'retrieverLoginTypeSelector--username'}
              value={'username'}
              checked={retrieverLoginType === 'username'}
              onChange={() => {
                setRetrieverLoginType('username');
              }}
            >
              Username
            </RadioTile>
            <RadioTile
              id={'retrieverLoginTypeSelector--api_key'}
              value={'api_key'}
              checked={retrieverLoginType === 'api_key'}
              onChange={() => {
                setRetrieverLoginType('api_key');
              }}
            >
              API Key
            </RadioTile>
          </div>
          {retrieverLoginType === 'username' ? (
            <>
              <TextInput
                id="retriever__login-username--input"
                labelText="Username"
                value={
                  selectedConnector.credentials.username
                    ? selectedConnector.credentials.username
                    : ''
                }
                invalid={isEmpty(selectedConnector.credentials.username)}
                invalidText={'Username must be specified.'}
                onChange={(event) => {
                  onUpdate({
                    ...selectedConnector,
                    credentials: {
                      ...selectedConnector.credentials,
                      username: event.target.value.trim(),
                    },
                  });
                }}
              />
              {
                <PasswordInput
                  id="retriever__login-password--input"
                  labelText="Password"
                  value={
                    selectedConnector.credentials.password
                      ? selectedConnector.credentials.password
                      : ''
                  }
                  showPasswordLabel="Show password"
                  hidePasswordLabel="Hide password"
                  invalid={isEmpty(selectedConnector.credentials.password)}
                  invalidText={'Password must be specified.'}
                  onChange={(event) => {
                    onUpdate({
                      ...selectedConnector,
                      credentials: {
                        ...selectedConnector.credentials,
                        password: event.target.value.trim(),
                      },
                    });
                  }}
                />
              }
            </>
          ) : (
            <PasswordInput
              id="retriever__login-api-key--input"
              labelText="API Key"
              value={
                selectedConnector.credentials.api_key
                  ? selectedConnector.credentials.api_key
                  : ''
              }
              showPasswordLabel="Show API key"
              hidePasswordLabel="Hide API key"
              invalid={isEmpty(selectedConnector.credentials.api_key)}
              invalidText={'API Key must be specified.'}
              onChange={(event) => {
                onUpdate({
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
    </div>
  );
}

function GeneratorConfigurator({
  connectors,
  selectedConnector,
  onSelect,
  onUpdate,
}: {
  connectors: GeneratorConfig[];
  selectedConnector: GeneratorConfig;
  onSelect: Function;
  onUpdate: Function;
}) {
  return (
    <div className={classes.generatorConfigurations}>
      <h4>Generator</h4>
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
            onChange={() => onSelect(connector)}
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
                    <ConnectorTag key={`generator__tag--${tag}`} tag={tag} />
                  ))}
                </div>
              ) : null}
            </div>
          </RadioTile>
        ))}
      </div>
      {selectedConnector.authentication === 'none' ? (
        // No-auth connectors (e.g. Ollama) need only an optional endpoint override.
        <TextInput
          id="generator__endpoint--input"
          labelText="Endpoint"
          value={selectedConnector.endpoint ?? ''}
          helperText="Optional — defaults to the configured local endpoint."
          onChange={(event) => {
            onUpdate({
              ...selectedConnector,
              endpoint: event.target.value.trim(),
            });
          }}
        />
      ) : selectedConnector.credentials.provider === 'client' ? (
        <>
          {
            <PasswordInput
              id="generator__api-key--input"
              labelText="API Key"
              showPasswordLabel="Show API key"
              hidePasswordLabel="Hide API key"
              value={
                selectedConnector.credentials.api_key
                  ? selectedConnector.credentials.api_key
                  : ''
              }
              invalid={isEmpty(selectedConnector.credentials.api_key)}
              invalidText={'API Key must be specified.'}
              onChange={(event) => {
                onUpdate({
                  ...selectedConnector,
                  credentials: {
                    ...selectedConnector.credentials,
                    api_key: event.target.value.trim(),
                  },
                });
              }}
            />
          }
          {selectedConnector.name === 'WatsonX.AI' ? (
            // @ts-ignore
            <TextInput
              id="generator__project-id-input"
              labelText="Project ID"
              value={
                selectedConnector.credentials.project_id
                  ? selectedConnector.credentials.project_id
                  : ''
              }
              invalid={isEmpty(selectedConnector.credentials.project_id)}
              invalidText={'Project ID must be specified.'}
              onChange={(event) => {
                onUpdate({
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
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Configure({ systemConfiguration, onProceed }: Props) {
  // Step 1: Initialize state and necessary variables
  const [loading, setLoading] = useState<boolean>(false);
  const [exceptions, setExceptions] = useState<Notification[]>([]);
  const [continueConversation, setContinueConversation] = useState<boolean>();
  const [conversation, setConversation] = useState<Conversation>();

  const [application, setApplication] = useState<
    SelectedConnectors | undefined
  >(undefined);
  const [disabled, setDisabled] = useState<boolean>(!continueConversation);
  const [disableProcced, setDisableProcced] = useState<boolean>(false);

  // Step 2: Run effects
  // Step 2.a: Setup notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Update connector
  useEffect(() => {
    setApplication({
      retriever: systemConfiguration.retrievers[0],
      generator: systemConfiguration.generators[0],
    });
  }, [systemConfiguration.retrievers, systemConfiguration.generators]);

  // Step 2.c: Verify connectivity to retriever and generator in uploaded conversation
  useEffect(() => {
    if (conversation) {
      // Step 2.b.i: Initialize necessary variables
      let retriever, generator;

      // Step 2.b.ii: Verify retriever connectivity
      if (
        conversation.retriever &&
        conversation.retriever.connector &&
        conversation.retriever.connector.name
      ) {
        const retrieverName = conversation.retriever?.connector.name;

        retriever = systemConfiguration.retrievers.find(
          (entry) => entry.name === retrieverName,
        );

        if (!retriever || retriever.credentials.provider !== 'server') {
          createNotification({
            title: 'Failed to connect to a retriever',
            subtitle: 'You cannot continue this conversation.',
            kind: 'error',
            timeout: 10000,
          });

          setDisabled(true);
        }
      } else {
        createNotification({
          title: 'Missing retriever connectivity details',
          subtitle: 'You cannot continue this conversation.',
          kind: 'error',
          timeout: 10000,
        });

        setDisabled(true);
      }

      // Step 2.b.iii: Verify generator connectivity
      if (
        conversation.generator &&
        conversation.generator.connector &&
        conversation.generator.connector.name
      ) {
        generator = systemConfiguration.generators.find(
          (entry) => entry.name === conversation.generator?.connector.name,
        );
        if (!generator || generator.credentials.provider !== 'server') {
          createNotification({
            title: 'Failed to connect to a generator',
            subtitle: 'You cannot continue this conversation.',
            kind: 'error',
            timeout: 10000,
          });

          setDisabled(true);
        }
      } else {
        createNotification({
          title: 'Missing generator connectivity details',
          subtitle: 'You cannot continue this conversation.',
          kind: 'error',
          timeout: 10000,
        });

        setDisabled(true);
      }

      // Step 2.b.iv: Update connector with retriever and generator details from the conversation
      if (retriever && generator) {
        setApplication({
          retriever: retriever,
          generator: generator,
        });

        // Step 2.b.v: Enable user to proceed to next step
        setDisabled(false);
      }
    }
  }, [conversation]);

  // Step 2.d: Verify connectivity to selected retriever and generator
  useEffect(() => {
    async function is_accessible(application: SelectedConnectors) {
      const exceptions: Notification[] = [];

      // Step 2.c.i: For connector with 'custom' provider
      if (application) {
        // Store credentials in session if client-managed. No-auth connectors
        // skip the store and resolve from config server-side.
        if (
          application.retriever.credentials.provider === 'client' &&
          application.retriever.authentication !== 'none'
        ) {
          const { storeConnectorCredentials } =
            await import('@/src/common/utilities/credentials');
          await storeConnectorCredentials(
            {
              [application.retriever.name]: {
                endpoint: application.retriever.endpoint,
                credentials: application.retriever.credentials,
              },
            },
            undefined,
          );
        }

        // Verify connectivity to retriever by fetching the live collections list.
        // When resuming a conversation we also check the saved collection name is
        // still present — a connector may be reachable but its index deleted.
        const retrieverParams = new URLSearchParams({
          connector_name: application.retriever.name,
          provider: application.retriever.credentials.provider,
        });

        const collectionsRes = await fetch(
          `/api/collections?${retrieverParams.toString()}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        );

        if (!collectionsRes.ok) {
          exceptions.push({
            title: 'Failed to connect to a retriever',
            subtitle:
              'Please verify your credentials for retriever and try again.',
            kind: 'error',
            timeout: 10000,
          });
        } else {
          const fetchedCollections: { name: string }[] =
            await collectionsRes.json();
          const savedCollectionName = conversation?.retriever?.collection?.name;
          if (
            savedCollectionName &&
            !fetchedCollections.some((c) => c.name === savedCollectionName)
          ) {
            exceptions.push({
              title: 'Collection no longer available',
              subtitle: `"${savedCollectionName}" was not found on this retriever. You cannot continue this conversation.`,
              kind: 'error',
              timeout: 10000,
            });
          }
        }

        // Store credentials in session if client-managed. No-auth connectors
        // skip the store and resolve from config server-side.
        if (
          application.generator.credentials.provider === 'client' &&
          application.generator.authentication !== 'none'
        ) {
          const { storeConnectorCredentials } =
            await import('@/src/common/utilities/credentials');
          await storeConnectorCredentials(undefined, {
            [application.generator.name]: {
              endpoint: application.generator.endpoint,
              api_key: application.generator.credentials.api_key,
              project_id: application.generator.credentials.project_id,
            },
          });
        }

        // Verify connectivity to generator by fetching the live models list.
        // When resuming a conversation we also check the saved model id is still
        // present — a provider may be reachable but a specific model deprecated.
        const generatorParams = new URLSearchParams({
          connector_name: application.generator.name,
          provider: application.generator.credentials.provider,
        });
        // No-auth connectors may override the config endpoint (SSRF-guarded server-side).
        if (
          application.generator.authentication === 'none' &&
          application.generator.endpoint
        ) {
          generatorParams.set('endpoint', application.generator.endpoint);
        }

        const modelsRes = await fetch(
          `/api/models?${generatorParams.toString()}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        );

        if (!modelsRes.ok) {
          exceptions.push({
            title: 'Failed to connect to a generator',
            subtitle:
              'Please verify your credentials for generator and try again.',
            kind: 'error',
            timeout: 10000,
          });
        } else {
          const fetchedModels: { id: string }[] = await modelsRes.json();
          const savedModelId = conversation?.generator?.id;
          if (
            savedModelId &&
            !fetchedModels.some((m) => m.id === savedModelId)
          ) {
            exceptions.push({
              title: 'Model no longer available',
              subtitle: `"${conversation?.generator?.name ?? savedModelId}" was not found on this generator. You cannot continue this conversation.`,
              kind: 'error',
              timeout: 10000,
            });
          }
        }
      }

      // Step 2.c.iii: If connectivity is verified without exceptions
      if (isEmpty(exceptions)) {
        // Set Loading to false
        setLoading(false);

        // Proceed to creating conversation
        onProceed(application, conversation);
      } else {
        // Set exceptions
        setExceptions(exceptions);

        // Set Loading to false
        setLoading(false);
      }
    }

    if (loading && application) {
      is_accessible(application);
    }
  }, [loading]);

  // Step 2.e: Generate notification for each exception
  useEffect(() => {
    exceptions.forEach((exception) => createNotification(exception));
  }, [exceptions]);

  // Step 3: Derive disabled states for each mode's Proceed button.
  // No-auth connectors (e.g. Ollama) carry no credentials, so they never gate Proceed.
  const generatorCredsInvalid =
    application?.generator.credentials.provider === 'client' &&
    application.generator.authentication !== 'none'
      ? isEmpty(application.generator.credentials.api_key)
      : false;

  const retrieverCredsInvalid =
    application?.retriever.credentials.provider === 'client' &&
    application.retriever.authentication !== 'none'
      ? (isEmpty(application.retriever.credentials.username) ||
          isEmpty(application.retriever.credentials.password)) &&
        isEmpty(application.retriever.credentials.api_key)
      : false;

  const newConversationProceedDisabled =
    loading ||
    !application ||
    generatorCredsInvalid ||
    retrieverCredsInvalid ||
    disableProcced;

  const continueConversationProceedDisabled =
    loading || !application || !conversation;

  // Step 4: Render
  return (
    <div className={classes.page}>
      {loading ? <Loading /> : null}
      <h2 className={classes.title}>Let's get you set up</h2>
      {application ? (
        <>
          <div className={classes.modeSelectorGroup}>
            <ClickableTile
              id="mode-selector--new"
              className={cx(
                classes.modeTile,
                continueConversation === false
                  ? classes.modeTileSelected
                  : null,
              )}
              onClick={() => {
                setContinueConversation(false);
                setDisabled(false);
                setConversation(undefined);
              }}
            >
              <div className={classes.modeTileContent}>
                <Add size={24} className={classes.modeTileIcon} />
                <div className={classes.modeTileText}>
                  <span className={classes.modeTileTitle}>
                    New Conversation
                  </span>
                  <span className={classes.modeTileDescription}>
                    Start fresh with a new retriever and generator
                    configuration.
                  </span>
                </div>
              </div>
            </ClickableTile>
            <ClickableTile
              id="mode-selector--continue"
              className={cx(
                classes.modeTile,
                continueConversation === true ? classes.modeTileSelected : null,
              )}
              onClick={() => {
                setContinueConversation(true);
                setDisabled(true);
                setConversation(undefined);
              }}
            >
              <div className={classes.modeTileContent}>
                <Upload size={24} className={classes.modeTileIcon} />
                <div className={classes.modeTileText}>
                  <span className={classes.modeTileTitle}>
                    Continue Conversation
                  </span>
                  <span className={classes.modeTileDescription}>
                    Upload an existing conversation to continue where you left
                    off.
                  </span>
                  <Tag type="magenta" className={classes.modeTileTag}>
                    Beta
                  </Tag>
                </div>
              </div>
            </ClickableTile>
          </div>
          {continueConversation === true ? (
            <div className={classes.modeContent}>
              <ConversationUploader onUpload={setConversation} />
              <Button
                id="on-boarding--submit-btn"
                renderIcon={ArrowRight}
                disabled={continueConversationProceedDisabled}
                onClick={() => setLoading(true)}
              >
                Proceed
              </Button>
            </div>
          ) : continueConversation === false ? (
            <div className={classes.modeContent}>
              <RetrieverConfigurator
                connectors={systemConfiguration.retrievers}
                selectedConnector={application.retriever}
                onSelect={(selectedRetriever) => {
                  if (selectedRetriever.provider !== 'local') {
                    setDisableProcced(false);
                  }
                  setApplication({
                    ...application,
                    retriever: selectedRetriever,
                  });
                }}
                onUpdate={(updatedRetriever) => {
                  setApplication({
                    ...application,
                    retriever: updatedRetriever,
                  });
                }}
                onChange={(disable) => {
                  setDisableProcced(disable);
                }}
              />
              <GeneratorConfigurator
                connectors={systemConfiguration.generators}
                selectedConnector={application.generator}
                onSelect={(selectedGenerator) => {
                  setApplication({
                    ...application,
                    generator: selectedGenerator,
                  });
                }}
                onUpdate={(updatedGenerator) => {
                  setApplication({
                    ...application,
                    generator: updatedGenerator,
                  });
                }}
              />
              <Button
                id="on-boarding--submit-btn"
                renderIcon={ArrowRight}
                disabled={newConversationProceedDisabled}
                onClick={() => setLoading(true)}
              >
                Proceed
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

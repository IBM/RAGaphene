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
} from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';

import {
  SystemConfiguration,
  Notification,
  RetrieverConfig,
  GeneratorConfig,
  SelectedConnectors,
} from '@/types/custom';
import { truncate } from '@/src/common/utilities/string';
import { useNotification } from '@/src/components/notification/Notification';

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
}: {
  connectors: RetrieverConfig[];
  selectedConnector: RetrieverConfig;
  onSelect: Function;
  onUpdate: Function;
}) {
  // Step 1: Initialize state and necessary variables
  const [retrieverLoginType, setRetrieverLoginType] = useState<
    'username' | 'api_key'
  >('username');

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
                    <Tag key={`retriever--${tag}`}>{tag}</Tag>
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
            id="retriever__endpoint--input"
            labelText="Endpoint"
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
                    <Tag key={`generator__tag--${tag}`}>{tag}</Tag>
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
          id="generator-endpoint--input"
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
              id="generator-api-key--input"
              labelText="API Key"
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
          }
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
  const [application, setApplication] = useState<
    SelectedConnectors | undefined
  >(undefined);

  // Step 2: Run effects
  // Step 2.a: Setup notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Verify connectivity to selected retriever and generator
  useEffect(() => {
    async function is_accessible(application: SelectedConnectors) {
      const exceptions: Notification[] = [];
      if (application) {
        // Store retriever credentials in session if client-managed. No-auth
        // connectors skip the store and resolve from config server-side.
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

        // Step 1: Verify connectivity to retriever
        const retrieverParams = new URLSearchParams({
          connector_name: application.retriever.name,
          provider: application.retriever.credentials.provider,
        });

        await fetch(`/api/collections?${retrieverParams.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // No Authorization header - credentials in secure session
          },
        }).then(async (response) => {
          // Step 2.c.i.**: If not successful
          if (response.status != 200) {
            exceptions.push({
              title: 'Failed to connect to a retriever',
              subtitle:
                'Please verify your credentials for retriever and try again.',
              kind: 'error',
              timeout: 10000,
            });
          }
        });

        // Store generator credentials in session if client-managed. No-auth
        // connectors skip the store and resolve from config server-side.
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

        // Step 2: Verify connectivity to generator
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

        await fetch(`/api/models?${generatorParams.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // No Authorization header - credentials in secure session
          },
        }).then(async (response) => {
          // Step 2.d.i.**: If unsuccessful
          if (response.status !== 200) {
            exceptions.push({
              title: 'Failed to connect to a generator',
              subtitle:
                'Please verify your credentials for generator and try again.',
              kind: 'error',
              timeout: 10000,
            });
          }
        });
      }

      if (isEmpty(exceptions)) {
        // Set Loading to false
        setLoading(false);

        // Proceed to conversations
        onProceed(application);
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

  // Step 2.c: Generate notification for each exception
  useEffect(() => {
    exceptions.forEach((exception) => createNotification(exception));
  }, [exceptions]);

  // Step 3: Render
  return (
    <div className={classes.page}>
      {loading ? <Loading /> : null}
      <h2 className={classes.title}>
        Few quick configurations before we get you going ...
      </h2>
      {application ? (
        <>
          <RetrieverConfigurator
            connectors={systemConfiguration.retrievers}
            selectedConnector={application.retriever}
            onSelect={(selectedRetriever) => {
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
        </>
      ) : null}

      <Button
        id="on-boarding--submit-btn"
        renderIcon={ArrowRight}
        disabled={
          loading ||
          !application ||
          (application.generator.credentials.provider === 'client'
            ? isEmpty(application.generator.credentials.api_key)
            : false) ||
          (application.retriever.credentials.provider === 'client'
            ? (isEmpty(application.retriever.credentials.username) ||
                isEmpty(application.retriever.credentials.password)) &&
              isEmpty(application.retriever.credentials.api_key)
            : false)
        }
        onClick={() => setLoading(true)}
      >
        Proceed
      </Button>
    </div>
  );
}

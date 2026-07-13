/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { isEmpty, isEqual } from 'lodash';
import { useState, useEffect } from 'react';

import { Upload, Close, Save, Reset } from '@carbon/icons-react';
import {
  TextInput,
  PasswordInput,
  RadioTile,
  Button,
  Modal,
  FileUploader,
  CodeSnippet,
} from '@carbon/react';

import ConnectorTag from '@/src/components/connector-tag/ConnectorTag';

import {
  Connector,
  RetrieverConfig,
  GeneratorConfig,
  Notification,
} from '@/types/custom';

import sample_settings from '@/src/common/data/sample_settings.json';
import { truncate } from '@/src/common/utilities/string';
import { useConfiguration } from '@/src/common/state/configuration';
import { storeConnectorCredentials } from '@/src/common/utilities/credentials';
import { useNotification } from '@/src/components/notification/Notification';

import classes from './Settings.module.scss';

// --- Types ---

interface Props {
  open: boolean;
  onClose: () => void;
}

// ConnectorCredentials shape as expected by storeConnectorCredentials / /api/auth/session
interface ConnectorCredentials {
  retrievers?: Record<
    string,
    {
      endpoint?: string;
      username?: string;
      password?: string;
      api_key?: string;
    }
  >;
  generators?: Record<string, { api_key?: string; project_id?: string }>;
}

// --- Helpers ---

/**
 * Removes a single connector's stored credentials from the session JWT so that
 * the server-side env-var values take effect again on the next request.
 */
async function clearConnectorCredential(
  kind: 'retriever' | 'generator',
  connectorName: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return false;
    const current = await res.json();
    const creds = structuredClone(current?.connectorCredentials ?? {});
    if (kind === 'retriever') delete creds.retrievers?.[connectorName];
    else delete creds.generators?.[connectorName];
    const update = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { connectorCredentials: creds } }),
    });
    return update.ok;
  } catch {
    return false;
  }
}

// --- Sub-components ---

function ConnectorTile({
  connector,
  selected,
  onSelect,
}: {
  connector: Connector;
  selected: boolean;
  onSelect: (c: Connector) => void;
}) {
  return (
    <RadioTile
      id={`connectors--${connector.name}`}
      value={`${connector.name}`}
      checked={selected}
      onChange={() => onSelect(connector)}
      disabled={connector.disabled}
    >
      <div className={classes.connector}>
        <span className={classes.connectorTitle}>{connector.name}</span>
        {connector.description ? (
          <span className={classes.connectorDescription}>
            {truncate(connector.description, 200)}
          </span>
        ) : null}
        {connector.tags ? (
          <div className={classes.connectorTags}>
            {connector.tags.map((tag) => (
              <ConnectorTag
                key={`connectors__${tag}--${connector.name}`}
                tag={tag}
              />
            ))}
          </div>
        ) : null}
      </div>
    </RadioTile>
  );
}

function RetrieverParams({
  connector,
  onSave,
  onRestore,
}: {
  connector: Connector;
  onSave: (c: Connector) => void;
  onRestore?: () => void;
}) {
  const [updatedConnector, setUpdatedConnector] =
    useState<Connector>(connector);
  const [loginType, setLoginType] = useState<string>(
    connector.credentials.api_key ? 'api_key' : 'username',
  );
  // Only show validation errors for fields the user has touched
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const touch = (key: string) => setTouched((prev) => new Set(prev).add(key));

  const endpointInvalid =
    touched.has('endpoint') && isEmpty(updatedConnector.endpoint);
  const usernameInvalid =
    touched.has('username') && isEmpty(updatedConnector.credentials.username);
  const passwordInvalid =
    touched.has('password') && isEmpty(updatedConnector.credentials.password);
  const apiKeyInvalid =
    touched.has('api_key') && isEmpty(updatedConnector.credentials.api_key);

  const saveDisabled =
    isEqual(updatedConnector, connector) ||
    isEmpty(updatedConnector.endpoint) ||
    (loginType === 'username' &&
      (isEmpty(updatedConnector.credentials.username) ||
        isEmpty(updatedConnector.credentials.password))) ||
    (loginType === 'api_key' && isEmpty(updatedConnector.credentials.api_key));

  // Show Restore only when the connector was originally server-managed
  const canRestore = connector.credentials.provider === 'server';

  return (
    <>
      <TextInput
        id="retriever__endpoint--input"
        labelText="Endpoint"
        value={updatedConnector.endpoint ?? ''}
        className={classes.inputBox}
        invalid={endpointInvalid}
        invalidText="Retriever endpoint must be specified."
        onChange={(event) => {
          touch('endpoint');
          setUpdatedConnector({
            ...updatedConnector,
            endpoint: event.target.value.trim(),
          });
        }}
      />
      <div className={classes.loginTypeSelectors}>
        <RadioTile
          id="loginTypeSelector--username"
          value="username"
          checked={loginType === 'username'}
          onChange={() => setLoginType('username')}
        >
          Username
        </RadioTile>
        <RadioTile
          id="loginTypeSelector--api_key"
          value="api_key"
          checked={loginType === 'api_key'}
          onChange={() => setLoginType('api_key')}
        >
          API Key
        </RadioTile>
      </div>
      {loginType === 'username' ? (
        <>
          <TextInput
            id="login-username--input"
            labelText="Username"
            value={updatedConnector.credentials.username ?? ''}
            className={classes.inputBox}
            invalid={usernameInvalid}
            invalidText="Username must be specified."
            onChange={(event) => {
              touch('username');
              setUpdatedConnector({
                ...updatedConnector,
                credentials: {
                  ...updatedConnector.credentials,
                  username: event.target.value.trim(),
                },
              });
            }}
          />
          <PasswordInput
            id="login-password--input"
            labelText="Password"
            value={updatedConnector.credentials.password ?? ''}
            showPasswordLabel="Show password"
            hidePasswordLabel="Hide password"
            className={classes.inputBox}
            invalid={passwordInvalid}
            invalidText="Password must be specified."
            onChange={(event) => {
              touch('password');
              setUpdatedConnector({
                ...updatedConnector,
                credentials: {
                  ...updatedConnector.credentials,
                  password: event.target.value.trim(),
                },
              });
            }}
          />
        </>
      ) : (
        <PasswordInput
          id="login-api-key--input"
          labelText="API Key"
          value={updatedConnector.credentials.api_key ?? ''}
          showPasswordLabel="Show API key"
          hidePasswordLabel="Hide API key"
          className={classes.inputBox}
          invalid={apiKeyInvalid}
          invalidText="API Key must be specified."
          onChange={(event) => {
            touch('api_key');
            setUpdatedConnector({
              ...updatedConnector,
              credentials: {
                ...updatedConnector.credentials,
                api_key: event.target.value.trim(),
              },
            });
          }}
        />
      )}
      <div className={classes.connectorSettingsBtns}>
        {canRestore && onRestore ? (
          <Button kind="secondary" renderIcon={Reset} onClick={onRestore}>
            Restore defaults
          </Button>
        ) : null}
        <Button
          renderIcon={Save}
          disabled={saveDisabled}
          onClick={() => {
            onSave({
              ...updatedConnector,
              credentials: {
                ...updatedConnector.credentials,
                provider: 'client',
              },
            });
          }}
        >
          Save
        </Button>
      </div>
    </>
  );
}

function GeneratorParams({
  connector,
  onSave,
  onRestore,
}: {
  connector: Connector;
  onSave: (c: Connector) => void;
  onRestore?: () => void;
}) {
  const [updatedConnector, setUpdatedConnector] =
    useState<Connector>(connector);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const touch = (key: string) => setTouched((prev) => new Set(prev).add(key));

  const apiKeyInvalid =
    touched.has('api_key') && isEmpty(updatedConnector.credentials.api_key);
  const projectIdInvalid =
    touched.has('project_id') &&
    isEmpty(updatedConnector.credentials.project_id);

  const saveDisabled =
    isEqual(updatedConnector, connector) ||
    isEmpty(updatedConnector.credentials.api_key) ||
    (updatedConnector.name === 'WatsonX.AI' &&
      isEmpty(updatedConnector.credentials.project_id));

  const canRestore = connector.credentials.provider === 'server';

  return (
    <>
      <PasswordInput
        id="generator__api-key--input"
        labelText="API Key"
        value={updatedConnector.credentials.api_key ?? ''}
        showPasswordLabel="Show API key"
        hidePasswordLabel="Hide API key"
        className={classes.inputBox}
        invalid={apiKeyInvalid}
        invalidText="API Key must be specified."
        onChange={(event) => {
          touch('api_key');
          setUpdatedConnector({
            ...updatedConnector,
            credentials: {
              ...updatedConnector.credentials,
              api_key: event.target.value.trim(),
            },
          });
        }}
      />
      {updatedConnector.name === 'WatsonX.AI' ? (
        <TextInput
          id="generator__project-id-input"
          labelText="Project ID"
          value={updatedConnector.credentials.project_id ?? ''}
          className={classes.inputBox}
          invalid={projectIdInvalid}
          invalidText="Project ID must be specified."
          onChange={(event) => {
            touch('project_id');
            setUpdatedConnector({
              ...updatedConnector,
              credentials: {
                ...updatedConnector.credentials,
                project_id: event.target.value.trim(),
              },
            });
          }}
        />
      ) : null}
      <div className={classes.connectorSettingsBtns}>
        {canRestore && onRestore ? (
          <Button kind="secondary" renderIcon={Reset} onClick={onRestore}>
            Restore defaults
          </Button>
        ) : null}
        <Button
          renderIcon={Save}
          disabled={saveDisabled}
          onClick={() => {
            onSave({
              ...updatedConnector,
              credentials: {
                ...updatedConnector.credentials,
                provider: 'client',
              },
            });
          }}
        >
          Save
        </Button>
      </div>
    </>
  );
}

function UploadSettings({
  open,
  onSave,
  onClose,
  onNotification,
}: {
  open: boolean;
  onSave: (creds: ConnectorCredentials) => Promise<void>;
  onClose: () => void;
  onNotification: (n: Notification) => void;
}) {
  const [importedCredentials, setImportedCredentials] = useState<
    ConnectorCredentials | undefined
  >(undefined);

  return (
    <Modal
      open={open}
      size="md"
      modalLabel="Upload settings"
      primaryButtonText="Save"
      primaryButtonDisabled={!importedCredentials}
      secondaryButtonText="Cancel"
      onRequestSubmit={async () => {
        if (!importedCredentials) return;
        await onSave(importedCredentials);
        setImportedCredentials(undefined);
      }}
      onRequestClose={() => {
        setImportedCredentials(undefined);
        onClose();
      }}
    >
      <FileUploader
        labelTitle="File"
        labelDescription="Max file size is 5mb. Only .json files are supported."
        buttonLabel="Upload"
        buttonKind="primary"
        size="md"
        filenameStatus="edit"
        accept={['.json']}
        multiple={false}
        disabled={false}
        iconDescription="Delete file"
        name=""
        onChange={async (event) => {
          const fileReader = new FileReader();
          fileReader.onload = (e) => {
            if (
              e.target &&
              e.target.result &&
              typeof e.target.result === 'string'
            ) {
              try {
                const fileData = JSON.parse(e.target.result);

                // Validate: top-level keys must be a subset of {retrievers, generators},
                // each value must be a non-null object.
                const allowedKeys = new Set(['retrievers', 'generators']);
                const keys = Object.keys(fileData);
                const isValid =
                  keys.length > 0 &&
                  keys.every((k) => allowedKeys.has(k)) &&
                  keys.every(
                    (k) =>
                      fileData[k] !== null &&
                      typeof fileData[k] === 'object' &&
                      !Array.isArray(fileData[k]),
                  );

                if (!isValid) {
                  onNotification({
                    kind: 'error',
                    title: 'Failed to upload file.',
                    subtitle:
                      'Expected a JSON object with "retrievers" and/or "generators" keys mapping connector names to credential fields.',
                    timeout: 10000,
                  });
                } else {
                  onNotification({
                    kind: 'info',
                    title: 'Upload successful.',
                    subtitle: 'Click Save to store the credentials.',
                    timeout: 2000,
                  });
                  setImportedCredentials(fileData as ConnectorCredentials);
                }
              } catch {
                onNotification({
                  kind: 'error',
                  title: 'Failed to upload file.',
                  subtitle:
                    'Please make sure you are uploading a valid JSON file.',
                  timeout: 10000,
                });
              }
            }

            return undefined;
          };

          // @ts-ignore
          fileReader.readAsText(event.target.files[0]);
        }}
        onDelete={() => {
          setImportedCredentials(undefined);
        }}
      />

      <h4>{importedCredentials ? 'Settings' : 'Format'}</h4>
      <CodeSnippet
        className={classes.dataFormat}
        minCollapsedNumberOfRows={5}
        type="multi"
        feedback="Copied to clipboard"
      >
        {importedCredentials
          ? JSON.stringify(importedCredentials, null, 2)
          : JSON.stringify(sample_settings, null, 2)}
      </CodeSnippet>
    </Modal>
  );
}

// --- Main component ---

export default function Settings({ open = false, onClose }: Props) {
  const [selectedConnector, setSelectedConnector] = useState<{
    kind: string;
    connector: Connector;
  }>();
  const [uploadingSettings, setUploadingSettings] = useState<boolean>(false);

  const { configuration, setConfiguration } = useConfiguration();
  const { createNotification } = useNotification();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!open) return null;

  const handleRetrieverSave = async (updatedConnector: Connector) => {
    setConfiguration({
      ...configuration,
      retrievers: configuration.retrievers.map((c) =>
        c.name === updatedConnector.name
          ? (updatedConnector as RetrieverConfig)
          : c,
      ),
    });

    const ok = await storeConnectorCredentials(
      {
        [updatedConnector.name]: {
          endpoint: updatedConnector.endpoint,
          username: updatedConnector.credentials.username,
          password: updatedConnector.credentials.password,
          api_key: updatedConnector.credentials.api_key,
        },
      },
      undefined,
    );

    createNotification(
      ok
        ? {
            kind: 'success',
            title: 'Credentials saved.',
            subtitle: `${updatedConnector.name} credentials stored securely.`,
          }
        : {
            kind: 'error',
            title: 'Failed to save credentials.',
            subtitle: 'Please try again.',
          },
    );
  };

  const handleGeneratorSave = async (updatedConnector: Connector) => {
    setConfiguration({
      ...configuration,
      generators: configuration.generators.map((c) =>
        c.name === updatedConnector.name
          ? (updatedConnector as GeneratorConfig)
          : c,
      ),
    });

    const ok = await storeConnectorCredentials(undefined, {
      [updatedConnector.name]: {
        api_key: updatedConnector.credentials.api_key,
        project_id: updatedConnector.credentials.project_id,
      },
    });

    createNotification(
      ok
        ? {
            kind: 'success',
            title: 'Credentials saved.',
            subtitle: `${updatedConnector.name} credentials stored securely.`,
          }
        : {
            kind: 'error',
            title: 'Failed to save credentials.',
            subtitle: 'Please try again.',
          },
    );
  };

  const handleRetrieverRestore = async (connectorName: string) => {
    const ok = await clearConnectorCredential('retriever', connectorName);
    createNotification(
      ok
        ? {
            kind: 'success',
            title: 'Defaults restored.',
            subtitle: `${connectorName} will use server-configured credentials.`,
          }
        : {
            kind: 'error',
            title: 'Failed to restore defaults.',
            subtitle: 'Please try again.',
          },
    );
  };

  const handleGeneratorRestore = async (connectorName: string) => {
    const ok = await clearConnectorCredential('generator', connectorName);
    createNotification(
      ok
        ? {
            kind: 'success',
            title: 'Defaults restored.',
            subtitle: `${connectorName} will use server-configured credentials.`,
          }
        : {
            kind: 'error',
            title: 'Failed to restore defaults.',
            subtitle: 'Please try again.',
          },
    );
  };

  const handleImportSave = async (creds: ConnectorCredentials) => {
    const ok = await storeConnectorCredentials(
      creds.retrievers,
      creds.generators,
    );
    createNotification(
      ok
        ? {
            kind: 'success',
            title: 'Credentials imported.',
            subtitle: 'Credentials imported and stored securely.',
          }
        : {
            kind: 'error',
            title: 'Failed to import credentials.',
            subtitle: 'Please try again.',
          },
    );
    // Panel stays open so user can see what was applied; modal closes via its own Cancel/Save flow
  };

  return (
    <>
      <div className={classes.backdrop} onClick={onClose} />
      <div className={classes.page}>
        <div className={classes.header}>
          <div className={classes.title}>Connector Settings</div>
          <UploadSettings
            open={uploadingSettings}
            onSave={handleImportSave}
            onClose={() => setUploadingSettings(false)}
            onNotification={createNotification}
          />
          <div className={classes.toolbar}>
            <button
              title="Import settings"
              className={cx(classes.toolbarBtn)}
              onClick={() => setUploadingSettings(true)}
            >
              <Upload size={24} />
              <span>Import</span>
            </button>

            <div className={classes.separator}></div>

            <button
              title="Close settings"
              className={classes.toolbarBtn}
              onClick={onClose}
            >
              <Close size={24} />
              <span>Close</span>
            </button>
          </div>
        </div>
        <div className={classes.row}>
          <div className={classes.components}>
            <h4>Retrievers</h4>
            <div className={classes.connectors}>
              {configuration.retrievers.map((connector) => (
                <ConnectorTile
                  key={`connectors--${connector.name}`}
                  connector={connector}
                  selected={
                    selectedConnector?.connector.name === connector.name
                  }
                  onSelect={(c: Connector) =>
                    setSelectedConnector({ kind: 'retriever', connector: c })
                  }
                />
              ))}
            </div>
            <h4>Generators</h4>
            <div className={classes.connectors}>
              {configuration.generators.map((connector) => (
                <ConnectorTile
                  key={`connectors--${connector.name}`}
                  connector={connector}
                  selected={
                    selectedConnector?.connector.name === connector.name
                  }
                  onSelect={(c: Connector) =>
                    setSelectedConnector({ kind: 'generator', connector: c })
                  }
                />
              ))}
            </div>
          </div>
          <div
            className={cx(
              classes.connectorSettingsPanel,
              selectedConnector ? classes.visible : null,
            )}
          >
            {selectedConnector?.kind === 'retriever' ? (
              <RetrieverParams
                key={selectedConnector.connector.name}
                connector={selectedConnector.connector}
                onSave={handleRetrieverSave}
                onRestore={() =>
                  handleRetrieverRestore(selectedConnector.connector.name)
                }
              />
            ) : selectedConnector?.kind === 'generator' ? (
              <GeneratorParams
                key={selectedConnector.connector.name}
                connector={selectedConnector.connector}
                onSave={handleGeneratorSave}
                onRestore={() =>
                  handleGeneratorRestore(selectedConnector.connector.name)
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

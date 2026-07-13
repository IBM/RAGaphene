/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import { cloneDeep } from 'lodash';
import {
  Connector,
  Credentials,
  GeneratorConfig,
  RetrieverConfig,
  SystemConfiguration,
} from '@/types/custom';
import defaultConfig from '@/src/config/system';

// Module-level cache — populated once on first call, lives for the process
// lifetime. Config changes require a server restart.
let _cache: SystemConfiguration | null = null;
let _cacheSecure: SystemConfiguration | null = null;

// ---------------------------------------------------------------------------
// resolveCredentials
// ---------------------------------------------------------------------------
// For each connector in the config, inspect its `env_*` pointer fields:
//
//   Endpoint:
//   - If `env_endpoint` is declared and the env var is present → inject into
//     `endpoint`. If missing → clear `endpoint` so server mode fails fast.
//   - `env_endpoint` is stripped from the output (internal pointer only).
//
//   Credentials (supports alternative auth methods — "any group wins"):
//   - Pointers are grouped: api_key group, project_id group, username+password
//     group. A "group" is satisfied when ALL env vars in the group are present
//     and non-empty.
//   - If no env_* fields declared → leave credentials unchanged.
//   - If any group is satisfied → inject those values, set provider: 'server'.
//   - If no group is satisfied → downgrade to provider: 'client'.
//   - env_* fields are always stripped from the output.

function resolveConnectorCredentials(credentials: Credentials): Credentials {
  const allEnvFields: Array<[keyof Credentials, keyof Credentials]> = [
    ['env_api_key', 'api_key'],
    ['env_project_id', 'project_id'],
    ['env_username', 'username'],
    ['env_password', 'password'],
    ['env_database', 'database'],
  ];

  // Collect which env_* pointers were actually declared in this credential object
  const declared = allEnvFields.filter(
    ([envField]) => credentials[envField] != null,
  );

  if (declared.length === 0) {
    // No env_* fields — return as-is
    return credentials;
  }

  // Build auth groups from what was declared.
  // Rules:
  //   1. username + password are always co-required; database is also co-required
  //      when declared alongside them (e.g. MongoDB needs all three)
  //   2. api_key + project_id are co-required when BOTH are declared
  //      (e.g. WatsonX needs both); if only api_key is declared it's standalone
  //   3. Each group is tried independently — the first fully-satisfied group wins
  //      (enables alternative auth like ElasticSearch: api_key OR username+password)

  const hasApiKey = credentials.env_api_key != null;
  const hasProjectId = credentials.env_project_id != null;
  const hasUsername = credentials.env_username != null;
  const hasPassword = credentials.env_password != null;
  const hasDatabase = credentials.env_database != null;

  const groups: Array<Array<[keyof Credentials, keyof Credentials]>> = [];

  if (hasApiKey && hasProjectId) {
    // api_key + project_id are co-required (e.g. WatsonX)
    groups.push([
      ['env_api_key', 'api_key'],
      ['env_project_id', 'project_id'],
    ]);
  } else if (hasApiKey) {
    // api_key alone (e.g. OpenAI, Elasticsearch api-key auth)
    groups.push([['env_api_key', 'api_key']]);
  } else if (hasProjectId) {
    // project_id alone (unusual but possible)
    groups.push([['env_project_id', 'project_id']]);
  }

  if (hasUsername && hasPassword) {
    // basic auth pair; database is co-required when declared (e.g. MongoDB)
    const group: Array<[keyof Credentials, keyof Credentials]> = [
      ['env_username', 'username'],
      ['env_password', 'password'],
    ];
    if (hasDatabase) group.push(['env_database', 'database']);
    groups.push(group);
  }

  for (const group of groups) {
    const groupSatisfied = group.every(([envField]) => {
      const value = process.env[credentials[envField] as string];
      return value !== undefined && value !== '';
    });

    if (groupSatisfied) {
      const resolved: Credentials = { provider: 'server' };
      group.forEach(([envField, valueField]) => {
        (resolved as any)[valueField] =
          process.env[credentials[envField] as string];
      });
      return resolved;
    }
  }

  // No group satisfied — downgrade to client mode
  return { provider: 'client' };
}

function resolveConnectorEndpoint<
  T extends { endpoint?: string; env_endpoint?: string },
>(connector: T): T {
  if (!connector.env_endpoint) return connector;

  const value = process.env[connector.env_endpoint];
  const { env_endpoint: _, ...rest } = connector as any;

  if (value) {
    return { ...rest, endpoint: value };
  }
  // env_endpoint declared but env var missing → clear endpoint so server mode
  // fails fast with "Connector endpoint not configured"
  const { endpoint: __, ...noEndpoint } = rest;
  return noEndpoint;
}

export function resolveCredentials(
  configuration: SystemConfiguration,
): SystemConfiguration {
  configuration.retrievers = configuration.retrievers.map((retriever) => ({
    ...resolveConnectorEndpoint(retriever),
    credentials: resolveConnectorCredentials(retriever.credentials),
  }));

  configuration.generators = configuration.generators.map((generator) => ({
    ...resolveConnectorEndpoint(generator),
    credentials: resolveConnectorCredentials(generator.credentials),
  }));

  if (configuration.store) {
    configuration.store = {
      ...resolveConnectorEndpoint(configuration.store),
      credentials: resolveConnectorCredentials(configuration.store.credentials),
    };
  }

  return configuration;
}

// ---------------------------------------------------------------------------
// sanitize — strips endpoints + all credential fields except `provider`
// ---------------------------------------------------------------------------

function sanitize(configuration: SystemConfiguration): SystemConfiguration {
  const sanitizedConfiguration: SystemConfiguration = cloneDeep(configuration);

  // Step 2: Sanitize retrievers
  // Step 2.a: Remove endpoint
  sanitizedConfiguration.retrievers.forEach(
    (retriever) => delete retriever.endpoint,
  );
  // Step 2.b: Remove confidential details from credentials
  sanitizedConfiguration.retrievers = sanitizedConfiguration.retrievers.map(
    (retriever) => {
      return {
        ...retriever,
        credentials: { provider: retriever.credentials.provider },
      };
    },
  );

  // Step 3: Sanitize generators
  // Step 3.a: Remove endpoint
  sanitizedConfiguration.generators.forEach(
    (generator) => delete generator.endpoint,
  );
  // Step 3.b: Remove confidential details from credentials
  sanitizedConfiguration.generators = sanitizedConfiguration.generators.map(
    (generator) => {
      return {
        ...generator,
        credentials: { provider: generator.credentials.provider },
      };
    },
  );

  return sanitizedConfiguration;
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export function load(secure?: boolean): SystemConfiguration {
  // Return cached result if available
  if (secure && _cacheSecure) return _cacheSecure;
  if (!secure && _cache) return _cache;

  const resolved = resolveCredentials(cloneDeep(defaultConfig));

  // Backfill legacy template defaults — configs without templates get defaults
  resolved.retrievers.forEach((retriever) => {
    if (!retriever.settings.templates) {
      retriever.settings.templates = {
        projection: '${text}',
        display: '${text}',
      };
    }
    if (!retriever.settings.templates.projection) {
      retriever.settings.templates = {
        ...retriever.settings.templates,
        projection: '${text}',
      };
    }
    if (!retriever.settings.templates.display) {
      retriever.settings.templates = {
        ...retriever.settings.templates,
        display: '${text}',
      };
    }
  });

  _cache = resolved;
  _cacheSecure = sanitize(cloneDeep(resolved));

  return secure ? _cacheSecure : _cache;
}

export function getRetrieverConfig(name: string): RetrieverConfig | undefined {
  const configuration = load();
  return configuration.retrievers.find(
    (retrieverConnector) => retrieverConnector.name === name,
  );
}

export function getGeneratorConfig(name: string): GeneratorConfig | undefined {
  const configuration = load();
  return configuration.generators.find(
    (generatorConnector) => generatorConnector.name === name,
  );
}

export function getDatabaseConnector(): Connector | undefined {
  const configuration = load();
  return configuration.store;
}

export function getAuthenticator():
  | { enabled: boolean; provider: 'credentials' | 'oauth' | 'github' }
  | undefined {
  const configuration = load();
  return configuration.authenticator;
}

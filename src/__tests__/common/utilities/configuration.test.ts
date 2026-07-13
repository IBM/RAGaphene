/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/utilities/configuration.ts
 *
 * The module now imports a bundled TypeScript config from @/src/config/system
 * instead of parsing SYSTEM_CONFIGURATION from an env var.
 *
 * Strategy for cache isolation:
 *   - jest.mock('@/src/config/system') is hoisted and returns a mutable
 *     container ({ value: ... }) whose `.value` can be swapped per-test.
 *   - jest.resetModules() + require() re-evaluates configuration.ts so the
 *     module-level cache (_cache / _cacheSecure) starts fresh each test.
 *
 * Env vars (WATSONX_API_KEY, etc.) are set/cleared per-test to exercise
 * resolveCredentials() without any live service calls.
 */

// configuration.ts has 'server-only' imported — already mocked by jest.config.js

// ---------------------------------------------------------------------------
// Mutable mock container — jest.mock factory refs this; tests swap .value
// ---------------------------------------------------------------------------
const systemConfigMock = { value: null as any };

jest.mock('@/src/config/system', () => ({
  __esModule: true,
  get default() {
    return systemConfigMock.value;
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  authenticator: { enabled: true, provider: 'credentials' },
  retrievers: [
    {
      name: 'ElasticSearch',
      endpoint: 'http://es:9200',
      credentials: { provider: 'client' }, // no env_* — always client
      provider: 'elastic',
      settings: {
        configurable: true,
        max_count: 3,
        max_utterances: -1,
        query_syntax: '',
        templates: { projection: '${text}', display: '${text}' },
      },
    },
    {
      name: 'Cloudant',
      endpoint: 'https://cloudant.example.com',
      credentials: {
        provider: 'server',
        env_username: 'CLOUDANT_USERNAME',
        env_password: 'CLOUDANT_PASSWORD',
      },
      provider: 'cloudant',
      settings: {
        configurable: true,
        max_count: 5,
        max_utterances: 10,
        query_syntax: '',
        templates: { projection: '${body}', display: '${body}' },
      },
    },
  ],
  generators: [
    {
      name: 'WatsonX.AI',
      endpoint: 'https://us-south.ml.cloud.ibm.com',
      credentials: {
        provider: 'server',
        env_api_key: 'WATSONX_API_KEY',
        env_project_id: 'WATSONX_PROJECT_ID',
      },
      provider: 'IBM',
      settings: {
        configurable: false,
        prompt: { template: '', input: '', context: '' },
        parameters: { max_new_tokens: 512 },
      },
    },
    {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      credentials: {
        provider: 'server',
        env_api_key: 'OPENAI_API_KEY',
      },
      provider: 'OpenAI',
      settings: {
        configurable: true,
        prompt: { template: '', input: '', context: '' },
        parameters: { max_new_tokens: 1024 },
      },
    },
    {
      name: 'Ollama',
      endpoint: 'http://localhost:11434',
      credentials: { provider: 'client' },
      authentication: 'none',
      provider: 'Ollama',
      settings: {
        configurable: true,
        prompt: { template: '', input: '', context: '' },
        parameters: { max_new_tokens: 512 },
      },
    },
  ],
  store: {
    name: 'Cloudant',
    endpoint: 'https://cloudant.example.com',
    credentials: {
      provider: 'server',
      env_api_key: 'STORE_API_KEY',
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Re-requires configuration module after resetting the module registry so
// that the module-level cache (_cache / _cacheSecure) starts fresh.
function freshLoad(secure?: boolean) {
  jest.resetModules();
  systemConfigMock.value = JSON.parse(JSON.stringify(mockConfig));
  const mod = require('@/src/common/utilities/configuration');
  return mod.load(secure);
}

function freshGetGeneratorConfig(name: string) {
  jest.resetModules();
  systemConfigMock.value = JSON.parse(JSON.stringify(mockConfig));
  const mod = require('@/src/common/utilities/configuration');
  return mod.getGeneratorConfig(name);
}

function freshGetRetrieverConfig(name: string) {
  jest.resetModules();
  systemConfigMock.value = JSON.parse(JSON.stringify(mockConfig));
  const mod = require('@/src/common/utilities/configuration');
  return mod.getRetrieverConfig(name);
}

function freshGetDatabaseConnector(config = mockConfig) {
  jest.resetModules();
  systemConfigMock.value = JSON.parse(JSON.stringify(config));
  const mod = require('@/src/common/utilities/configuration');
  return mod.getDatabaseConnector();
}

// Top-level imports of exported functions — used only for resolveCredentials()
// tests which don't need cache isolation (they pass configs directly).
import { resolveCredentials } from '@/src/common/utilities/configuration';

// ---------------------------------------------------------------------------
// resolveCredentials()
// ---------------------------------------------------------------------------

describe('resolveCredentials()', () => {
  afterEach(() => {
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLOUDANT_USERNAME;
    delete process.env.CLOUDANT_PASSWORD;
    delete process.env.STORE_API_KEY;
    delete process.env.ES_ENDPOINT;
    delete process.env.ES_API_KEY;
    delete process.env.ES_USERNAME;
    delete process.env.ES_PASSWORD;
    delete process.env.MONGODB_USERNAME;
    delete process.env.MONGODB_PASSWORD;
    delete process.env.MONGODB_DATABASE;
  });

  it('all env vars present → provider stays server, values injected', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [],
      generators: [
        {
          name: 'WatsonX.AI',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'WATSONX_API_KEY',
            env_project_id: 'WATSONX_PROJECT_ID',
          },
          settings: {
            configurable: false,
            prompt: { template: '', input: '' },
            parameters: { max_new_tokens: 512 },
          },
        },
      ],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.generators[0].credentials;

    expect(cred.provider).toBe('server');
    expect(cred.api_key).toBe('wx-key');
    expect(cred.project_id).toBe('wx-proj');
    // env_* fields stripped
    expect(cred.env_api_key).toBeUndefined();
    expect(cred.env_project_id).toBeUndefined();
  });

  it('any env var missing → provider downgraded to client, no values', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    // WATSONX_PROJECT_ID intentionally not set

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [],
      generators: [
        {
          name: 'WatsonX.AI',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'WATSONX_API_KEY',
            env_project_id: 'WATSONX_PROJECT_ID',
          },
          settings: {
            configurable: false,
            prompt: { template: '', input: '' },
            parameters: { max_new_tokens: 512 },
          },
        },
      ],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.generators[0].credentials;

    expect(cred.provider).toBe('client');
    expect(cred.api_key).toBeUndefined();
    expect(cred.project_id).toBeUndefined();
    expect(cred.env_api_key).toBeUndefined();
    expect(cred.env_project_id).toBeUndefined();
  });

  it('no env_* declared → connector credentials unchanged', () => {
    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          credentials: { provider: 'client' as const },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].credentials.provider).toBe('client');
  });

  it('env var set to empty string → downgrade to client', () => {
    process.env.OPENAI_API_KEY = '';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [],
      generators: [
        {
          name: 'OpenAI',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'OPENAI_API_KEY',
          },
          settings: {
            configurable: true,
            prompt: { template: '', input: '' },
            parameters: { max_new_tokens: 1024 },
          },
        },
      ],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.generators[0].credentials.provider).toBe('client');
  });

  it('resolves store connector credentials when present', () => {
    process.env.STORE_API_KEY = 'store-secret';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [],
      generators: [],
      store: {
        name: 'Cloudant',
        credentials: {
          provider: 'server' as const,
          env_api_key: 'STORE_API_KEY',
        },
      },
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.store!.credentials.api_key).toBe('store-secret');
    expect(resolved.store!.credentials.env_api_key).toBeUndefined();
  });

  it('env_* fields are never present in resolved output', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [],
      generators: [
        {
          name: 'WatsonX.AI',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'WATSONX_API_KEY',
            env_project_id: 'WATSONX_PROJECT_ID',
          },
          settings: {
            configurable: false,
            prompt: { template: '', input: '' },
            parameters: { max_new_tokens: 512 },
          },
        },
      ],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.generators[0].credentials;
    const credKeys = Object.keys(cred);

    expect(credKeys.some((k) => k.startsWith('env_'))).toBe(false);
  });

  // --- OR-auth-group (ElasticSearch) ---

  it('API key alone satisfies auth when username/password also declared', () => {
    process.env.ES_API_KEY = 'es-key';
    // ES_USERNAME / ES_PASSWORD intentionally not set

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          env_endpoint: 'ES_ENDPOINT',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
            env_username: 'ES_USERNAME',
            env_password: 'ES_PASSWORD',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.retrievers[0].credentials;

    expect(cred.provider).toBe('server');
    expect(cred.api_key).toBe('es-key');
    expect(cred.username).toBeUndefined();
    expect(cred.password).toBeUndefined();
  });

  it('username+password satisfies auth when API key not set', () => {
    process.env.ES_USERNAME = 'elastic';
    process.env.ES_PASSWORD = 's3cr3t';
    // ES_API_KEY intentionally not set

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          env_endpoint: 'ES_ENDPOINT',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
            env_username: 'ES_USERNAME',
            env_password: 'ES_PASSWORD',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.retrievers[0].credentials;

    expect(cred.provider).toBe('server');
    expect(cred.username).toBe('elastic');
    expect(cred.password).toBe('s3cr3t');
    expect(cred.api_key).toBeUndefined();
  });

  it('no auth group satisfied → downgrade to client', () => {
    // ES_API_KEY, ES_USERNAME, ES_PASSWORD all unset

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
            env_username: 'ES_USERNAME',
            env_password: 'ES_PASSWORD',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].credentials.provider).toBe('client');
  });

  it('only one of the basic-auth pair set → does not satisfy that group', () => {
    process.env.ES_USERNAME = 'elastic';
    // ES_PASSWORD missing, ES_API_KEY missing

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
            env_username: 'ES_USERNAME',
            env_password: 'ES_PASSWORD',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].credentials.provider).toBe('client');
  });

  // --- database co-requirement (MongoDB) ---

  it('username + password + database all set → all three injected', () => {
    process.env.MONGODB_USERNAME = 'mongo-user';
    process.env.MONGODB_PASSWORD = 'mongo-pass';
    process.env.MONGODB_DATABASE = 'my-db';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'MongoDB',
          credentials: {
            provider: 'server' as const,
            env_username: 'MONGODB_USERNAME',
            env_password: 'MONGODB_PASSWORD',
            env_database: 'MONGODB_DATABASE',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    const cred = resolved.retrievers[0].credentials;

    expect(cred.provider).toBe('server');
    expect(cred.username).toBe('mongo-user');
    expect(cred.password).toBe('mongo-pass');
    expect(cred.database).toBe('my-db');
    expect(cred.env_database).toBeUndefined();
  });

  it('database missing → downgrade to client even if username+password set', () => {
    process.env.MONGODB_USERNAME = 'mongo-user';
    process.env.MONGODB_PASSWORD = 'mongo-pass';
    // MONGODB_DATABASE intentionally not set

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'MongoDB',
          credentials: {
            provider: 'server' as const,
            env_username: 'MONGODB_USERNAME',
            env_password: 'MONGODB_PASSWORD',
            env_database: 'MONGODB_DATABASE',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].credentials.provider).toBe('client');
  });

  // --- env_endpoint resolution ---

  it('env_endpoint present → injects into connector.endpoint', () => {
    process.env.ES_ENDPOINT = 'https://es.example.com:9200';
    process.env.ES_API_KEY = 'es-key';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          env_endpoint: 'ES_ENDPOINT',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].endpoint).toBe('https://es.example.com:9200');
    expect((resolved.retrievers[0] as any).env_endpoint).toBeUndefined();
  });

  it('env_endpoint missing → endpoint cleared (server mode will fail fast)', () => {
    // ES_ENDPOINT not set
    process.env.ES_API_KEY = 'es-key';

    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'ElasticSearch',
          endpoint: 'http://old-endpoint',
          env_endpoint: 'ES_ENDPOINT',
          credentials: {
            provider: 'server' as const,
            env_api_key: 'ES_API_KEY',
          },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].endpoint).toBeUndefined();
  });

  it('env_endpoint not declared → endpoint field left untouched', () => {
    const config = {
      authenticator: { enabled: true, provider: 'credentials' as const },
      retrievers: [
        {
          name: 'Cloudant',
          endpoint: 'https://cloudant.example.com',
          credentials: { provider: 'client' as const },
          settings: {
            configurable: true,
            max_count: 3,
            max_utterances: -1,
            query_syntax: '',
            templates: { projection: '${text}', display: '${text}' },
          },
        },
      ],
      generators: [],
    };

    const resolved = resolveCredentials(config as any);
    expect(resolved.retrievers[0].endpoint).toBe(
      'https://cloudant.example.com',
    );
  });
});

// ---------------------------------------------------------------------------
// load()
// ---------------------------------------------------------------------------

describe('load()', () => {
  afterEach(() => {
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLOUDANT_USERNAME;
    delete process.env.CLOUDANT_PASSWORD;
    delete process.env.STORE_API_KEY;
    delete process.env.ES_ENDPOINT;
    delete process.env.ES_API_KEY;
    delete process.env.ES_USERNAME;
    delete process.env.ES_PASSWORD;
  });

  it('always returns a config (bundled default, no env var required)', () => {
    const config = freshLoad();
    expect(config).toBeDefined();
    expect(config.authenticator).toBeDefined();
    expect(config.retrievers.length).toBeGreaterThan(0);
    expect(config.generators.length).toBeGreaterThan(0);
  });

  it('connectors without env_* remain as-is', () => {
    const config = freshLoad();
    const elser = config.retrievers.find(
      (r: any) => r.name === 'ElasticSearch',
    );
    expect(elser).toBeDefined();
    expect(elser!.credentials.provider).toBe('client');
  });

  it('generators with env vars unset downgrade to client mode', () => {
    const config = freshLoad();
    const wx = config.generators.find((g: any) => g.name === 'WatsonX.AI');
    expect(wx!.credentials.provider).toBe('client');
  });

  it('generator with all env vars set resolves to server mode', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';

    const config = freshLoad();
    const wx = config.generators.find((g: any) => g.name === 'WatsonX.AI');
    expect(wx!.credentials.provider).toBe('server');
    expect(wx!.credentials.api_key).toBe('wx-key');
    expect(wx!.credentials.project_id).toBe('wx-proj');
  });

  it('load(true) sanitizes: strips endpoints from connectors', () => {
    const config = freshLoad(true);
    config.retrievers.forEach((r: any) => expect(r.endpoint).toBeUndefined());
    config.generators.forEach((g: any) => expect(g.endpoint).toBeUndefined());
  });

  it('load(true) sanitizes: strips api_key and project_id from credentials', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';

    const config = freshLoad(true);
    config.retrievers.forEach((r: any) => {
      expect(r.credentials.api_key).toBeUndefined();
      expect(r.credentials.username).toBeUndefined();
      expect(r.credentials.password).toBeUndefined();
    });
    config.generators.forEach((g: any) => {
      expect(g.credentials.api_key).toBeUndefined();
      expect(g.credentials.project_id).toBeUndefined();
    });
  });

  it('load(true) keeps credentials.provider', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';

    const config = freshLoad(true);
    const wx = config.generators.find((g: any) => g.name === 'WatsonX.AI');
    expect(wx!.credentials.provider).toBe('server');
  });

  it('load(true) preserves the authentication field (needed client-side)', () => {
    // The no-auth signal must survive sanitize so the client skips the store.
    const config = freshLoad(true);
    const ollama = config.generators.find((g: any) => g.name === 'Ollama');
    expect(ollama!.authentication).toBe('none');
  });

  it('load(true) sanitizes: no env_* fields in output', () => {
    const config = freshLoad(true);
    config.generators.forEach((g: any) => {
      const credKeys = Object.keys(g.credentials);
      expect(credKeys.some((k: string) => k.startsWith('env_'))).toBe(false);
    });
  });

  it('returns the cached result on second call without re-resolving', () => {
    jest.resetModules();
    systemConfigMock.value = JSON.parse(JSON.stringify(mockConfig));
    const mod = require('@/src/common/utilities/configuration');
    const first = mod.load();
    const second = mod.load();
    // Same object reference means cache was hit
    expect(second).toBe(first);
  });

  it('caches raw and sanitized results independently', () => {
    jest.resetModules();
    systemConfigMock.value = JSON.parse(JSON.stringify(mockConfig));
    const mod = require('@/src/common/utilities/configuration');
    const raw = mod.load();
    const secure = mod.load(true);
    // Raw config retains endpoint; sanitized does not
    expect(raw.retrievers[0].endpoint).toBeDefined();
    expect(secure.retrievers[0].endpoint).toBeUndefined();
    // Second calls return the same cached objects
    expect(mod.load()).toBe(raw);
    expect(mod.load(true)).toBe(secure);
  });
});

// ---------------------------------------------------------------------------
// getGeneratorConfig()
// ---------------------------------------------------------------------------

describe('getGeneratorConfig()', () => {
  afterEach(() => {
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
  });

  it('returns the matching generator by name', () => {
    process.env.WATSONX_API_KEY = 'wx-key';
    process.env.WATSONX_PROJECT_ID = 'wx-proj';
    const connector = freshGetGeneratorConfig('WatsonX.AI');
    expect(connector).toBeDefined();
    expect(connector!.name).toBe('WatsonX.AI');
    expect(connector!.endpoint).toBe('https://us-south.ml.cloud.ibm.com');
  });

  it('returns undefined for an unknown generator name', () => {
    expect(freshGetGeneratorConfig('Nonexistent')).toBeUndefined();
  });

  it('finds generators case-sensitively', () => {
    expect(freshGetGeneratorConfig('watsonx.ai')).toBeUndefined();
    expect(freshGetGeneratorConfig('WatsonX.AI')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRetrieverConfig()
// ---------------------------------------------------------------------------

describe('getRetrieverConfig()', () => {
  it('returns the matching retriever by name', () => {
    const connector = freshGetRetrieverConfig('ElasticSearch');
    expect(connector).toBeDefined();
    expect(connector!.name).toBe('ElasticSearch');
  });

  it('returns undefined for an unknown retriever name', () => {
    expect(freshGetRetrieverConfig('MongoDB')).toBeUndefined();
  });

  it('returns the second retriever when looked up by name', () => {
    const connector = freshGetRetrieverConfig('Cloudant');
    expect(connector!.name).toBe('Cloudant');
  });
});

// ---------------------------------------------------------------------------
// getDatabaseConnector()
// ---------------------------------------------------------------------------

describe('getDatabaseConnector()', () => {
  afterEach(() => {
    delete process.env.STORE_API_KEY;
  });

  it('returns the store connector when configured', () => {
    process.env.STORE_API_KEY = 'store-secret';
    const store = freshGetDatabaseConnector();
    expect(store).toBeDefined();
    expect(store!.name).toBe('Cloudant');
  });

  it('returns undefined when store is not in config', () => {
    const { store, ...noStore } = mockConfig;
    expect(freshGetDatabaseConnector(noStore as any)).toBeUndefined();
  });
});

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for GET /api/configuration
 *
 * The route now uses the bundled TypeScript config (no SYSTEM_CONFIGURATION
 * env var). Tests mock @/src/config/system and @/src/common/utilities/configuration
 * to control what the route returns.
 * No live APIs.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/src/common/utilities/logger', () => ({
  logger: {
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  extractRequestContext: jest.fn(() => ({
    method: 'GET',
    path: '/api/configuration',
    query: {},
    userAgent: 'test',
  })),
}));

// Mock configuration utility so route tests are fully isolated
jest.mock('@/src/common/utilities/configuration', () => ({
  load: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { GET } from '@/src/app/api/configuration/route';
import { load } from '@/src/common/utilities/configuration';

const mockLoad = load as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sanitizedConfig = {
  authenticator: { enabled: true, provider: 'credentials' },
  retrievers: [
    {
      name: 'ElasticSearch',
      // endpoint stripped by sanitize()
      credentials: { provider: 'client' },
      settings: {
        configurable: true,
        max_count: 3,
        max_utterances: -1,
        query_syntax: '',
        templates: { projection: '${text}', display: '${text}' },
      },
    },
    {
      name: 'WatsonX.AI-ActiveRetriever',
      credentials: { provider: 'server' },
      settings: {
        configurable: false,
        max_count: 3,
        max_utterances: -1,
        query_syntax: '',
        templates: { projection: '${text}', display: '${text}' },
      },
    },
  ],
  generators: [
    {
      name: 'WatsonX.AI',
      // endpoint stripped by sanitize()
      credentials: { provider: 'server' },
      settings: { configurable: false, parameters: { max_new_tokens: 512 } },
    },
  ],
};

function makeRequest(): Request {
  return new Request('http://localhost/api/configuration');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/configuration', () => {
  beforeEach(() => {
    mockLoad.mockReset();
  });

  it('returns 200 with the sanitized configuration', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const config = await res.json();

    expect(config.authenticator.provider).toBe('credentials');
    expect(config.retrievers[0].name).toBe('ElasticSearch');
    expect(config.generators[0].name).toBe('WatsonX.AI');
  });

  it('calls load(true) to get the sanitized config', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);

    await GET(makeRequest());

    expect(mockLoad).toHaveBeenCalledWith(true);
  });

  it('strips endpoints from the sanitized response', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);
    const res = await GET(makeRequest());
    const config = await res.json();

    config.retrievers.forEach((r: any) => expect(r.endpoint).toBeUndefined());
    config.generators.forEach((g: any) => expect(g.endpoint).toBeUndefined());
  });

  it('strips credentials details (api_key, project_id) from the sanitized response', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);
    const res = await GET(makeRequest());
    const config = await res.json();

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

  it('preserves credentials.provider in the sanitized response', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);
    const res = await GET(makeRequest());
    const config = await res.json();

    expect(config.retrievers[1].credentials.provider).toBe('server');
    expect(config.generators[0].credentials.provider).toBe('server');
  });

  it('client-mode connectors retain provider: client', async () => {
    mockLoad.mockReturnValue(sanitizedConfig);
    const res = await GET(makeRequest());
    const config = await res.json();

    expect(config.retrievers[0].credentials.provider).toBe('client');
  });
});

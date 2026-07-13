/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for GET /api/models
 *
 * Mocks: next-auth session, generator connector factory, configuration utilities,
 *        and the connectorCache module.
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
    path: '/api/models',
    query: {},
    userAgent: 'test',
  })),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

const mockGetGenerator = jest.fn();
jest.mock('@/src/common/connectors/generator', () => ({
  getGenerator: (...args: any[]) => mockGetGenerator(...args),
}));

const mockGetGeneratorConfig = jest.fn();
jest.mock('@/src/common/utilities/configuration', () => ({
  getGeneratorConfig: (...args: any[]) => mockGetGeneratorConfig(...args),
  getRetrieverConfig: jest.fn(),
  load: jest.fn(),
}));

jest.mock('@/src/app/api/auth/[...nextauth]/options', () => ({
  authOptions: {},
}));

// Cache mock — replaced per-test as needed
const mockCacheGet = jest.fn().mockReturnValue(null);
const mockCacheSet = jest.fn();
jest.mock('@/src/common/utilities/connectorCache', () => ({
  modelsCache: {
    get: (...args: any[]) => mockCacheGet(...args),
    set: (...args: any[]) => mockCacheSet(...args),
  },
  collectionsCache: { get: jest.fn().mockReturnValue(null), set: jest.fn() },
  buildCacheKey: (...parts: string[]) => parts.join('::'),
  credentialFingerprint: jest.fn().mockReturnValue('server'),
  CONNECTOR_CACHE_TTL_MS: 3_600_000,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { GET } from '@/src/app/api/models/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(query: Record<string, string> = {}): Request {
  const params = new URLSearchParams({
    connector_name: 'WatsonX.AI',
    provider: 'server',
    ...query,
  });
  return new Request(`http://localhost/api/models?${params}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/models', () => {
  const mockGetModels = jest.fn();
  const fakeGenerator = { getModels: mockGetModels };

  const fakeConnector = {
    name: 'WatsonX.AI',
    endpoint: 'https://us-south.ml.cloud.ibm.com',
    credentials: {
      provider: 'server',
      api_key: 'srv-key',
      project_id: 'proj1',
    },
    settings: { configurable: false, parameters: { max_new_tokens: 512 } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockReturnValue(null); // default: cache miss
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    mockGetGeneratorConfig.mockReturnValue(fakeConnector);
    mockGetGenerator.mockReturnValue(fakeGenerator);
    mockGetModels.mockResolvedValue([
      { id: 'ibm/granite-13b', name: 'Granite 13B' },
      { id: 'ibm/granite-3b', name: 'Granite 3B' },
    ]);
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 when required query params are missing', async () => {
    const res = await GET(new Request('http://localhost/api/models'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with all models when no name filter', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const models = await res.json();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('ibm/granite-13b');
  });

  it('filters models by name regex when name param is provided', async () => {
    const res = await GET(makeRequest({ name: 'Granite 13' }));
    expect(res.status).toBe(200);
    const models = await res.json();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('ibm/granite-13b');
  });

  it('returns empty array when name filter matches nothing', async () => {
    const res = await GET(makeRequest({ name: 'nonexistent' }));
    const models = await res.json();
    expect(models).toHaveLength(0);
  });

  it('returns 404 when connector is not found (server-mode)', async () => {
    mockGetGeneratorConfig.mockReturnValue(undefined);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 503 when getModels throws', async () => {
    mockGetModels.mockRejectedValue(new Error('timeout'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it('uses session credentials when provider=client and creds exist', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {
        generators: {
          'WatsonX.AI': {
            endpoint: 'https://us-south.ml.cloud.ibm.com',
            api_key: 'client-k',
            project_id: 'p',
          },
        },
      },
    });

    const res = await GET(makeRequest({ provider: 'client' }));
    expect(res.status).toBe(200);
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'WatsonX.AI',
      'https://us-south.ml.cloud.ibm.com',
      'client-k',
      'p',
    );
  });

  // ---------------------------------------------------------------------------
  // No-auth connector (authentication: 'none')
  // ---------------------------------------------------------------------------

  const ollamaConnector = {
    name: 'Ollama',
    endpoint: 'http://localhost:11434',
    authentication: 'none',
    credentials: { provider: 'client' },
    settings: { configurable: true, parameters: { max_new_tokens: 512 } },
  };

  it('resolves a no-auth connector from config without session credentials', async () => {
    // Regression for the credential-store race: an empty session must still work.
    mockGetGeneratorConfig.mockReturnValue(ollamaConnector);
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });

    const res = await GET(
      makeRequest({ connector_name: 'Ollama', provider: 'client' }),
    );
    expect(res.status).toBe(200);
    // Constructed from config endpoint, with no api_key/project_id.
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'Ollama',
      'http://localhost:11434',
      undefined,
      undefined,
    );
  });

  it('honors a loopback endpoint override for a no-auth connector', async () => {
    mockGetGeneratorConfig.mockReturnValue(ollamaConnector);

    const res = await GET(
      makeRequest({
        connector_name: 'Ollama',
        provider: 'client',
        endpoint: 'http://127.0.0.1:9999',
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'Ollama',
      'http://127.0.0.1:9999',
      undefined,
      undefined,
    );
  });

  it('rejects a remote endpoint override when the remote flag is off', async () => {
    const prev = process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    delete process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    mockGetGeneratorConfig.mockReturnValue(ollamaConnector);

    const res = await GET(
      makeRequest({
        connector_name: 'Ollama',
        provider: 'client',
        endpoint: 'http://evil.example.com:11434',
      }),
    );
    expect(res.status).toBe(400);
    expect(mockGetGenerator).not.toHaveBeenCalled();

    process.env.ALLOW_REMOTE_LOCAL_CONNECTOR = prev;
  });

  it('allows a remote endpoint override when the remote flag is on', async () => {
    const prev = process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    process.env.ALLOW_REMOTE_LOCAL_CONNECTOR = 'true';
    mockGetGeneratorConfig.mockReturnValue(ollamaConnector);

    const res = await GET(
      makeRequest({
        connector_name: 'Ollama',
        provider: 'client',
        endpoint: 'http://gpu-box.internal:11434',
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'Ollama',
      'http://gpu-box.internal:11434',
      undefined,
      undefined,
    );

    process.env.ALLOW_REMOTE_LOCAL_CONNECTOR = prev;
  });

  // ---------------------------------------------------------------------------
  // Cache behaviour
  // ---------------------------------------------------------------------------

  it('returns cached data without calling getModels on a cache hit', async () => {
    const cachedModels = [{ id: 'cached-model', name: 'Cached' }];
    mockCacheGet.mockReturnValue(cachedModels);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cachedModels);
    expect(mockGetModels).not.toHaveBeenCalled();
  });

  it('calls getModels and populates cache on a cache miss', async () => {
    mockCacheGet.mockReturnValue(null); // explicit miss

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockGetModels).toHaveBeenCalledTimes(1);
    // Cache was populated with the result
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ id: 'ibm/granite-13b' }),
      ]),
      3_600_000,
    );
  });

  it('calls getModels even when cache has data when force=true', async () => {
    const cachedModels = [{ id: 'stale-model', name: 'Stale' }];
    mockCacheGet.mockReturnValue(cachedModels);

    const res = await GET(makeRequest({ force: 'true' }));
    expect(res.status).toBe(200);
    // Should have called the real service, not returned the stale cache
    expect(mockGetModels).toHaveBeenCalledTimes(1);
    const models = await res.json();
    expect(models[0].id).toBe('ibm/granite-13b');
  });

  it('does not populate cache when getModels throws', async () => {
    mockGetModels.mockRejectedValue(new Error('service unavailable'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

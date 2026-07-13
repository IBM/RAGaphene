/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for GET /api/collections
 *
 * Mocks: next-auth session, next/headers, retriever connector factory,
 *        configuration utilities, logger, and the connectorCache module.
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
    path: '/api/collections',
    query: {},
    userAgent: 'test',
  })),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

const mockHeadersObj = {
  has: jest.fn().mockReturnValue(false),
  get: jest.fn().mockReturnValue(null),
};
jest.mock('next/headers', () => ({
  headers: () => mockHeadersObj,
}));

const mockGetRetriever = jest.fn();
jest.mock('@/src/common/connectors/retriever', () => ({
  getRetriever: (...args: any[]) => mockGetRetriever(...args),
}));

const mockGetRetrieverConfig = jest.fn();
jest.mock('@/src/common/utilities/configuration', () => ({
  getRetrieverConfig: (...args: any[]) => mockGetRetrieverConfig(...args),
  getGeneratorConfig: jest.fn(),
  load: jest.fn(),
}));

jest.mock('@/src/app/api/auth/[...nextauth]/options', () => ({
  authOptions: {},
}));

// Cache mock — replaced per-test as needed
const mockCacheGet = jest.fn().mockReturnValue(null);
const mockCacheSet = jest.fn();
jest.mock('@/src/common/utilities/connectorCache', () => ({
  collectionsCache: {
    get: (...args: any[]) => mockCacheGet(...args),
    set: (...args: any[]) => mockCacheSet(...args),
  },
  modelsCache: { get: jest.fn().mockReturnValue(null), set: jest.fn() },
  buildCacheKey: (...parts: string[]) => parts.join('::'),
  credentialFingerprint: jest.fn().mockReturnValue('server'),
  CONNECTOR_CACHE_TTL_MS: 3_600_000,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { GET } from '@/src/app/api/collections/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(query: Record<string, string> = {}): Request {
  const params = new URLSearchParams({
    connector_name: 'ElasticSearch',
    provider: 'server',
    ...query,
  });
  return new Request(`http://localhost/api/collections?${params}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/collections', () => {
  const mockGetCollections = jest.fn();
  const fakeRetriever = { getCollections: mockGetCollections };

  const fakeConnector = {
    name: 'ElasticSearch',
    endpoint: 'http://es:9200',
    credentials: { provider: 'server', apiKey: 'srv-key' },
    settings: {
      configurable: false,
      max_count: 3,
      max_utterances: -1,
      query_syntax: '',
      templates: { projection: '${text}', display: '${text}' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockReturnValue(null); // default: cache miss
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    mockGetRetrieverConfig.mockReturnValue(fakeConnector);
    mockGetRetriever.mockReturnValue(fakeRetriever);
    mockGetCollections.mockResolvedValue([
      { name: 'corpus-a', size: 100, uuid: 'uuid-a' },
      { name: 'corpus-b', size: 200, uuid: 'uuid-b' },
    ]);
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 when required query params are missing', async () => {
    const res = await GET(new Request('http://localhost/api/collections'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with all collections when no name filter', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const cols = await res.json();
    expect(cols).toHaveLength(2);
    expect(cols[0].name).toBe('corpus-a');
  });

  it('filters collections by name when name param is provided', async () => {
    const res = await GET(makeRequest({ name: 'corpus-a' }));
    expect(res.status).toBe(200);
    const cols = await res.json();
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe('corpus-a');
  });

  it('returns 404 when connector endpoint is missing', async () => {
    mockGetRetrieverConfig.mockReturnValue({
      ...fakeConnector,
      endpoint: undefined,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 503 when getCollections throws', async () => {
    mockGetCollections.mockRejectedValue(new Error('connection refused'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  // ---------------------------------------------------------------------------
  // Cache behaviour
  // ---------------------------------------------------------------------------

  it('returns cached data without calling getCollections on a cache hit', async () => {
    const cachedCols = [{ name: 'cached-corpus', size: 50, uuid: 'uuid-c' }];
    mockCacheGet.mockReturnValue(cachedCols);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cachedCols);
    expect(mockGetCollections).not.toHaveBeenCalled();
  });

  it('calls getCollections and populates cache on a cache miss', async () => {
    mockCacheGet.mockReturnValue(null); // explicit miss

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ name: 'corpus-a' })]),
      3_600_000,
    );
  });

  it('calls getCollections even when cache has data when force=true', async () => {
    const cachedCols = [{ name: 'stale-corpus', size: 1, uuid: 'uuid-s' }];
    mockCacheGet.mockReturnValue(cachedCols);

    const res = await GET(makeRequest({ force: 'true' }));
    expect(res.status).toBe(200);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    const cols = await res.json();
    expect(cols[0].name).toBe('corpus-a');
  });

  it('does not populate cache when getCollections throws', async () => {
    mockGetCollections.mockRejectedValue(new Error('service unavailable'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

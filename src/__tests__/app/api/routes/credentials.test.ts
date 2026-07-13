/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for POST /api/credentials and GET /api/credentials
 *
 * Mocks: next-auth (getServerSession), logger.
 * No external service calls.
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
    method: 'POST',
    path: '/api/credentials',
    query: {},
    userAgent: 'test',
  })),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock('@/src/app/api/auth/[...nextauth]/options', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { POST, GET } from '@/src/app/api/credentials/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validPostBody = {
  generators: {
    'WatsonX.AI': {
      api_key: 'wx-key',
      project_id: 'proj-1',
    },
  },
};

function makePostRequest(body: any): Request {
  return new Request('http://localhost/api/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request('http://localhost/api/credentials', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// POST /api/credentials
// ---------------------------------------------------------------------------

describe('POST /api/credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makePostRequest(validPostBody));
    expect(res.status).toBe(401);
  });

  it('returns 200 with success=true when credentials are valid', async () => {
    const res = await POST(makePostRequest(validPostBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('accepts retrievers-only payload', async () => {
    const res = await POST(
      makePostRequest({
        retrievers: {
          ElasticSearch: { endpoint: 'http://es:9200', api_key: 'key' },
        },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('accepts both retrievers and generators', async () => {
    const res = await POST(
      makePostRequest({
        retrievers: {
          ElasticSearch: { endpoint: 'http://es:9200', api_key: 'k' },
        },
        generators: { 'WatsonX.AI': { api_key: 'wx', project_id: 'p' } },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 when neither retrievers nor generators are provided', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/credentials
// ---------------------------------------------------------------------------

describe('GET /api/credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns hasRetrievers=false and hasGenerators=false when no credentials in session', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasRetrievers).toBe(false);
    expect(body.hasGenerators).toBe(false);
    expect(body.retrieverNames).toEqual([]);
    expect(body.generatorNames).toEqual([]);
  });

  it('returns connector names when credentials are present in session', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {
        retrievers: { ElasticSearch: { api_key: 'k' } },
        generators: {
          'WatsonX.AI': { api_key: 'wx' },
          OpenAI: { api_key: 'oai' },
        },
      },
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasRetrievers).toBe(true);
    expect(body.hasGenerators).toBe(true);
    expect(body.retrieverNames).toEqual(['ElasticSearch']);
    expect(body.generatorNames).toContain('WatsonX.AI');
    expect(body.generatorNames).toContain('OpenAI');
  });

  it('does not return actual credential values', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {
        generators: { 'WatsonX.AI': { api_key: 'super-secret' } },
      },
    });
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('super-secret');
  });
});

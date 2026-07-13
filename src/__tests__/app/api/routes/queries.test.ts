/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for POST /api/queries
 *
 * Mocks: next-auth session, next/headers, retriever connector factory,
 *        configuration utilities, and logger.
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
    method: 'POST',
    path: '/api/queries',
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

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { POST } from '@/src/app/api/queries/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validBody = {
  connector_name: 'ElasticSearch',
  provider: 'server',
  query: {
    query: { match: { text: 'What is retrieval augmented generation?' } },
  },
  collection: 'my-corpus',
  max_count: 3,
  projection_template: '${text}',
  display_template: '${text}',
};

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/queries', () => {
  const mockRetrieve = jest.fn();
  const fakeRetriever = { retrieve: mockRetrieve };

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

  const fakeDocs = [
    {
      type: 'DOCUMENT',
      document_id: 'doc1',
      text: 'RAG is a technique...',
      formatted_text: 'RAG is a technique...',
      score: 0.95,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    mockGetRetrieverConfig.mockReturnValue(fakeConnector);
    mockGetRetriever.mockReturnValue(fakeRetriever);
    mockRetrieve.mockResolvedValue(fakeDocs);
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ connector_name: 'ElasticSearch' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with documents on success', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].document_id).toBe('doc1');
  });

  it('calls retrieve with the correct arguments', async () => {
    await POST(makeRequest(validBody));
    expect(mockRetrieve).toHaveBeenCalledWith(
      'my-corpus',
      { query: { match: { text: 'What is retrieval augmented generation?' } } },
      3,
      '${text}',
      '${text}',
    );
  });

  it('returns 404 when connector is not found', async () => {
    mockGetRetrieverConfig.mockReturnValue(undefined);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('returns 503 with ProjectionError message when template variable missing', async () => {
    mockRetrieve.mockRejectedValue({
      name: 'ProjectionError',
      message: 'Missing "url" field',
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain('Missing "url" field');
  });

  it('returns 503 with ResponseError message when index bad', async () => {
    mockRetrieve.mockRejectedValue({
      name: 'ResponseError',
      message: 'index_not_found_exception',
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain('index_not_found_exception');
  });

  it('returns 503 with generic message on other errors', async () => {
    mockRetrieve.mockRejectedValue(new Error('connection reset'));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain('Failed to retrieve documents');
  });
});

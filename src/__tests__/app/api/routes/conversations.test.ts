/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for POST /api/conversations
 *
 * No auth required. Mocks: getDatabaseConnector, getDatabase, logger.
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
    path: '/api/conversations',
    query: {},
    userAgent: 'test',
  })),
}));

const mockGetDatabaseConnector = jest.fn();
jest.mock('@/src/common/utilities/configuration', () => ({
  getDatabaseConnector: (...args: any[]) => mockGetDatabaseConnector(...args),
  getGeneratorConfig: jest.fn(),
  getRetrieverConfig: jest.fn(),
  load: jest.fn(),
}));

const mockSave = jest.fn();
const mockGetDatabase = jest.fn();
jest.mock('@/src/common/connectors/database', () => ({
  getDatabase: (...args: any[]) => mockGetDatabase(...args),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { POST } from '@/src/app/api/conversations/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validConversation = {
  author: 'alice',
  messages: [
    { speaker: 'user', text: 'Hello', timestamp: 1000 },
    { speaker: 'agent', text: 'Hi there', timestamp: 1001 },
  ],
};

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/conversations', () => {
  const fakeConnector = {
    name: 'Cloudant',
    endpoint: 'https://cloudant.example.com',
    credentials: { provider: 'server', api_key: 'db-key' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabaseConnector.mockReturnValue(fakeConnector);
    mockSave.mockResolvedValue('conv-id-123');
    mockGetDatabase.mockReturnValue({ save: mockSave });
  });

  it('returns 200 with the saved conversation ID on success', async () => {
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBe('conv-id-123');
  });

  it('calls store.save with the validated conversation object', async () => {
    await POST(makeRequest({ conversation: validConversation }));
    expect(mockSave).toHaveBeenCalledWith(validConversation);
  });

  it('calls getDatabase with the connector endpoint and api_key', async () => {
    await POST(makeRequest({ conversation: validConversation }));
    expect(mockGetDatabase).toHaveBeenCalledWith(
      'https://cloudant.example.com',
      'db-key',
    );
  });

  it('returns 400 when request body has no conversation field', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when conversation is an empty object', async () => {
    const res = await POST(makeRequest({ conversation: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when database connector is not configured', async () => {
    mockGetDatabaseConnector.mockReturnValue(undefined);
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when connector endpoint is missing', async () => {
    mockGetDatabaseConnector.mockReturnValue({
      ...fakeConnector,
      endpoint: undefined,
    });
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when connector api_key is missing', async () => {
    mockGetDatabaseConnector.mockReturnValue({
      ...fakeConnector,
      credentials: { provider: 'server' },
    });
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(404);
  });

  it('returns 503 when store.save throws a ConnectionError', async () => {
    const err = new Error('timeout');
    err.name = 'ConnectionError';
    mockSave.mockRejectedValue(err);
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain('Failed to establish connection');
  });

  it('returns 503 when store.save throws a generic error', async () => {
    mockSave.mockRejectedValue(new Error('write failed'));
    const res = await POST(makeRequest({ conversation: validConversation }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain('Failed to save conversation');
  });
});

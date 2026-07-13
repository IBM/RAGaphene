/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for POST /api/messages
 *
 * Mocks: next-auth session, next/headers, generator connector factory,
 *        configuration utilities, and the logger.
 * No live APIs are called.
 */

// ---------------------------------------------------------------------------
// Mocks (declared before imports)
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
    path: '/api/messages',
    query: {},
    userAgent: 'test',
  })),
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

const mockHeaders = jest.fn();
jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
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

// NextAuth route import required by authOptions
jest.mock('@/src/app/api/auth/[...nextauth]/options', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { POST } from '@/src/app/api/messages/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validCompletionBody = {
  connector_name: 'WatsonX.AI',
  provider: 'server',
  model_id: 'ibm/granite-13b',
  mode: 'completion',
  input: 'What is RAG?',
  parameters: { max_new_tokens: 100 },
};

const validChatBody = {
  connector_name: 'WatsonX.AI',
  provider: 'server',
  model_id: 'ibm/granite-13b',
  mode: 'chat_completion',
  conversation: [{ speaker: 'user', text: 'What is RAG?', timestamp: 1000 }],
  documents: [],
  system_instruction: 'You are helpful.',
  context_template: '[DOCUMENT]\n${TEXT}\n[END]\n',
  parameters: { max_new_tokens: 100 },
};

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/messages', () => {
  const mockGenerate = jest.fn();
  const mockChat = jest.fn();
  const fakeGenerator = { generate: mockGenerate, chat: mockChat };

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
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    mockHeaders.mockReturnValue({ has: () => false, get: () => null });
    mockGetGeneratorConfig.mockReturnValue(fakeConnector);
    mockGetGenerator.mockReturnValue(fakeGenerator);
    mockGenerate.mockResolvedValue({ results: [{ generated_text: 'answer' }] });
    mockChat.mockResolvedValue({
      results: [{ generated_text: 'chat answer' }],
    });
  });

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(validCompletionBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required field is missing', async () => {
    const res = await POST(makeRequest({ connector_name: 'WatsonX.AI' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when mode is missing', async () => {
    const res = await POST(
      makeRequest({ ...validCompletionBody, mode: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when mode=completion but input is missing', async () => {
    const res = await POST(
      makeRequest({ ...validCompletionBody, input: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when mode=chat_completion but conversation is missing', async () => {
    const res = await POST(
      makeRequest({ ...validChatBody, conversation: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it('calls generator.generate for mode=completion and returns 200', async () => {
    const res = await POST(makeRequest(validCompletionBody));
    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledWith(
      'ibm/granite-13b',
      'What is RAG?',
      { max_new_tokens: 100 },
    );
    const body = await res.json();
    expect(body.results[0].generated_text).toBe('answer');
  });

  it('calls generator.chat for mode=chat_completion with raw data and returns 200', async () => {
    const res = await POST(makeRequest(validChatBody));
    expect(res.status).toBe(200);
    expect(mockChat).toHaveBeenCalledWith(
      'ibm/granite-13b',
      [{ speaker: 'user', text: 'What is RAG?', timestamp: 1000 }],
      [],
      'You are helpful.',
      '[DOCUMENT]\n${TEXT}\n[END]\n',
      { max_new_tokens: 100 },
    );
    const body = await res.json();
    expect(body.results[0].generated_text).toBe('chat answer');
  });

  it('uses default context_template when not provided', async () => {
    const bodyWithoutTemplate = {
      ...validChatBody,
      context_template: undefined,
    };
    const res = await POST(makeRequest(bodyWithoutTemplate));
    expect(res.status).toBe(200);
    expect(mockChat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(String),
      '[DOCUMENT]\n${TEXT}\n[END]\n', // default
      expect.any(Object),
    );
  });

  it('uses session credentials when provider=client and creds exist in session', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {
        generators: {
          'WatsonX.AI': { api_key: 'client-key', project_id: 'p2' },
        },
      },
    });

    const res = await POST(
      makeRequest({ ...validCompletionBody, provider: 'client' }),
    );
    expect(res.status).toBe(200);
    // generator was initialized with client key
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'WatsonX.AI',
      expect.any(String),
      'client-key',
      'p2',
    );
  });

  it('returns 400 when provider=client but no session credentials', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });
    const res = await POST(
      makeRequest({ ...validCompletionBody, provider: 'client' }),
    );
    expect(res.status).toBe(400);
  });

  it('generates via a no-auth connector with no session credentials', async () => {
    // Regression for the credential-store race on the generation path.
    mockGetGeneratorConfig.mockReturnValue({
      name: 'Ollama',
      endpoint: 'http://localhost:11434',
      authentication: 'none',
      credentials: { provider: 'client' },
      settings: { configurable: true, parameters: { max_new_tokens: 512 } },
    });
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Alice' },
      connectorCredentials: {},
    });

    const res = await POST(
      makeRequest({
        ...validCompletionBody,
        connector_name: 'Ollama',
        provider: 'client',
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGetGenerator).toHaveBeenCalledWith(
      'Ollama',
      'http://localhost:11434',
      undefined,
      undefined,
    );
  });

  it('returns 404 when connector is not found', async () => {
    mockGetGeneratorConfig.mockReturnValue(undefined);
    const res = await POST(makeRequest(validCompletionBody));
    expect(res.status).toBe(404);
  });

  it('returns 503 when getGenerator throws', async () => {
    mockGetGenerator.mockImplementation(() => {
      throw new Error('bad credentials');
    });
    const res = await POST(makeRequest(validCompletionBody));
    expect(res.status).toBe(503);
  });

  it('returns 503 when generator.generate throws', async () => {
    mockGenerate.mockRejectedValue(new Error('upstream failure'));
    const res = await POST(makeRequest(validCompletionBody));
    expect(res.status).toBe(503);
  });

  it('returns 503 when generator.chat throws', async () => {
    mockChat.mockRejectedValue(new Error('chat upstream failure'));
    const res = await POST(makeRequest(validChatBody));
    expect(res.status).toBe(503);
  });
});

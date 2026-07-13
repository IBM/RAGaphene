/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/utilities/messages.ts
 *
 * Mocks: global.fetch (/api/messages), dynamic import of ./credentials,
 *        retrieve (search.ts).
 * No live API calls.
 */

// Mock credentials before any dynamic import resolves
jest.mock('@/src/common/utilities/credentials', () => ({
  storeConnectorCredentials: jest.fn().mockResolvedValue(true),
}));

// Mock search.retrieve so sendMessage tests don't need a real retriever
jest.mock('@/src/common/utilities/search', () => ({
  retrieve: jest.fn(),
}));

import {
  deleteTurn,
  generate,
  chat,
  sendMessage,
} from '@/src/common/utilities/messages';
import { retrieve } from '@/src/common/utilities/search';
import { storeConnectorCredentials } from '@/src/common/utilities/credentials';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessage(speaker: 'user' | 'agent', text: string): any {
  return { speaker, text, timestamp: Date.now() };
}

function makeGenerator(
  mode: 'completion' | 'chat_completion' = 'completion',
): any {
  return {
    id: 'ibm/granite-13b',
    mode,
    settings: {
      prompt: {
        template: '${SYSTEM_INST}\n\n${CONTEXT}\n\n${INPUT}',
        input: '${SPEAKER}: ${TEXT}\n',
        system_instruction: 'You are a helpful assistant.',
        context: '[DOCUMENT]\n${TEXT}\n[END]\n',
      },
      parameters: { max_new_tokens: 200 },
    },
    connector: {
      name: 'WatsonX.AI',
      endpoint: 'https://us-south.ml.cloud.ibm.com',
      credentials: { provider: 'server' },
    },
  };
}

function makeRetriever(): any {
  return {
    collection: { name: 'corpus' },
    settings: {
      max_count: 3,
      max_utterances: -1,
      query_syntax: '{"query": "${QUERY}"}',
      templates: { projection: '${text}', display: '${text}' },
    },
    connector: {
      name: 'ElasticSearch',
      endpoint: 'http://es:9200',
      credentials: { provider: 'server' },
    },
  };
}

const fakeDocs = [
  {
    type: 'DOCUMENT' as const,
    document_id: 'd1',
    text: 'RAG stands for retrieval augmented generation.',
    score: 0.9,
  },
];

// ---------------------------------------------------------------------------
// deleteTurn()
// ---------------------------------------------------------------------------

describe('deleteTurn()', () => {
  it('removes the last user+agent pair', () => {
    const messages = [
      makeMessage('user', 'Hello'),
      makeMessage('agent', 'Hi'),
      makeMessage('user', 'How are you?'),
      makeMessage('agent', 'Fine'),
    ];
    const result = deleteTurn(messages);
    expect(result).toHaveLength(2);
    expect(result[result.length - 1].text).toBe('Hi');
  });

  it('returns a shorter array with a single turn', () => {
    const messages = [
      makeMessage('user', 'Question'),
      makeMessage('agent', 'Answer'),
    ];
    const result = deleteTurn(messages);
    expect(result.length).toBeLessThan(messages.length);
  });
});

// ---------------------------------------------------------------------------
// generate()
// ---------------------------------------------------------------------------

describe('generate()', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [{ generated_text: 'This is the answer.' }],
        }),
    } as Response);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('returns output text on success', async () => {
    const messages = [makeMessage('user', 'What is RAG?')];
    const [output, notifications] = await generate(
      makeGenerator(),
      messages,
      fakeDocs,
    );
    expect(output?.text).toBe('This is the answer.');
    expect(notifications).toHaveLength(0);
  });

  it('POSTs to /api/messages with mode=completion and correct fields', async () => {
    const messages = [makeMessage('user', 'What is RAG?')];
    await generate(makeGenerator(), messages, fakeDocs);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/messages');
    const body = JSON.parse(opts.body);
    expect(body.model_id).toBe('ibm/granite-13b');
    expect(body.connector_name).toBe('WatsonX.AI');
    expect(body.provider).toBe('server');
    expect(body.mode).toBe('completion');
    // input should be a pre-built prompt string
    expect(typeof body.input).toBe('string');
  });

  it('includes documents in the prompt via context template', async () => {
    const messages = [makeMessage('user', 'What is RAG?')];
    await generate(makeGenerator(), messages, fakeDocs);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input).toContain(
      'RAG stands for retrieval augmented generation.',
    );
  });

  it('returns a warning notification when results array is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ results: [] }),
    } as Response);
    const [output, notifications] = await generate(
      makeGenerator(),
      [makeMessage('user', 'hi')],
      [],
    );
    expect(output).toBeUndefined();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe('error');
  });

  it('returns a TimeoutError notification when fetch throws AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'TimeoutError';
    mockFetch.mockRejectedValueOnce(abortErr);
    const [, notifications] = await generate(
      makeGenerator(),
      [makeMessage('user', 'hi')],
      [],
    );
    expect(notifications[0].subtitle).toContain('more than usual traffic');
  });

  it('returns a generic notification on other fetch errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const [, notifications] = await generate(
      makeGenerator(),
      [makeMessage('user', 'hi')],
      [],
    );
    expect(notifications[0].kind).toBe('error');
  });

  it('calls storeConnectorCredentials when provider is "client"', async () => {
    const gen = makeGenerator();
    gen.connector.credentials.provider = 'client';
    gen.connector.credentials.api_key = 'client-key';
    await generate(gen, [makeMessage('user', 'hi')], []);
    expect(storeConnectorCredentials).toHaveBeenCalledTimes(1);
  });

  it('does not call storeConnectorCredentials when provider is "server"', async () => {
    await generate(makeGenerator(), [makeMessage('user', 'hi')], []);
    expect(storeConnectorCredentials).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// chat()
// ---------------------------------------------------------------------------

describe('chat()', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [{ generated_text: 'Chat response.' }],
        }),
    } as Response);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('returns output text on success', async () => {
    const messages = [makeMessage('user', 'Hello')];
    const [output, notifications] = await chat(
      makeGenerator('chat_completion'),
      messages,
      [],
    );
    expect(output?.text).toBe('Chat response.');
    expect(notifications).toHaveLength(0);
  });

  it('POSTs to /api/messages with mode=chat_completion and raw data', async () => {
    const messages = [makeMessage('user', 'Hello')];
    await chat(makeGenerator('chat_completion'), messages, fakeDocs);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/messages');
    const body = JSON.parse(opts.body);
    expect(body.mode).toBe('chat_completion');
    // conversation should be the raw messages array (not pre-built wire messages)
    expect(Array.isArray(body.conversation)).toBe(true);
    expect(body.conversation[0].speaker).toBe('user');
    expect(body.conversation[0].text).toBe('Hello');
    // documents should be passed through as-is
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.documents[0].text).toContain('RAG stands for');
  });

  it('passes system_instruction and context_template from generator prompt', async () => {
    const messages = [makeMessage('user', 'Hello')];
    await chat(makeGenerator('chat_completion'), messages, []);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system_instruction).toBe('You are a helpful assistant.');
    expect(body.context_template).toBe('[DOCUMENT]\n${TEXT}\n[END]\n');
  });

  it('returns a notification on empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ results: [] }),
    } as Response);
    const [output, notifications] = await chat(
      makeGenerator('chat_completion'),
      [makeMessage('user', 'hi')],
      [],
    );
    expect(output).toBeUndefined();
    expect(notifications).toHaveLength(1);
  });

  it('does NOT pre-build wire messages (no role/content structure in body.conversation)', async () => {
    const messages = [makeMessage('user', 'Hello')];
    await chat(makeGenerator('chat_completion'), messages, []);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // conversation should use app-level shape (speaker/text), not wire shape (role/content)
    expect(body.conversation[0]).not.toHaveProperty('role');
    expect(body.conversation[0]).toHaveProperty('speaker');
  });
});

// ---------------------------------------------------------------------------
// sendMessage()
// ---------------------------------------------------------------------------

describe('sendMessage()', () => {
  let mockFetch: jest.SpyInstance;
  const mockRetrieve = retrieve as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieve.mockResolvedValue([fakeDocs, []]);
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [{ generated_text: 'Full response.' }],
        }),
    } as Response);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('calls retrieve then generate, returns a Message on success', async () => {
    const messages = [makeMessage('user', 'What is RAG?')];
    const [message, notifications] = await sendMessage(
      makeGenerator(),
      makeRetriever(),
      messages,
    );
    expect(message).toBeDefined();
    expect(message!.speaker).toBe('agent');
    expect(message!.text).toBe('Full response.');
    expect(message!.contexts).toEqual(fakeDocs);
    expect(notifications).toHaveLength(0);
  });

  it('passes retriever notifications through', async () => {
    const retrieverWarn = {
      title: 'Retrieval warning',
      subtitle: 'something happened',
      kind: 'warning' as const,
    };
    mockRetrieve.mockResolvedValueOnce([[], [retrieverWarn]]);
    const messages = [makeMessage('user', 'hi')];
    const [, notifications] = await sendMessage(
      makeGenerator(),
      makeRetriever(),
      messages,
    );
    expect(
      notifications.some((n: any) => n.title === 'Retrieval warning'),
    ).toBe(true);
  });

  it('passes generate notifications through', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ results: [] }), // triggers error notification
    } as Response);
    const messages = [makeMessage('user', 'hi')];
    const [, notifications] = await sendMessage(
      makeGenerator(),
      makeRetriever(),
      messages,
    );
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('uses max_utterances slice when not -1', async () => {
    const retriever = makeRetriever();
    retriever.settings.max_utterances = 2;
    const messages = [
      makeMessage('user', 'msg1'),
      makeMessage('agent', 'resp1'),
      makeMessage('user', 'msg2'),
      makeMessage('agent', 'resp2'),
      makeMessage('user', 'msg3'),
    ];
    await sendMessage(makeGenerator(), retriever, messages);
    // With max_utterances=2, slice(-2) gives the last 2 messages: resp2 + msg3
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    const queryText: string = mockRetrieve.mock.calls[0][1];
    expect(queryText).toContain('msg3');
    expect(queryText).not.toContain('msg1');
    expect(queryText).not.toContain('msg2');
  });

  it('uses all messages when max_utterances is -1', async () => {
    const messages = [
      makeMessage('user', 'first'),
      makeMessage('agent', 'reply'),
      makeMessage('user', 'second'),
    ];
    await sendMessage(makeGenerator(), makeRetriever(), messages);
    const queryText: string = mockRetrieve.mock.calls[0][1];
    expect(queryText).toContain('first');
    expect(queryText).toContain('second');
  });

  it('returns undefined message (but no throw) when generate returns no output', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ results: [] }),
    } as Response);
    const [message, notifications] = await sendMessage(
      makeGenerator(),
      makeRetriever(),
      [makeMessage('user', 'hi')],
    );
    expect(message).toBeUndefined();
    expect(notifications.length).toBeGreaterThan(0);
  });
});

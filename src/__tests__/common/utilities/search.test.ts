/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/utilities/search.ts
 *
 * Mocks: global.fetch, dynamic import of ./credentials.
 * No live API calls.
 */

// Mock the credentials module before any import resolves it dynamically
jest.mock('@/src/common/utilities/credentials', () => ({
  storeConnectorCredentials: jest.fn().mockResolvedValue(true),
}));

import { retrieve } from '@/src/common/utilities/search';
import { storeConnectorCredentials } from '@/src/common/utilities/credentials';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const querySyntax = JSON.stringify({
  query: {
    text_expansion: {
      'ml.tokens': { model_id: '.elser_model_1', model_text: '${QUERY}' },
    },
  },
});

function makeRetriever(overrides: Partial<any> = {}): any {
  return {
    collection: { name: 'test-corpus' },
    settings: {
      max_count: 3,
      max_utterances: -1,
      query_syntax: querySyntax,
      templates: {
        projection: '${text}',
        display: '${text}',
      },
    },
    connector: {
      name: 'ElasticSearch',
      endpoint: 'http://es:9200',
      credentials: { provider: 'server' },
    },
    ...overrides,
  };
}

const fakeDocs = [
  { type: 'DOCUMENT', document_id: 'd1', text: 'hello world', score: 0.9 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('retrieve()', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(fakeDocs),
    } as Response);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('returns documents and empty notifications on success', async () => {
    const [docs, notifications] = await retrieve(
      makeRetriever(),
      'what is RAG?',
    );
    expect(docs).toEqual(fakeDocs);
    expect(notifications).toHaveLength(0);
  });

  it('POSTs to /api/queries with the correct payload', async () => {
    await retrieve(makeRetriever(), 'what is RAG?');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/queries');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.collection).toBe('test-corpus');
    expect(body.connector_name).toBe('ElasticSearch');
    expect(body.provider).toBe('server');
    expect(body.max_count).toBe(3);
    expect(body.projection_template).toBe('${text}');
    expect(body.display_template).toBe('${text}');
  });

  it('substitutes the query text into the query_syntax template', async () => {
    await retrieve(makeRetriever(), 'what is RAG?');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // The query object should have the query text substituted in
    expect(JSON.stringify(body.query)).toContain('what is RAG');
  });

  it('escapes special characters in the query text before substitution', async () => {
    await retrieve(makeRetriever(), 'what is "RAG"?');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Double quotes should be escaped so the JSON stays valid
    expect(JSON.stringify(body.query)).toContain('\\"RAG\\"');
  });

  it('uses the supplied max_count override instead of retriever default', async () => {
    await retrieve(makeRetriever(), 'query', 10);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_count).toBe(10);
  });

  it('falls back to retriever.settings.max_count when no override', async () => {
    await retrieve(makeRetriever(), 'query');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_count).toBe(3);
  });

  it('adds a warning notification when the API returns a non-200 status', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.resolve([]),
    } as Response);

    const [docs, notifications] = await retrieve(makeRetriever(), 'query');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe('warning');
  });

  it('calls storeConnectorCredentials when provider is "client"', async () => {
    const clientRetriever = makeRetriever({
      connector: {
        name: 'ElasticSearch',
        endpoint: 'http://es:9200',
        credentials: { provider: 'client', api_key: 'my-key' },
      },
    });
    await retrieve(clientRetriever, 'query');
    expect(storeConnectorCredentials).toHaveBeenCalledTimes(1);
  });

  it('does not call storeConnectorCredentials when provider is "server"', async () => {
    await retrieve(makeRetriever(), 'query');
    expect(storeConnectorCredentials).not.toHaveBeenCalled();
  });
});

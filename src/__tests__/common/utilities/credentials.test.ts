/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/utilities/credentials.ts
 *
 * Mocks: global.fetch (GET /api/auth/session, POST /api/auth/session).
 * No live network calls.
 */

import { storeConnectorCredentials } from '@/src/common/utilities/credentials';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionResponse(connectorCredentials: any = undefined): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve(connectorCredentials ? { connectorCredentials } : {}),
  } as Response;
}

function makeUpdateResponse(ok = true): Response {
  return { ok } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('storeConnectorCredentials()', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeSessionResponse()) // GET /api/auth/session
      .mockResolvedValueOnce(makeUpdateResponse()); // POST /api/auth/session
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('returns false when called with no arguments', async () => {
    mockFetch.mockRestore(); // no fetch calls expected
    mockFetch = jest.spyOn(global, 'fetch');
    const result = await storeConnectorCredentials();
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns true on successful session update', async () => {
    const result = await storeConnectorCredentials(undefined, {
      'WatsonX.AI': { api_key: 'k' },
    });
    expect(result).toBe(true);
  });

  it('GETs /api/auth/session first to read existing credentials', async () => {
    await storeConnectorCredentials({
      ElasticSearch: { endpoint: 'http://es:9200' },
    });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/session');
    expect(mockFetch.mock.calls[0][1]).toBeUndefined(); // plain GET
  });

  it('POSTs to /api/auth/session with merged connectorCredentials', async () => {
    await storeConnectorCredentials(
      { ElasticSearch: { endpoint: 'http://es:9200' } },
      { 'WatsonX.AI': { api_key: 'key1' } },
    );
    const [url, opts] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/auth/session');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(
      body.data.connectorCredentials.retrievers['ElasticSearch'].endpoint,
    ).toBe('http://es:9200');
    expect(
      body.data.connectorCredentials.generators['WatsonX.AI'].api_key,
    ).toBe('key1');
  });

  it('merges new credentials with existing session credentials', async () => {
    // Simulate an existing generator credential already in the session
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        makeSessionResponse({
          generators: { 'WatsonX.AI': { api_key: 'old-key' } },
        }),
      )
      .mockResolvedValueOnce(makeUpdateResponse());

    // Now store only a retriever credential
    await storeConnectorCredentials({
      ElasticSearch: { endpoint: 'http://es:9200' },
    });

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    const creds = body.data.connectorCredentials;
    // Existing generator credential must still be present
    expect(creds.generators['WatsonX.AI'].api_key).toBe('old-key');
    // New retriever credential must be added
    expect(creds.retrievers['ElasticSearch'].endpoint).toBe('http://es:9200');
  });

  it('updating a generator does not wipe existing retrievers', async () => {
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        makeSessionResponse({
          retrievers: { ElasticSearch: { endpoint: 'http://es:9200' } },
          generators: { 'WatsonX.AI': { api_key: 'old-key' } },
        }),
      )
      .mockResolvedValueOnce(makeUpdateResponse());

    await storeConnectorCredentials(undefined, {
      'WatsonX.AI': { api_key: 'new-key' },
    });

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    const creds = body.data.connectorCredentials;
    expect(creds.retrievers['ElasticSearch'].endpoint).toBe('http://es:9200');
    expect(creds.generators['WatsonX.AI'].api_key).toBe('new-key');
  });

  it('returns false when GET /api/auth/session returns not-ok', async () => {
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false } as Response);
    const result = await storeConnectorCredentials({ x: {} });
    expect(result).toBe(false);
  });

  it('returns false when POST /api/auth/session returns not-ok', async () => {
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeSessionResponse())
      .mockResolvedValueOnce(makeUpdateResponse(false));
    const result = await storeConnectorCredentials({ x: {} });
    expect(result).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network'));
    const result = await storeConnectorCredentials({ x: {} });
    expect(result).toBe(false);
  });
});

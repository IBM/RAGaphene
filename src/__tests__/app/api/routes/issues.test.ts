/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for POST /api/issues
 *
 * Mocks: global.fetch (GitHub API), logger.
 * GITHUB_TOKEN set via process.env.
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
    path: '/api/issues',
    query: {},
    userAgent: 'test',
  })),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { POST } from '@/src/app/api/issues/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validBody = {
  title: 'Something broke',
  description: 'Steps to reproduce: click the button',
  conversation: { messages: [{ speaker: 'user', text: 'hello' }] },
};

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockFetchOk(issueUrl: string, issueNumber = 42) {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ number: issueNumber, html_url: issueUrl }),
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/issues', () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalRepo = process.env.GITHUB_REPO;
  const originalApiUrl = process.env.GITHUB_API_URL;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_TOKEN = 'test-github-token';
    process.env.GITHUB_REPO = 'IBM/RAGaphene';
    delete process.env.GITHUB_API_URL;
    mockFetch = mockFetchOk('https://github.com/IBM/RAGaphene/issues/42');
  });

  afterEach(() => {
    mockFetch.mockRestore();
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = originalRepo;
    if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL;
    else process.env.GITHUB_API_URL = originalApiUrl;
  });

  it('returns 200 with the issue number and url on success', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issueNumber).toBe(42);
    expect(body.issueUrl).toBe('https://github.com/IBM/RAGaphene/issues/42');
  });

  it('sends a POST request to the configured GitHub API and repo', async () => {
    await POST(makeRequest(validBody));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/IBM/RAGaphene/issues');
    expect(opts.method).toBe('POST');
  });

  it('includes the GITHUB_TOKEN in the Authorization header', async () => {
    await POST(makeRequest(validBody));
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer test-github-token');
  });

  it('includes title and conversation in the request body sent to GitHub', async () => {
    await POST(makeRequest(validBody));
    const [, opts] = mockFetch.mock.calls[0];
    const sent = JSON.parse(opts.body);
    expect(sent.title).toBe('Something broke');
    expect(sent.body).toContain('Steps to reproduce: click the button');
    expect(sent.body).toContain('Conversation');
  });

  it('returns 404 when GITHUB_TOKEN env var is not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is missing', async () => {
    const res = await POST(
      makeRequest({ description: 'desc', conversation: { x: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const res = await POST(
      makeRequest({ title: 'Bug', conversation: { x: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when conversation is empty', async () => {
    const res = await POST(
      makeRequest({ title: 'Bug', description: 'desc', conversation: {} }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when title exceeds 200 characters', async () => {
    const res = await POST(
      makeRequest({ ...validBody, title: 'x'.repeat(201) }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 503 when GitHub API returns a non-ok status', async () => {
    mockFetch.mockRestore();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
  });

  it('returns 503 when fetch throws (network error)', async () => {
    mockFetch.mockRestore();
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network failure'));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
  });
});

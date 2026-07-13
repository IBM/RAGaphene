/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for resolveNoAuthEndpoint — the SSRF guard for no-auth connectors.
 */

import { resolveNoAuthEndpoint } from '@/src/common/utilities/connectorEndpoint';

describe('resolveNoAuthEndpoint', () => {
  const original = process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    } else {
      process.env.ALLOW_REMOTE_LOCAL_CONNECTOR = original;
    }
  });

  it('returns the config default when no override is given', () => {
    expect(resolveNoAuthEndpoint(undefined, 'http://localhost:11434')).toBe(
      'http://localhost:11434',
    );
  });

  it('returns undefined when neither override nor default is given', () => {
    expect(resolveNoAuthEndpoint(undefined, undefined)).toBeUndefined();
  });

  it('accepts a loopback override regardless of the remote flag', () => {
    delete process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    expect(resolveNoAuthEndpoint('http://127.0.0.1:9999', undefined)).toBe(
      'http://127.0.0.1:9999',
    );
    expect(resolveNoAuthEndpoint('http://localhost:11434', undefined)).toBe(
      'http://localhost:11434',
    );
  });

  it('rejects a remote override when the remote flag is off', () => {
    delete process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    expect(() =>
      resolveNoAuthEndpoint('http://evil.example.com', undefined),
    ).toThrow('Remote endpoints are not permitted');
  });

  it('allows a remote override when the remote flag is on', () => {
    process.env.ALLOW_REMOTE_LOCAL_CONNECTOR = 'true';
    expect(
      resolveNoAuthEndpoint('http://gpu-box.internal:11434', undefined),
    ).toBe('http://gpu-box.internal:11434');
  });

  it('rejects a non-http(s) scheme even for loopback', () => {
    delete process.env.ALLOW_REMOTE_LOCAL_CONNECTOR;
    expect(() =>
      resolveNoAuthEndpoint('file:///etc/passwd', undefined),
    ).toThrow('Invalid endpoint');
  });

  it('rejects a malformed URL', () => {
    expect(() => resolveNoAuthEndpoint('not-a-url', undefined)).toThrow(
      'Invalid endpoint',
    );
  });
});

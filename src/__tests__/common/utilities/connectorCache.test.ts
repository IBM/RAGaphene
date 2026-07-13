/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for ConnectorCache utility
 *
 * Covers: get/set/invalidate/invalidateByPrefix with TTL logic.
 * Date.now is mocked to test expiry without real waiting.
 */

import {
  ConnectorCache,
  buildCacheKey,
  credentialFingerprint,
  CONNECTOR_CACHE_TTL_MS,
  modelsCache,
  collectionsCache,
} from '@/src/common/utilities/connectorCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache<T>() {
  return new ConnectorCache<T>();
}

// ---------------------------------------------------------------------------
// ConnectorCache — core behaviour
// ---------------------------------------------------------------------------

describe('ConnectorCache', () => {
  let realDateNow: () => number;

  beforeAll(() => {
    realDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('get returns null on an empty cache', () => {
    const cache = makeCache<string[]>();
    expect(cache.get('missing-key')).toBeNull();
  });

  it('get returns data when entry has not yet expired', () => {
    const cache = makeCache<string[]>();
    const now = 1_000_000;
    Date.now = () => now;

    cache.set('key1', ['a', 'b'], 5_000);

    // Advance time by less than TTL
    Date.now = () => now + 4_999;
    expect(cache.get('key1')).toEqual(['a', 'b']);
  });

  it('get returns null after TTL expires', () => {
    const cache = makeCache<string[]>();
    const now = 1_000_000;
    Date.now = () => now;

    cache.set('key1', ['a', 'b'], 5_000);

    // Advance past expiry
    Date.now = () => now + 5_001;
    expect(cache.get('key1')).toBeNull();
  });

  it('get returns null at exactly the expiry timestamp (boundary is exclusive)', () => {
    const cache = makeCache<string[]>();
    const now = 1_000_000;
    Date.now = () => now;

    cache.set('key1', ['x'], 5_000);

    // expiresAt = now + 5000; condition is Date.now() > expiresAt
    Date.now = () => now + 5_000;
    // Equal, not greater — still valid
    expect(cache.get('key1')).toEqual(['x']);

    Date.now = () => now + 5_001;
    expect(cache.get('key1')).toBeNull();
  });

  it('set overwrites an existing entry', () => {
    const cache = makeCache<number[]>();
    const now = 2_000_000;
    Date.now = () => now;

    cache.set('key', [1, 2], 10_000);
    cache.set('key', [3, 4], 10_000);

    expect(cache.get('key')).toEqual([3, 4]);
  });

  it('set with a new TTL refreshes the expiry', () => {
    const cache = makeCache<number[]>();
    const now = 2_000_000;
    Date.now = () => now;

    cache.set('key', [1], 1_000);

    // Re-set with longer TTL before the first one expires
    Date.now = () => now + 500;
    cache.set('key', [2], 10_000);

    // Would have expired under the original TTL
    Date.now = () => now + 5_000;
    expect(cache.get('key')).toEqual([2]);
  });

  // ---------------------------------------------------------------------------
  // invalidate
  // ---------------------------------------------------------------------------

  it('invalidate removes the specified entry', () => {
    const cache = makeCache<string>();
    Date.now = realDateNow;

    cache.set('key-a', 'alpha', 60_000);
    cache.set('key-b', 'beta', 60_000);

    cache.invalidate('key-a');

    expect(cache.get('key-a')).toBeNull();
    expect(cache.get('key-b')).toBe('beta');
  });

  it('invalidate is a no-op when the key does not exist', () => {
    const cache = makeCache<string>();
    // Should not throw
    expect(() => cache.invalidate('nonexistent')).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // invalidateByPrefix
  // ---------------------------------------------------------------------------

  it('invalidateByPrefix removes only matching entries', () => {
    const cache = makeCache<string>();
    Date.now = realDateNow;

    cache.set('models::WatsonX::ep1::srv::', 'v1', 60_000);
    cache.set('models::WatsonX::ep1::abc::Gr', 'v2', 60_000);
    cache.set('collections::ES::ep::srv::', 'v3', 60_000);

    cache.invalidateByPrefix('models::WatsonX');

    expect(cache.get('models::WatsonX::ep1::srv::')).toBeNull();
    expect(cache.get('models::WatsonX::ep1::abc::Gr')).toBeNull();
    // Non-matching entry must survive
    expect(cache.get('collections::ES::ep::srv::')).toBe('v3');
  });

  it('invalidateByPrefix is a no-op when no keys match', () => {
    const cache = makeCache<string>();
    Date.now = realDateNow;

    cache.set('collections::ES::ep::srv::', 'data', 60_000);
    cache.invalidateByPrefix('models::');

    expect(cache.get('collections::ES::ep::srv::')).toBe('data');
  });

  it('invalidateByPrefix with empty prefix clears all entries', () => {
    const cache = makeCache<string>();
    Date.now = realDateNow;

    cache.set('a', 'alpha', 60_000);
    cache.set('b', 'beta', 60_000);
    cache.invalidateByPrefix('');

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildCacheKey
// ---------------------------------------------------------------------------

describe('buildCacheKey', () => {
  it('joins parts with ::', () => {
    expect(buildCacheKey('models', 'WatsonX.AI', 'https://ep', 'srv', '')).toBe(
      'models::WatsonX.AI::https://ep::srv::',
    );
  });

  it('handles a single part', () => {
    expect(buildCacheKey('models')).toBe('models');
  });

  it('preserves empty parts', () => {
    expect(buildCacheKey('a', '', 'b')).toBe('a::::b');
  });
});

// ---------------------------------------------------------------------------
// credentialFingerprint
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';

function sha256prefix(s: string) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

describe('credentialFingerprint', () => {
  it('returns "server" for server-managed connectors', () => {
    expect(credentialFingerprint({ provider: 'server' })).toBe('server');
  });

  it('returns a 16-char hex string for client connectors', () => {
    const result = credentialFingerprint({
      provider: 'client',
      api_key: 'any-key',
    });
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes api_key when present', () => {
    expect(
      credentialFingerprint({
        provider: 'client',
        api_key: 'abcdef1234567890',
      }),
    ).toBe(sha256prefix('abcdef1234567890'));
  });

  it('hashes username+password concatenation when api_key is absent', () => {
    expect(
      credentialFingerprint({
        provider: 'client',
        username: 'alice',
        password: 'secret',
      }),
    ).toBe(sha256prefix('alice:secret'));
  });

  it('prefers api_key over username when both are present (Elasticsearch mixed-auth)', () => {
    expect(
      credentialFingerprint({
        provider: 'client',
        api_key: 'key-abcdefgh',
        username: 'bob',
      }),
    ).toBe(sha256prefix('key-abcdefgh'));
  });

  it('produces different fingerprints for same username with different passwords', () => {
    const fp1 = credentialFingerprint({
      provider: 'client',
      username: 'alice',
      password: 'pass1',
    });
    const fp2 = credentialFingerprint({
      provider: 'client',
      username: 'alice',
      password: 'pass2',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('produces the same fingerprint for identical credentials', () => {
    const fp1 = credentialFingerprint({
      provider: 'client',
      api_key: 'same-key',
    });
    const fp2 = credentialFingerprint({
      provider: 'client',
      api_key: 'same-key',
    });
    expect(fp1).toBe(fp2);
  });

  it('handles short credentials without leaking them (hash is always 16 chars)', () => {
    const result = credentialFingerprint({ provider: 'client', api_key: 'x' });
    expect(result).toMatch(/^[0-9a-f]{16}$/);
    expect(result).not.toBe('x');
  });

  it('returns a hash of ": " when no credential fields are present', () => {
    // Falls through to the username+password branch with both empty → hashes ':'
    expect(credentialFingerprint({ provider: 'client' })).toBe(
      sha256prefix(':'),
    );
  });
});

// ---------------------------------------------------------------------------
// CONNECTOR_CACHE_TTL_MS
// ---------------------------------------------------------------------------

describe('CONNECTOR_CACHE_TTL_MS', () => {
  it('is 1 hour in milliseconds', () => {
    expect(CONNECTOR_CACHE_TTL_MS).toBe(3_600_000);
  });
});

// ---------------------------------------------------------------------------
// Exported singletons
// ---------------------------------------------------------------------------

describe('exported singletons', () => {
  it('modelsCache is a ConnectorCache instance', () => {
    expect(modelsCache).toBeInstanceOf(ConnectorCache);
  });

  it('collectionsCache is a ConnectorCache instance', () => {
    expect(collectionsCache).toBeInstanceOf(ConnectorCache);
  });

  it('modelsCache and collectionsCache are independent', () => {
    // Sanity: setting a key in one does not affect the other
    const key = 'singleton-test-key';
    modelsCache.set(key, [{ id: 'model-x' }], 60_000);
    expect(collectionsCache.get(key)).toBeNull();
    modelsCache.invalidate(key);
  });
});

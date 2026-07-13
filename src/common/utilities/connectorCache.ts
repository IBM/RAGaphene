/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

// --- Types ---

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// --- ConnectorCache ---

/**
 * Module-level TTL cache keyed by connector identity.
 *
 * Lives in the Node.js process heap — each pod in a multi-replica deployment
 * has its own independent cache. Cache misses fall through to the external
 * service gracefully; there is no cross-pod inconsistency risk.
 * If a shared cache is required, the backing Map can be swapped for Redis
 * without changing the callers (interface is stable).
 *
 * Credentials never enter the cache — values are response data only.
 */
export class ConnectorCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  /** Returns cached data if the entry exists and has not expired; null otherwise. */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Stores data under `key`, expiring after `ttlMs` milliseconds. Overwrites any existing entry. */
  set(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Removes a single cache entry. No-op if the key does not exist. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Removes all entries whose key starts with `prefix`.
   * Used when a connector's credentials change to evict all related entries
   * (e.g. all name-filter variants for the same connector).
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

// --- Singletons ---

// One cache instance per resource type — same process lifetime as the config cache.
export const modelsCache = new ConnectorCache<object[]>();
export const collectionsCache = new ConnectorCache<object[]>();

// --- Constants ---

/** TTL for models and collections. 1 hour is appropriate: these lists are
 *  stable over a session, and the Renew button covers the rare mid-session change. */
export const CONNECTOR_CACHE_TTL_MS = 3_600_000;

// --- Helpers ---

/**
 * Builds a cache key from the given parts, joined with '::'.
 *
 * Design: `connector_name::endpoint::fingerprint::nameFilter`
 *
 * Example:
 *   buildCacheKey('models', 'WatsonX.AI', 'https://us-south.ml.cloud.ibm.com', 'clientk9', 'Granite')
 *   → "models::WatsonX.AI::https://us-south.ml.cloud.ibm.com::clientk9::Granite"
 */
export function buildCacheKey(...parts: string[]): string {
  return parts.join('::');
}

/**
 * Returns a short, non-reversible fingerprint of the client credential for use
 * in a cache key.
 *
 * Goal: scope cache entries per account without exposing anything recoverable.
 * We SHA-256 the secret and take the first 16 hex chars (64-bit prefix) —
 * collision-resistant for our scale, fixed-length regardless of input length,
 * and non-reversible even for short values like usernames or short passwords.
 *
 * Auth patterns in use:
 *   - api_key only         — WatsonX, OpenAI, Anthropic, Gemini
 *   - api_key OR username  — Elasticsearch (api_key preferred, username fallback)
 *   - username + password  — MongoDB, Cloudant
 *
 * For username+password connectors we hash the concatenation so that both
 * fields contribute — two users with the same username but different passwords
 * get different fingerprints.
 *
 * Server-managed connectors share one entry per connector (all users hit the
 * same external service with the same server-side key), so we return 'server'.
 */
export function credentialFingerprint(authorization: {
  provider: string;
  api_key?: string;
  username?: string;
  password?: string;
}): string {
  if (authorization.provider !== 'client') return 'server';

  // Prefer api_key when present; otherwise combine username + password so that
  // both fields contribute and a shared username with a different password
  // still produces a distinct fingerprint.
  const secret =
    authorization.api_key ??
    `${authorization.username ?? ''}:${authorization.password ?? ''}`;

  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

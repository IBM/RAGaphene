/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/app/api/auth/[...nextauth]/options';
import { getRetriever } from '@/src/common/connectors/retriever';
import { getRetrieverConfig } from '@/src/common/utilities/configuration';
import { resolveNoAuthEndpoint } from '@/src/common/utilities/connectorEndpoint';
import {
  withErrorHandler,
  AuthenticationError,
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ExternalServiceError,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';
import { validateQuery } from '@/src/app/api/middleware/validation';
import {
  collectionsQuerySchema,
  collectionsDeleteSchema,
} from '@/src/app/api/schemas/collections.schema';
import { deleteCollection } from '@/src/common/utilities/localIndex';
import {
  collectionsCache,
  buildCacheKey,
  credentialFingerprint,
  CONNECTOR_CACHE_TTL_MS,
} from '@/src/common/utilities/connectorCache';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthenticationError('Unauthorized - please sign in');
  }

  const {
    connector_name,
    provider,
    name: nameFilter,
    force,
    endpoint: endpointOverride,
  } = validateQuery(req.url, collectionsQuerySchema);

  const forceRefresh = force === 'true';

  const retrieverConfig = getRetrieverConfig(connector_name);

  // Build authorization object from session or fallback to header (dual-mode).
  let authorization;

  if (retrieverConfig?.authentication === 'none') {
    // No-auth retriever: resolve endpoint from config (loopback override allowed),
    // never touch the session. Mirrors the generator no-auth path.
    const resolvedEndpoint = resolveNoAuthEndpoint(
      endpointOverride,
      retrieverConfig.endpoint,
    );
    assertExists(resolvedEndpoint, 'Failed to establish connection');
    authorization = {
      provider: 'client',
      name: connector_name,
      endpoint: resolvedEndpoint,
      credentials: {},
    };
  } else if (
    provider === 'client' &&
    session.connectorCredentials?.retrievers?.[connector_name]
  ) {
    // Get credentials from secure session
    const creds = session.connectorCredentials.retrievers[connector_name];
    authorization = {
      provider: 'client',
      name: connector_name,
      ...creds,
    };
  } else {
    // FALLBACK: Check Authorization header (deprecated, will be removed)
    const headersList = await headers();
    if (headersList.has('Authorization')) {
      authorization = JSON.parse(headersList.get('Authorization') || '');
      console.warn(
        '[DEPRECATED] Authorization header will be removed in v2.0. Use session credentials instead.',
      );
    } else if (provider === 'client') {
      throw new ValidationError('Connector credentials not found in session');
    } else {
      // Server-managed connector — use name from query param
      authorization = {
        provider: 'server',
        name: connector_name,
      };
    }
  }

  // Server-managed connectors carry their system.ts config, including any
  // per-connector cache override; client-managed (credentialed) ones have no
  // config entry here and always use the route's default TTL.
  const connectorConfig =
    authorization.provider === 'server' ? retrieverConfig : undefined;
  const cacheTtlMs =
    connectorConfig?.maxAge !== undefined
      ? connectorConfig.maxAge * 1000
      : CONNECTOR_CACHE_TTL_MS;
  const cachingEnabled = cacheTtlMs > 0;

  const fingerprint = credentialFingerprint(authorization);

  const cacheKey = buildCacheKey(
    'collections',
    connector_name,
    authorization.endpoint ?? '',
    fingerprint,
    nameFilter ?? '',
  );

  // Return cached result unless the caller requests a forced refresh.
  if (cachingEnabled && !forceRefresh) {
    const cached = collectionsCache.get(cacheKey);
    if (cached) {
      return Response.json(cached);
    }
  }

  // Get retriever
  let retriever;
  if (authorization.provider === 'client') {
    retriever = getRetriever(
      authorization.name,
      authorization.endpoint,
      authorization.credentials,
    );
  } else {
    // Local Documents has no network endpoint — pass the username so the
    // Local constructor can scope the index directory to this user.
    const endpoint =
      connectorConfig?.provider === 'local'
        ? session.user?.username
        : connectorConfig?.endpoint;

    assertExists(endpoint, 'Failed to establish connection');

    retriever = getRetriever(
      authorization.name,
      endpoint,
      connectorConfig?.credentials ?? {},
    );
  }

  // Fetch from external service; do not cache on error.
  try {
    const collections = await retriever.getCollections();
    const result = nameFilter
      ? collections.filter((collection) => collection.name.match(nameFilter))
      : collections;

    if (cachingEnabled) {
      collectionsCache.set(cacheKey, result, cacheTtlMs);
    }
    return Response.json(result);
  } catch (exception: any) {
    throw new ExternalServiceError(
      authorization.name,
      exception.name === 'ConnectionError'
        ? 'Failed to establish connection'
        : 'Failed to fetch collections',
    );
  }
});

export const DELETE = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthenticationError('Unauthorized - please sign in');
  }

  const { connector_name, uuid } = validateQuery(
    req.url,
    collectionsDeleteSchema,
  );

  if (connector_name !== 'Local Documents') {
    throw new ValidationError(
      'DELETE /api/collections is only supported for Local Documents',
    );
  }

  const username = session.user?.username ?? '';

  try {
    await deleteCollection(username, uuid);
  } catch (err: any) {
    if (err?.name === 'AuthorizationError') {
      throw new AuthorizationError(err.message);
    }
    throw new NotFoundError(`Collection "${uuid}" not found`);
  }

  // Evict cached collection list for this connector so the next GET reflects the deletion.
  collectionsCache.invalidateByPrefix('collections::Local Documents::');

  return Response.json({});
});

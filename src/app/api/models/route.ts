/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/app/api/auth/[...nextauth]/options';
import { getGeneratorConfig } from '@/src/common/utilities/configuration';
import { resolveNoAuthEndpoint } from '@/src/common/utilities/connectorEndpoint';
import { getGenerator } from '@/src/common/connectors/generator';
import {
  withErrorHandler,
  AuthenticationError,
  ValidationError,
  ExternalServiceError,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';
import { validateQuery } from '@/src/app/api/middleware/validation';
import { modelsQuerySchema } from '@/src/app/api/schemas/models.schema';
import {
  modelsCache,
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
  } = validateQuery(req.url, modelsQuerySchema);

  const forceRefresh = force === 'true';

  const connectorConfig = getGeneratorConfig(connector_name);

  // Build authorization object from session or fallback to header (dual-mode).
  let authorization;

  if (connectorConfig?.authentication === 'none') {
    // No-auth connector (e.g. Ollama): no secret to look up, so it never touches
    // the session. Resolve the endpoint from config, honoring a loopback override.
    // This is what makes such connectors immune to the credential-store race.
    const resolvedEndpoint = resolveNoAuthEndpoint(
      endpointOverride,
      connectorConfig.endpoint,
    );
    assertExists(resolvedEndpoint, 'Failed to establish connection');
    authorization = {
      provider: 'client',
      name: connector_name,
      endpoint: resolvedEndpoint,
    };
  } else if (
    provider === 'client' &&
    session.connectorCredentials?.generators?.[connector_name]
  ) {
    // Get credentials from secure session
    const creds = session.connectorCredentials.generators[connector_name];
    authorization = {
      provider: 'client',
      name: connector_name,
      ...creds,
    };
  } else {
    // FALLBACK: Check Authorization header (deprecated, will be removed)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      authorization = JSON.parse(authHeader);
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

  const fingerprint = credentialFingerprint(authorization);

  const cacheKey = buildCacheKey(
    'models',
    connector_name,
    authorization.endpoint ?? '',
    fingerprint,
    nameFilter ?? '',
  );

  // Return cached result unless the caller requests a forced refresh.
  if (!forceRefresh) {
    const cached = modelsCache.get(cacheKey);
    if (cached) {
      return Response.json(cached);
    }
  }

  // Get generator
  let generator;
  if (authorization.provider === 'client') {
    try {
      generator = getGenerator(
        authorization.name,
        authorization.endpoint,
        authorization.api_key,
        authorization.project_id,
      );
    } catch (error: any) {
      throw new ExternalServiceError(authorization.name, error.message);
    }
  } else {
    const connector = getGeneratorConfig(authorization.name);
    assertExists(connector, 'Failed to establish connection');
    assertExists(connector.endpoint, 'Failed to establish connection');
    assertExists(
      connector.credentials.api_key,
      'Failed to establish connection',
    );

    try {
      generator = getGenerator(
        connector.name,
        connector.endpoint,
        connector.credentials.api_key,
        connector.credentials.project_id,
      );
    } catch (error: any) {
      throw new ExternalServiceError(connector.name, error.message);
    }
  }

  // Fetch from external service; do not cache on error.
  try {
    const models = await generator.getModels();
    const result = nameFilter
      ? models.filter((model) => model.name.match(nameFilter))
      : models;

    modelsCache.set(cacheKey, result, CONNECTOR_CACHE_TTL_MS);
    return Response.json(result);
  } catch (exception: any) {
    throw new ExternalServiceError(
      authorization.name,
      exception.name === 'ConnectionError'
        ? 'Failed to establish connection'
        : 'Failed to fetch models',
    );
  }
});

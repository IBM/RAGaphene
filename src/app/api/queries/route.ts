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
  ExternalServiceError,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';
import { validateBody } from '@/src/app/api/middleware/validation';
import { queriesPostSchema } from '@/src/app/api/schemas/queries.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: Request) => {
  // Step 1: Get authenticated session
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthenticationError('Please sign in to continue');
  }

  // Step 2: Parse and validate request body
  const body = await req.json();
  const {
    connector_name,
    provider,
    endpoint: endpointOverride,
    query,
    collection,
    max_count,
    projection_template,
    display_template,
  } = validateBody(body, queriesPostSchema);

  // Step 3: Build authorization object from session or fallback to header (dual-mode)
  const retrieverConfig = getRetrieverConfig(connector_name);

  let authorization;

  if (retrieverConfig?.authentication === 'none') {
    // No-auth retriever: resolve endpoint from config (loopback override allowed),
    // never touch the session.
    const resolvedEndpoint = resolveNoAuthEndpoint(
      endpointOverride,
      retrieverConfig.endpoint,
    );
    assertExists(resolvedEndpoint, 'Connector endpoint not configured');
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
    // NEW METHOD: Get credentials from secure session
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
      // Server-managed connector - use name from request
      authorization = {
        provider: 'server',
        name: connector_name,
      };
    }
  }

  // Step 4: Get retriever
  let retriever;
  if (authorization.provider === 'client') {
    retriever = getRetriever(
      authorization.name,
      authorization.endpoint,
      authorization.credentials,
    );
  } else {
    const connector = getRetrieverConfig(authorization.name);
    assertExists(connector, `Connector "${authorization.name}" not found`);

    // Local Documents has no network endpoint — pass the session username so the
    // Local constructor can scope the index directory to this user.
    const endpoint =
      connector.provider === 'local'
        ? (session.user?.username ?? '')
        : (connector.endpoint ?? '');

    assertExists(endpoint, 'Connector endpoint not configured');

    retriever = getRetriever(
      authorization.name,
      endpoint,
      connector.credentials,
    );
  }

  // Step 5: Run query
  try {
    const results = await retriever.retrieve(
      collection,
      query,
      max_count,
      projection_template,
      display_template,
    );
    return Response.json(results);
  } catch (error: any) {
    throw new ExternalServiceError(
      authorization.name,
      error.name === 'ConnectionError'
        ? 'Failed to establish connection'
        : error.name === 'ProjectionError' || error.name === 'ResponseError'
          ? error.message
          : 'Failed to retrieve documents',
      { originalError: error.message },
    );
  }
});

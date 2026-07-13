/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { headers } from 'next/headers';
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
import { validateBody } from '@/src/app/api/middleware/validation';
import { messagesPostSchema } from '@/src/app/api/schemas/messages.schema';

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
    endpoint,
    model_id,
    mode,
    input,
    conversation,
    documents,
    system_instruction,
    context_template,
    parameters,
  } = validateBody(body, messagesPostSchema);

  // Step 3: Build authorization object from session or fallback to header (dual-mode)
  const connectorConfig = getGeneratorConfig(connector_name);

  let authorization;

  if (connectorConfig?.authentication === 'none') {
    // No-auth connector (e.g. Ollama): no session lookup. Resolve the endpoint
    // from config, honoring a loopback override, and carry no key.
    const resolvedEndpoint = resolveNoAuthEndpoint(
      endpoint,
      connectorConfig.endpoint,
    );
    assertExists(resolvedEndpoint, 'Connector endpoint not configured');
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

  // Step 4: Fetch connector
  const connector = connectorConfig;
  assertExists(connector, `Connector "${authorization.name}" not found`);
  // No-auth connectors carry their resolved endpoint on authorization (it may be a
  // client override); everything else uses the endpoint from config.
  const connectorEndpoint = authorization.endpoint ?? connector.endpoint;
  assertExists(connectorEndpoint, 'Connector endpoint not configured');

  // Step 5: Get generator
  let generator;
  try {
    if (authorization.provider === 'client') {
      generator = getGenerator(
        connector.name,
        connectorEndpoint,
        authorization.api_key,
        authorization.project_id,
      );
    } else if (connector.credentials.api_key) {
      generator = getGenerator(
        connector.name,
        connectorEndpoint,
        connector.credentials.api_key,
        connector.credentials.project_id,
      );
    } else {
      throw new ValidationError('ActiveGenerator credentials not configured');
    }
  } catch (error: any) {
    throw new ExternalServiceError(
      connector.name,
      `Failed to initialize generator: ${error.message}`,
    );
  }

  // Step 6: Execute request
  try {
    let result;
    if (mode === 'completion') {
      result = await generator.generate(model_id, input!, parameters ?? {});
    } else {
      result = await generator.chat(
        model_id,
        conversation!,
        documents,
        system_instruction,
        context_template ?? '[DOCUMENT]\n${TEXT}\n[END]\n',
        parameters ?? {},
      );
    }
    return Response.json(result);
  } catch (error: any) {
    // error.cause holds the real network error when Node wraps it as "fetch failed"
    const cause = error.cause?.message ?? error.cause?.code;
    const detail = cause
      ? `${error.message}: ${cause}`
      : (error.message ?? 'Failed to generate response');
    throw new ExternalServiceError(connector.name, detail, {
      originalError: error.message,
      cause: cause ?? null,
    });
  }
});

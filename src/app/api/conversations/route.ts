/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabaseConnector } from '@/src/common/utilities/configuration';
import { getDatabase } from '@/src/common/connectors/database';
import {
  withErrorHandler,
  ExternalServiceError,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';
import { validateBody } from '@/src/app/api/middleware/validation';
import { conversationsPostSchema } from '@/src/app/api/schemas/conversations.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: Request) => {
  // Step 1: Fetch connector
  const connector = getDatabaseConnector();
  assertExists(connector, 'Database connector not configured');
  assertExists(connector.endpoint, 'Database endpoint not configured');
  assertExists(
    connector.credentials?.api_key,
    'Database credentials not configured',
  );

  // Step 2: Get Database
  const store = getDatabase(connector.endpoint, connector.credentials.api_key);

  // Step 3: Parse and validate request body
  const body = await req.json();
  const { conversation } = validateBody(body, conversationsPostSchema);

  // Step 4: Execute request
  try {
    const result = await store.save(conversation);
    return Response.json(result);
  } catch (error: any) {
    throw new ExternalServiceError(
      'Database',
      error.name === 'ConnectionError'
        ? 'Failed to establish connection'
        : 'Failed to save conversation',
      { originalError: error.message },
    );
  }
});

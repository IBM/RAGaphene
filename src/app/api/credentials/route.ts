/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/app/api/auth/[...nextauth]/options';
import {
  withErrorHandler,
  AuthenticationError,
} from '@/src/app/api/middleware/errorHandler';
import { validateBody } from '@/src/app/api/middleware/validation';
import { credentialsPostSchema } from '@/src/app/api/schemas/credentials.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

/**
 * POST /api/credentials
 * Store connector credentials in secure HTTP-only session
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new AuthenticationError('Please sign in to continue');
  }

  // Parse and validate request body
  const body = await req.json();
  const { retrievers, generators } = validateBody(body, credentialsPostSchema);

  // Note: The actual session update happens client-side using NextAuth's update() method
  // This endpoint validates the credentials structure before the client updates the session
  return Response.json({
    success: true,
    message: 'Credentials validated successfully',
  });
});

/**
 * GET /api/credentials
 * Retrieve credential metadata (not actual values) from session
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new AuthenticationError('Please sign in to continue');
  }

  // Return metadata about which credentials are stored (not the actual values)
  const metadata = {
    hasRetrievers: !!session.connectorCredentials?.retrievers,
    hasGenerators: !!session.connectorCredentials?.generators,
    retrieverNames: session.connectorCredentials?.retrievers
      ? Object.keys(session.connectorCredentials.retrievers)
      : [],
    generatorNames: session.connectorCredentials?.generators
      ? Object.keys(session.connectorCredentials.generators)
      : [],
  };

  return Response.json(metadata);
});

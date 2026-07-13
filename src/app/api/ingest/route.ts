/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/app/api/auth/[...nextauth]/options';
import {
  withErrorHandler,
  AuthenticationError,
  ValidationError,
} from '@/src/app/api/middleware/errorHandler';
import { ingestDocuments } from '@/src/common/utilities/localIndex';
import { collectionsCache } from '@/src/common/utilities/connectorCache';
import { SUPPORTED_EXTENSIONS } from '@/src/app/api/schemas/ingest.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

const MAX_DOCS = parseInt(process.env.LOCAL_INDEX_MAX_DOCUMENTS ?? '10');

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthenticationError('Unauthorized - please sign in');
  }

  const formData = await req.formData();
  const files = formData.getAll('files[]') as File[];

  if (!files.length) {
    throw new ValidationError('No files provided');
  }

  if (files.length > MAX_DOCS) {
    throw new ValidationError(
      `Too many files (max ${MAX_DOCS}). Received ${files.length}.`,
    );
  }

  const unsupported = files.filter(
    (f) => !SUPPORTED_EXTENSIONS.some((ext) => f.name.endsWith(ext)),
  );
  if (unsupported.length) {
    throw new ValidationError(
      `Unsupported file type(s): ${unsupported.map((f) => f.name).join(', ')}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    );
  }

  const username = session.user?.username ?? '';

  const fileData = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      buffer: Buffer.from(await f.arrayBuffer()),
    })),
  );

  const result = await ingestDocuments(username, fileData);

  // Evict cached collection list so the next GET reflects the new collection.
  collectionsCache.invalidateByPrefix('collections::Local Documents::');

  return Response.json(result);
});

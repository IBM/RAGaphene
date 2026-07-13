/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from '@/src/common/utilities/configuration';
import { withErrorHandler } from '@/src/app/api/middleware/errorHandler';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  // Bundled config is always available — no env var guard needed
  const config = load(true);
  return Response.json(config);
});

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation';

/**
 * Schema for POST /api/queries
 * Semantic search endpoint
 */
export const queriesPostSchema = z.object({
  connector_name: commonSchemas.connectorName,
  provider: commonSchemas.provider,
  // Optional endpoint override for no-auth connectors.
  endpoint: commonSchemas.endpoint.optional(),
  query: z.record(z.string(), z.unknown()),
  collection: commonSchemas.collection,
  max_count: commonSchemas.optionalPositiveInt,
  projection_template: z.string().optional(),
  display_template: z.string().optional(),
});

export type QueriesPostBody = z.infer<typeof queriesPostSchema>;

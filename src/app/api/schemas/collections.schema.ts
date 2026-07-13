/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation';

/**
 * Schema for GET /api/collections
 * List collections for a retriever connector
 */
export const collectionsQuerySchema = z.object({
  connector_name: commonSchemas.connectorName,
  provider: commonSchemas.provider.optional(),
  name: z.string().optional(), // Optional name filter
  // Query params are always strings; callers compare force === 'true'
  force: z.enum(['true', 'false']).optional(),
  // Optional endpoint override for no-auth connectors.
  endpoint: commonSchemas.endpoint.optional(),
});

export type CollectionsQuery = z.infer<typeof collectionsQuerySchema>;

/**
 * Schema for DELETE /api/collections
 * Remove a local collection by uuid.
 */
export const collectionsDeleteSchema = z.object({
  connector_name: commonSchemas.connectorName,
  uuid: z.string().min(1, 'uuid is required'),
});

export type CollectionsDelete = z.infer<typeof collectionsDeleteSchema>;

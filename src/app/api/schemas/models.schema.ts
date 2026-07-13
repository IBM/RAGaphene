/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation';

/**
 * Schema for GET /api/models
 * List models for a generator connector
 */
export const modelsQuerySchema = z.object({
  connector_name: commonSchemas.connectorName,
  provider: commonSchemas.provider.optional(),
  name: z.string().optional(), // Optional name filter
  // Query params are always strings; callers compare force === 'true'
  force: z.enum(['true', 'false']).optional(),
  // Optional endpoint override for no-auth connectors (e.g. a non-default Ollama host).
  endpoint: commonSchemas.endpoint.optional(),
});

export type ModelsQuery = z.infer<typeof modelsQuerySchema>;

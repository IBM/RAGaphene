/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Schema for retriever credentials
 */
const retrieverCredentialsSchema = z.object({
  endpoint: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  api_key: z.string().optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for generator credentials
 */
const generatorCredentialsSchema = z.object({
  endpoint: z.string().url().optional(),
  api_key: z.string().optional(),
  project_id: z.string().optional(),
});

/**
 * Schema for POST /api/credentials
 * Store connector credentials in session
 */
export const credentialsPostSchema = z
  .object({
    retrievers: z.record(z.string(), retrieverCredentialsSchema).optional(),
    generators: z.record(z.string(), generatorCredentialsSchema).optional(),
  })
  .refine((data) => data.retrievers || data.generators, {
    message: 'At least one of retrievers or generators must be provided',
  });

export type CredentialsPostBody = z.infer<typeof credentialsPostSchema>;

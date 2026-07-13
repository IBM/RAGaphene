/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { ValidationError } from './errorHandler';

/**
 * Validates request body against a Zod schema
 * @param data - The data to validate (request body)
 * @param schema - The Zod schema to validate against
 * @returns The validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateBody<T extends z.ZodType>(
  data: unknown,
  schema: T,
): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));

      throw new ValidationError('Request validation failed', {
        errors: formattedErrors,
      });
    }
    throw error;
  }
}

/**
 * Validates query parameters against a Zod schema
 * @param url - The request URL
 * @param schema - The Zod schema to validate against
 * @returns The validated and typed query parameters
 * @throws ValidationError if validation fails
 */
export function validateQuery<T extends z.ZodType>(
  url: string,
  schema: T,
): z.infer<T> {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};

    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));

      throw new ValidationError('Query parameter validation failed', {
        errors: formattedErrors,
      });
    }
    throw error;
  }
}

/**
 * Common Zod schemas for reuse across endpoints
 */
export const commonSchemas = {
  // Provider types
  provider: z.enum(['client', 'server']),

  // Connector name (non-empty string)
  connectorName: z.string().min(1, 'connector_name is required'),

  // Optional client-supplied endpoint override for no-auth connectors.
  // SSRF-guarded server-side by resolveNoAuthEndpoint (loopback-only by default).
  endpoint: z.string().url(),

  // Model ID (non-empty string)
  modelId: z.string().min(1, 'model_id is required'),

  // Collection name (non-empty string)
  collection: z.string().min(1, 'collection is required'),

  // UUID format
  uuid: z.string().uuid('Invalid UUID format'),

  // Positive integer
  positiveInt: z.number().int().positive(),

  // Optional positive integer
  optionalPositiveInt: z.number().int().positive().optional(),

  // Generation parameters (flexible object)
  parameters: z.record(z.string(), z.unknown()).optional(),

  // Input text (non-empty string)
  inputText: z.string().min(1, 'input is required'),

  // Query text (non-empty string)
  queryText: z.string().min(1, 'query is required'),
};

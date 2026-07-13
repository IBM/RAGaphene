/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// validation.ts imports errorHandler which imports logger — mock it first
jest.mock('@/src/common/utilities/logger', () => ({
  logger: {
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  extractRequestContext: jest.fn(() => ({
    method: 'GET',
    path: '/api/test',
    query: {},
    userAgent: 'test-agent',
  })),
}));

import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  commonSchemas,
} from '@/src/app/api/middleware/validation';
import { ValidationError } from '@/src/app/api/middleware/errorHandler';

// ---------------------------------------------------------------------------
// validateBody
// ---------------------------------------------------------------------------

describe('validateBody', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().int().positive(),
  });

  it('returns typed data when input is valid', () => {
    const result = validateBody({ name: 'Alice', age: 30 }, schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('throws ValidationError when a required field is missing', () => {
    expect(() => validateBody({ name: 'Bob' }, schema)).toThrow(
      ValidationError,
    );
  });

  it('thrown error has code VALIDATION_ERROR', () => {
    try {
      validateBody({ age: 'not-a-number' }, schema);
    } catch (e: any) {
      expect(e.code).toBe('VALIDATION_ERROR');
    }
  });

  it('includes formatted error details', () => {
    try {
      validateBody({}, schema);
    } catch (e: any) {
      expect(e.details).toHaveProperty('errors');
      expect(Array.isArray(e.details.errors)).toBe(true);
      expect(e.details.errors.length).toBeGreaterThan(0);
      expect(e.details.errors[0]).toHaveProperty('path');
      expect(e.details.errors[0]).toHaveProperty('message');
    }
  });

  it('re-throws non-Zod errors', () => {
    const badSchema = {
      parse: () => {
        throw new TypeError('not zod');
      },
    } as unknown as z.ZodType;
    expect(() => validateBody({}, badSchema)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe('validateQuery', () => {
  const schema = z.object({
    page: z.string().regex(/^\d+$/, 'must be numeric'),
    limit: z.string().optional(),
  });

  it('parses query params from a URL and returns typed data', () => {
    const result = validateQuery(
      'http://localhost/api/items?page=1&limit=20',
      schema,
    );
    expect(result).toEqual({ page: '1', limit: '20' });
  });

  it('returns only params present in the URL', () => {
    const result = validateQuery('http://localhost/api/items?page=2', schema);
    expect(result).toEqual({ page: '2' });
  });

  it('throws ValidationError when required param is missing', () => {
    expect(() =>
      validateQuery('http://localhost/api/items?limit=5', schema),
    ).toThrow(ValidationError);
  });

  it('thrown error has VALIDATION_ERROR code and details', () => {
    try {
      validateQuery('http://localhost/api/items', schema);
    } catch (e: any) {
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.details.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// commonSchemas
// ---------------------------------------------------------------------------

describe('commonSchemas.provider', () => {
  it('accepts "client"', () => {
    expect(() => commonSchemas.provider.parse('client')).not.toThrow();
  });

  it('accepts "server"', () => {
    expect(() => commonSchemas.provider.parse('server')).not.toThrow();
  });

  it('rejects any other string', () => {
    expect(() => commonSchemas.provider.parse('admin')).toThrow();
    expect(() => commonSchemas.provider.parse('')).toThrow();
  });
});

describe('commonSchemas.uuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(() =>
      commonSchemas.uuid.parse('550e8400-e29b-41d4-a716-446655440000'),
    ).not.toThrow();
  });

  it('rejects a non-UUID string', () => {
    expect(() => commonSchemas.uuid.parse('not-a-uuid')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => commonSchemas.uuid.parse('')).toThrow();
  });
});

describe('commonSchemas.positiveInt', () => {
  it('accepts positive integers', () => {
    expect(() => commonSchemas.positiveInt.parse(1)).not.toThrow();
    expect(() => commonSchemas.positiveInt.parse(100)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => commonSchemas.positiveInt.parse(0)).toThrow();
  });

  it('rejects negative numbers', () => {
    expect(() => commonSchemas.positiveInt.parse(-1)).toThrow();
  });

  it('rejects floats', () => {
    expect(() => commonSchemas.positiveInt.parse(1.5)).toThrow();
  });

  it('rejects strings', () => {
    expect(() => commonSchemas.positiveInt.parse('5')).toThrow();
  });
});

describe('commonSchemas.connectorName', () => {
  it('accepts a non-empty string', () => {
    expect(() =>
      commonSchemas.connectorName.parse('elastic-prod'),
    ).not.toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => commonSchemas.connectorName.parse('')).toThrow();
  });
});

describe('commonSchemas.modelId', () => {
  it('accepts a non-empty model ID', () => {
    expect(() => commonSchemas.modelId.parse('ibm/granite-13b')).not.toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => commonSchemas.modelId.parse('')).toThrow();
  });
});

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// Mock the logger before importing errorHandler so the module picks up the mock
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

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  RateLimitError,
  withErrorHandler,
  assert,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Error class constructors
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('sets message, statusCode, code, and name', () => {
    const err = new AppError('something went wrong', 418, 'IM_A_TEAPOT');
    expect(err.message).toBe('something went wrong');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('IM_A_TEAPOT');
    expect(err.name).toBe('AppError');
  });

  it('defaults to statusCode=500 and code=INTERNAL_ERROR', () => {
    const err = new AppError('oops');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('is an instance of Error', () => {
    expect(new AppError('x')).toBeInstanceOf(Error);
  });

  it('captures a stack trace', () => {
    const err = new AppError('x');
    expect(err.stack).toBeDefined();
  });

  it('stores optional details', () => {
    const err = new AppError('x', 400, 'ERR', { field: 'name' });
    expect(err.details).toEqual({ field: 'name' });
  });
});

describe('ValidationError', () => {
  it('has statusCode=400 and code=VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('is an instance of AppError', () => {
    expect(new ValidationError('x')).toBeInstanceOf(AppError);
  });
});

describe('AuthenticationError', () => {
  it('has statusCode=401 and code=AUTHENTICATION_ERROR', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('uses default message when none provided', () => {
    expect(new AuthenticationError().message).toBe('Authentication required');
  });

  it('accepts a custom message', () => {
    expect(new AuthenticationError('token expired').message).toBe(
      'token expired',
    );
  });
});

describe('AuthorizationError', () => {
  it('has statusCode=403 and code=AUTHORIZATION_ERROR', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('AUTHORIZATION_ERROR');
  });

  it('uses default message', () => {
    expect(new AuthorizationError().message).toBe('Insufficient permissions');
  });
});

describe('NotFoundError', () => {
  it('has statusCode=404 and code=NOT_FOUND', () => {
    const err = new NotFoundError('User');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('includes the resource name in the message', () => {
    expect(new NotFoundError('Document').message).toBe('Document not found');
  });

  it('defaults to "Resource not found"', () => {
    expect(new NotFoundError().message).toBe('Resource not found');
  });
});

describe('ConflictError', () => {
  it('has statusCode=409 and code=CONFLICT', () => {
    const err = new ConflictError('duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('ExternalServiceError', () => {
  it('has statusCode=503 and code=EXTERNAL_SERVICE_ERROR', () => {
    const err = new ExternalServiceError('Elasticsearch', 'connection refused');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('includes service name and message in error message', () => {
    const err = new ExternalServiceError('Watson', 'timeout');
    expect(err.message).toContain('Watson');
    expect(err.message).toContain('timeout');
  });
});

describe('RateLimitError', () => {
  it('has statusCode=429 and code=RATE_LIMIT_EXCEEDED', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('uses default message', () => {
    expect(new RateLimitError().message).toBe('Too many requests');
  });
});

// ---------------------------------------------------------------------------
// withErrorHandler
// ---------------------------------------------------------------------------

// Minimal Request/Response shim (Node 18+ has these globals; ts-jest node env may not)
function makeRequest(
  url = 'http://localhost/api/test',
  method = 'GET',
): Request {
  return new Request(url, { method });
}

describe('withErrorHandler', () => {
  it('returns the handler response on success', async () => {
    const handler = jest.fn(async (_req: Request) =>
      Response.json({ ok: true }, { status: 200 }),
    );
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('catches AppError and returns formatted JSON with correct status', async () => {
    const handler = jest.fn(async (_req: Request) => {
      throw new ValidationError('field required', { field: 'name' });
    });
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('field required');
    expect(body.error.timestamp).toBeDefined();
  });

  it('catches generic Error and returns status 500', async () => {
    const handler = jest.fn(async (_req: Request) => {
      throw new Error('unexpected failure');
    });
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles JSON SyntaxError as 400', async () => {
    const handler = jest.fn(async (_req: Request) => {
      const e = new SyntaxError('Unexpected token in JSON');
      throw e;
    });
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// assert
// ---------------------------------------------------------------------------

describe('assert', () => {
  it('does not throw when condition is true', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
  });

  it('throws ValidationError when condition is false', () => {
    expect(() => assert(false, 'must be true')).toThrow(ValidationError);
  });

  it('thrown ValidationError has the provided message', () => {
    try {
      assert(false, 'invalid value');
    } catch (e: any) {
      expect(e.message).toBe('invalid value');
    }
  });

  it('passes optional details through to the ValidationError', () => {
    try {
      assert(false, 'bad', { hint: 'check again' });
    } catch (e: any) {
      expect(e.details).toEqual({ hint: 'check again' });
    }
  });
});

// ---------------------------------------------------------------------------
// assertExists
// ---------------------------------------------------------------------------

describe('assertExists', () => {
  it('does not throw for a truthy value', () => {
    expect(() => assertExists('present', 'x')).not.toThrow();
  });

  it('does not throw for 0 (falsy but not null/undefined)', () => {
    expect(() => assertExists(0, 'zero')).not.toThrow();
  });

  it('does not throw for false', () => {
    expect(() => assertExists(false, 'false val')).not.toThrow();
  });

  it('throws NotFoundError for null', () => {
    expect(() => assertExists(null, 'Item')).toThrow(NotFoundError);
  });

  it('throws NotFoundError for undefined', () => {
    expect(() => assertExists(undefined, 'Item')).toThrow(NotFoundError);
  });

  it('thrown NotFoundError message contains the provided label', () => {
    try {
      assertExists(null, 'Document');
    } catch (e: any) {
      expect(e.message).toContain('Document');
    }
  });
});

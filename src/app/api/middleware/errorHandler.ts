/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger, extractRequestContext } from '@/src/common/utilities/logger';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
    timestamp: string;
    path?: string;
  };
}

/**
 * Custom error classes for different error types
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(
      `External service error: ${service} - ${message}`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      details,
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Format error response
 */
function formatErrorResponse(
  error: Error | AppError,
  path?: string,
): ErrorResponse {
  const isAppError = error instanceof AppError;

  return {
    error: {
      message: error.message,
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      ...(isAppError && error.details && { details: error.details }),
      timestamp: new Date().toISOString(),
      ...(path && { path }),
    },
  };
}

/**
 * Determine HTTP status code from error
 */
function getStatusCode(error: Error | AppError): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  // Handle known error types
  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    return 400; // Malformed JSON
  }

  return 500; // Default to internal server error
}

/**
 * Error handler wrapper for API routes
 *
 * Usage:
 * export const POST = withErrorHandler(async (req: Request) => {
 *   // Your route logic here
 *   // Throw AppError instances for specific errors
 *   // Any uncaught errors will be caught and formatted
 * });
 */
export function withErrorHandler(
  handler: (req: Request, context?: any) => Promise<Response>,
) {
  return async (req: Request, context?: any): Promise<Response> => {
    const startTime = Date.now();
    const requestContext = extractRequestContext(req);

    try {
      // Log incoming request
      logger.logRequest(req.method, requestContext.path, {
        query: requestContext.query,
      });

      // Execute the handler
      const response = await handler(req, context);

      // Log successful response
      const duration = Date.now() - startTime;
      logger.logResponse(
        req.method,
        requestContext.path,
        response.status,
        duration,
      );

      return response;
    } catch (error: any) {
      // Log error with full context
      const duration = Date.now() - startTime;
      const statusCode = getStatusCode(error);

      // 4xx errors are client/expected conditions (e.g. polling 404 while the
      // evaluator is still running) — log at warn to avoid flooding the error log.
      // 5xx errors are unexpected server failures and warrant error-level logging.
      const logFn = statusCode >= 500 ? logger.error : logger.warn;
      logFn(`Error in ${req.method} ${requestContext.path}`, {
        error: error.message,
        code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        statusCode,
        duration,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        requestContext,
      });

      // Format error response
      const errorResponse = formatErrorResponse(error, requestContext.path);

      // Return error response
      return Response.json(errorResponse, {
        status: statusCode,
        statusText: error.message,
      });
    }
  };
}

/**
 * Assert condition and throw ValidationError if false
 */
export function assert(
  condition: boolean,
  message: string,
  details?: any,
): asserts condition {
  if (!condition) {
    throw new ValidationError(message, details);
  }
}

/**
 * Assert value is not null/undefined
 */
export function assertExists<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(message);
  }
}

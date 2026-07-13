/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

/**
 * Simple logger that writes to both console and file
 * Designed for hosted deployment with flat file output
 */

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_FILE = path.join(LOG_DIR, 'application.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');

// Ensure log directory exists
if (typeof window === 'undefined') {
  // Server-side only
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: any;
}

/**
 * Format log message with timestamp and level
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}\n`;
}

/**
 * Write log to file (async, non-blocking)
 */
function writeToFile(filePath: string, message: string): void {
  if (typeof window === 'undefined') {
    // Server-side only
    fs.appendFile(filePath, message, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }
}

/**
 * Logger class with methods for different log levels
 */
class Logger {
  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    const formatted = formatLogMessage('info', message, context);
    console.log(formatted.trim());
    writeToFile(LOG_FILE, formatted);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    const formatted = formatLogMessage('warn', message, context);
    console.warn(formatted.trim());
    writeToFile(LOG_FILE, formatted);
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext): void {
    const formatted = formatLogMessage('error', message, context);
    console.error(formatted.trim());
    writeToFile(LOG_FILE, formatted);
    writeToFile(ERROR_LOG_FILE, formatted); // Also write to error-specific log
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      const formatted = formatLogMessage('debug', message, context);
      console.debug(formatted.trim());
      writeToFile(LOG_FILE, formatted);
    }
  }

  /**
   * Log API request
   */
  logRequest(method: string, path: string, context?: LogContext): void {
    this.info(`${method} ${path}`, {
      type: 'request',
      ...context,
    });
  }

  /**
   * Log API response
   */
  logResponse(
    method: string,
    path: string,
    status: number,
    duration: number,
    context?: LogContext,
  ): void {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this[level](`${method} ${path} - ${status} (${duration}ms)`, {
      type: 'response',
      status,
      duration,
      ...context,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Extract relevant request context for logging
 */
export function extractRequestContext(req: Request): LogContext {
  const url = new URL(req.url);
  return {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

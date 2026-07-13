/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import {
  withErrorHandler,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
} from '@/src/app/api/middleware/errorHandler';
import {
  validateBody,
  validateQuery,
} from '@/src/app/api/middleware/validation';
import {
  evaluationsPostSchema,
  evaluationsQuerySchema,
} from '@/src/app/api/schemas/evaluations.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const { id: evaluationID } = validateQuery(req.url, evaluationsQuerySchema);

  const outputPath = `/tmp/output_${evaluationID}.json`;
  const progressPath = `/tmp/progress_${evaluationID}.json`;

  // Output file present → evaluation complete; return full results.
  if (fs.existsSync(outputPath)) {
    try {
      const content = fs.readFileSync(outputPath, 'utf8');
      const result = JSON.parse(content);
      return Response.json({ ...result, status: 'complete' });
    } catch (error: any) {
      throw new ValidationError('Failed to read evaluation results', {
        evaluationID,
        originalError: error.message,
      });
    }
  }

  // Progress file present → evaluation is still running; return partial progress.
  if (fs.existsSync(progressPath)) {
    try {
      const content = fs.readFileSync(progressPath, 'utf8');
      const progress = JSON.parse(content);
      return Response.json({
        status: 'running',
        completed: progress.completed,
        total: progress.total,
      });
    } catch {
      // Progress file may be mid-write (race with the Python process).
      // Return a generic running response rather than a 500.
      return Response.json({ status: 'running', completed: 0, total: 0 });
    }
  }

  // Neither file exists → evaluation not found (may not have started yet).
  throw new NotFoundError(`Evaluation (${evaluationID})`);
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json();
  const dataset = validateBody(body, evaluationsPostSchema);

  const evaluationID = randomUUID();
  const inputPath = `/tmp/input_${evaluationID}.json`;
  const outputPath = `/tmp/output_${evaluationID}.json`;
  const progressPath = `/tmp/progress_${evaluationID}.json`;

  try {
    fs.writeFileSync(inputPath, JSON.stringify(dataset, null, 2), 'utf8');
  } catch (error: any) {
    throw new ValidationError('Failed to write evaluation input', {
      evaluationID,
      originalError: error.message,
    });
  }

  // Build PATH prefix when a Python venv is configured via env var.
  let CMD = '';
  if (process.env.PYTHON_ENVIRONMENT_PATH !== undefined) {
    CMD = `PATH="${process.env.PYTHON_ENVIRONMENT_PATH}/bin:$PATH"`;
  }

  // Preflight: the evaluator runs detached, so a missing Python or missing
  // dependencies would otherwise fail silently and the user would wait forever
  // for results that never arrive. Verify the interpreter can import the
  // evaluator's requirements up front and fail with a clear, actionable error.
  const preflight = spawnSync(
    `${!isEmpty(CMD) ? `${CMD} && ` : ''}python scripts/evaluator.py --help`,
    { shell: true },
  );
  if (preflight.status !== 0) {
    throw new ExternalServiceError(
      'Python evaluator',
      'The Experiment stage requires a Python environment. Install the ' +
        'dependencies (pip install -r scripts/requirements.txt) and set ' +
        'PYTHON_ENVIRONMENT_PATH in your .env.local to the venv directory.',
    );
  }

  const EVALUATE_CMD = `python scripts/evaluator.py --input-path ${inputPath} --output-path ${outputPath} --progress-path ${progressPath}`;

  // Run detached so the Next.js process doesn't block on the evaluator's lifetime.
  spawn(`${!isEmpty(CMD) ? `${CMD} && ${EVALUATE_CMD}` : `${EVALUATE_CMD}`}`, {
    stdio: 'inherit',
    shell: true,
    detached: true,
  });

  return Response.json({ evaluationID: evaluationID });
});

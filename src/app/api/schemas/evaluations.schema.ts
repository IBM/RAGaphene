/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation';

/**
 * Schema for GET /api/evaluations
 * Get evaluation results by ID
 */
export const evaluationsQuerySchema = z.object({
  id: commonSchemas.uuid,
});

// Per-pipeline entry within a task: { predictions: string[], targets: string[] }
const pipelinePredictionSchema = z.object({
  predictions: z.array(z.string()),
  targets: z.array(z.string()),
});

// Each task entry has a task_id plus one key per pipeline name.
// z.record captures the dynamic pipeline-name keys alongside task_id.
const taskEntrySchema = z
  .object({ task_id: z.string() })
  .and(z.record(z.string(), z.union([z.string(), pipelinePredictionSchema])));

/**
 * Schema for POST /api/evaluations
 * Create new evaluation
 */
export const evaluationsPostSchema = z.object({
  metrics: z.array(z.string()).min(1, 'metrics must not be empty'),
  pipelines: z.array(z.string()).min(1, 'pipelines must not be empty'),
  tasks: z.array(taskEntrySchema).min(1, 'tasks must not be empty'),
});

export type EvaluationsQuery = z.infer<typeof evaluationsQuerySchema>;
export type EvaluationsPostBody = z.infer<typeof evaluationsPostSchema>;

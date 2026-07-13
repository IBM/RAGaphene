/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Schema for POST /api/issues
 * Create GitHub issue
 */
export const issuesPostSchema = z.object({
  title: z
    .string()
    .min(1, 'title is required')
    .max(200, 'title must be less than 200 characters'),
  description: z.string().min(1, 'description is required'),
  conversation: z
    .record(z.string(), z.unknown())
    .refine((val) => Object.keys(val).length > 0, {
      message: 'conversation must not be empty',
    }),
});

export type IssuesPostBody = z.infer<typeof issuesPostSchema>;

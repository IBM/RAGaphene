/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Schema for POST /api/conversations
 * Save conversation to database
 */
export const conversationsPostSchema = z.object({
  conversation: z
    .record(z.string(), z.unknown())
    .refine((val) => Object.keys(val).length > 0, {
      message: 'conversation must not be empty',
    }),
});

export type ConversationsPostBody = z.infer<typeof conversationsPostSchema>;

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation';

const messageSchema = z.object({
  speaker: z.enum(['user', 'agent']),
  text: z.string(),
  utterance_id: z.string().optional(),
  contexts: z.array(z.object({ text: z.string() }).passthrough()).optional(),
  timestamp: z.number(),
});

const documentSchema = z.object({ text: z.string() }).passthrough();

/**
 * Schema for POST /api/messages
 *
 * mode=completion: requires `input` (pre-built prompt string)
 * mode=chat_completion: requires `conversation` (raw Message[])
 */
export const messagesPostSchema = z
  .object({
    connector_name: commonSchemas.connectorName,
    provider: commonSchemas.provider,
    // Optional endpoint override for no-auth connectors.
    endpoint: commonSchemas.endpoint.optional(),
    model_id: commonSchemas.modelId,
    mode: z.enum(['completion', 'chat_completion']),
    // text completion fields
    input: commonSchemas.inputText.optional(),
    // chat completion fields
    conversation: z.array(messageSchema).min(1).optional(),
    documents: z.array(documentSchema).optional(),
    system_instruction: z.string().optional(),
    context_template: z.string().optional(),
    parameters: commonSchemas.parameters,
  })
  .refine(
    (data) => (data.mode === 'completion' ? !!data.input : !!data.conversation),
    {
      message:
        'completion mode requires `input`; chat_completion mode requires `conversation`',
    },
  );

export type MessagesPostBody = z.infer<typeof messagesPostSchema>;

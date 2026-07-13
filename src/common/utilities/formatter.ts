/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Document,
  Message,
  ActiveRetriever,
  ActiveGenerator,
} from '@/types/custom';

function formatContexts(contexts: Document[]) {
  return contexts.map((context) => {
    return {
      document_id: context.document_id,
      text: context.text,
      ...(context.title && { title: context.title }),
      ...(context.url && { url: context.url }),
      ...(context.score && { score: context.score }),
      ...(context.feedback && { feedback: context.feedback }),
      ...(context.query && { query: context.query }),
    };
  });
}

export function formatMessages(messages: Message[], prompt?: boolean): {}[] {
  return messages.map((message) => {
    return {
      speaker: message.speaker,
      text: message.text,
      timestamp: message.timestamp,
      ...(message.contexts && { contexts: formatContexts(message.contexts) }),
      ...(message.originalText && { original_text: message.originalText }),
      ...(message.feedback && { feedback: message.feedback }),
      ...(message.enrichments && { enrichments: message.enrichments }),
      ...(message.alternatives && { alternatives: message.alternatives }),
      ...(prompt && message.prompt && { prompt: message.prompt }),
    };
  });
}

export function formatRetriever(retriever: ActiveRetriever) {
  return {
    ...retriever,
    connector: {
      name: retriever.connector.name,
      ...(retriever.connector.endpoint && {
        endpoint: retriever.connector.endpoint,
      }),
    },
  };
}

export function formatGenerator(generator: ActiveGenerator) {
  return {
    ...generator,
    connector: {
      name: generator.connector.name,
      ...(generator.connector.endpoint && {
        endpoint: generator.connector.endpoint,
      }),
    },
  };
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import {
  Notification,
  ActiveGenerator,
  Message,
  ActiveRetriever,
  Document,
} from '@/types/custom';

import { retrieve } from '@/src/common/utilities/search';

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Removes last conversation turn
 * @param messages array of messages in the conversation
 */
export function deleteTurn(messages: Message[]) {
  // Remove last user and agent utterance
  let idx = messages.length - 1;
  while (idx >= messages.length - 2) {
    // Decrement index
    idx = idx - 1;

    // If user utterance, stop processing further
    if (messages[idx].speaker === 'user') {
      break;
    }
  }

  return messages.slice(0, idx);
}

export function encode_documents(
  documents: Document[] | undefined,
  template: string,
): string {
  let context = '';
  documents?.forEach((document) => {
    context += template.replaceAll('${TEXT}', document.text.trim());
  });
  return context.endsWith('\n') ? context.slice(0, -1) : context;
}

export function create_completion_input_prompt(
  messages: Message[],
  template: string,
  skip: boolean = false,
): string {
  // Initialize necessary variables
  let conversation = '';

  // Iterate over messages to form conversation
  messages.forEach((message, messageIdx) => {
    // Copy over input template
    let text: string = template;

    // If first message
    if (messageIdx === 0) {
      // Replace ${SPEAKER} variable
      text = text.replaceAll(
        '${SPEAKER}',
        skip ? '' : message.speaker === 'user' ? 'user' : 'assistant',
      );

      // Replace ${TEXT} variable with message's text
      text = text.replaceAll('${TEXT}', message.text.trim());

      // Add to conversation
      conversation += text;
    } else {
      // Replace ${SPEAKER} variable
      text = text.replaceAll(
        '${SPEAKER}',
        message.speaker === 'user' ? 'user' : 'assistant',
      );

      // Replace ${TEXT} variable with message's text
      text = text.replaceAll('${TEXT}', message.text.trim());

      // Add to conversation
      conversation += text;
    }
  });

  // Return
  return conversation.endsWith('\n') ? conversation.slice(0, -1) : conversation;
}

// ===================================================================================
//                               MAIN FUNCTIONS
// ===================================================================================
export async function generate(
  generator: ActiveGenerator,
  messages: Message[],
  documents: Document[] | undefined,
): Promise<[{ text: string; prompt: string } | undefined, Notification[]]> {
  // Exception holder
  const notifications: Notification[] = [];

  // Form context from documents
  const context = encode_documents(
    documents,
    generator.settings.prompt.context
      ? generator.settings.prompt.context
      : '[DOCUMENT]\n${TEXT}\n[END]\n',
  );

  // Create input
  const input = create_completion_input_prompt(
    messages,
    // @ts-ignore
    generator.settings.prompt.input,
    false,
  );

  // Create prompt
  // @ts-ignore
  let prompt = generator.settings.prompt.template;

  // Replace ${SYSTEM_INST} variable
  prompt = generator.settings.prompt.system_instruction
    ? prompt.replaceAll(
        '${SYSTEM_INST}',
        generator.settings.prompt.system_instruction,
      )
    : prompt;

  // Replace ${CONTEXT} variable
  prompt = prompt.replaceAll('${CONTEXT}', context);

  // Replace ${INPUT} variable
  prompt = prompt.replaceAll('${INPUT}', input);

  // Generate
  let output: { text: string; prompt: string } | undefined = undefined;
  try {
    // Store credentials in session if client-managed (secure HTTP-only cookies)
    if (generator.connector.credentials.provider === 'client') {
      const { storeConnectorCredentials } = await import('./credentials');
      await storeConnectorCredentials(undefined, {
        [generator.connector.name]: {
          endpoint: generator.connector.endpoint,
          api_key: generator.connector.credentials.api_key,
          project_id: generator.connector.credentials.project_id,
        },
      });
    }

    // Invoke API call
    const generate_request = await fetch(`/api/messages`, {
      method: 'POST',
      body: JSON.stringify({
        connector_name: generator.connector.name,
        provider: generator.connector.credentials.provider,
        model_id: generator.id,
        mode: 'completion',
        input: prompt,
        parameters: generator.settings.parameters,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    // Wait on response
    const response = await generate_request.json();

    // Process response and set output
    if (
      response.results &&
      Array.isArray(response.results) &&
      !isEmpty(response.results)
    ) {
      output = {
        text: response.results[0].generated_text.replace(/^\s/gm, ''),
        prompt: prompt,
      };
    } else {
      if (
        response.status_code == 400 &&
        Array.isArray(response.errors) &&
        response.errors.length > 0 &&
        response.errors[0].code === 'model_no_support_for_function'
      ) {
        notifications.push({
          title: `Failed to generate response because "${generator.id}" does not support text completion API.`,
          subtitle: 'Please try selecting different generator',
          kind: 'error',
          timeout: 8000,
        });
      } else {
        notifications.push({
          title: 'Failed to generate response',
          subtitle: 'Please try selecting different generator',
          kind: 'error',
          timeout: 8000,
        });
      }
    }
  } catch (exception: any) {
    notifications.push({
      title: 'Failed to generate response',
      subtitle:
        exception.name === 'TimeoutError'
          ? 'We are noticing more than usual traffic at this time. Please try again in a bit.'
          : 'Please try selecting different generator',
      kind: 'error',
      timeout: 8000,
    });
  }

  // Return
  return [output, notifications];
}

export async function chat(
  generator: ActiveGenerator,
  messages: Message[],
  documents: Document[] | undefined,
): Promise<[{ text: string; prompt: string } | undefined, Notification[]]> {
  // Exception holder
  const notifications: Notification[] = [];

  // Generate
  let output: { text: string; prompt: string } | undefined = undefined;
  try {
    // Store credentials in session if client-managed (secure HTTP-only cookies)
    if (generator.connector.credentials.provider === 'client') {
      const { storeConnectorCredentials } = await import('./credentials');
      await storeConnectorCredentials(undefined, {
        [generator.connector.name]: {
          endpoint: generator.connector.endpoint,
          api_key: generator.connector.credentials.api_key,
          project_id: generator.connector.credentials.project_id,
        },
      });
    }

    // Invoke API call — send raw app data; connector builds wire messages server-side
    const generate_request = await fetch(`/api/messages`, {
      method: 'POST',
      body: JSON.stringify({
        connector_name: generator.connector.name,
        provider: generator.connector.credentials.provider,
        model_id: generator.id,
        mode: 'chat_completion',
        conversation: messages,
        documents: documents,
        system_instruction: generator.settings.prompt.system_instruction,
        context_template: generator.settings.prompt.context,
        parameters: generator.settings.parameters,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    // Wait on response
    const response = await generate_request.json();

    // Process response and set output
    if (
      response.results &&
      Array.isArray(response.results) &&
      !isEmpty(response.results)
    ) {
      output = {
        text: response.results[0].generated_text.replace(/^\s/gm, ''),
        prompt: JSON.stringify(messages),
      };
    } else {
      notifications.push({
        title: 'Failed to generate response',
        subtitle: 'Please try selecting different generator',
        kind: 'error',
        timeout: 8000,
      });
    }
  } catch (exception: any) {
    notifications.push({
      title: 'Failed to generate response',
      subtitle:
        exception.name === 'TimeoutError'
          ? 'We are noticing more than usual traffic at this time. Please try again in a bit.'
          : 'Please try selecting different generator',
      kind: 'error',
      timeout: 8000,
    });
  }

  // Return
  return [output, notifications];
}

export async function sendMessage(
  generator: ActiveGenerator,
  retriever: ActiveRetriever,
  messages: Message[],
): Promise<[Message | undefined, Notification[]]> {
  // Exception holder
  const notifications: Notification[] = [];

  // Retrieve relevant documents
  // Create subset messages as per retriever history parameter
  const subsetMessages =
    retriever.settings.max_utterances === -1
      ? messages
      : messages.slice(
          Math.max(messages.length - retriever.settings.max_utterances, 0),
        );
  let retrieverQueryText = '';
  subsetMessages.forEach((message) => {
    retrieverQueryText += `${message.speaker === 'agent' ? '|assistant|:' : '|user|:'} ${message.text}\n`;
  });

  // Retrieve
  const [documents, retrieveExceptions] = await retrieve(
    retriever,
    retrieverQueryText.slice(0, -1),
  );
  if (!isEmpty(retrieveExceptions)) {
    retrieveExceptions.forEach((exception) => notifications.push(exception));
  }

  // Generate
  let message: Message | undefined = undefined;
  const [output, generateExceptions] =
    generator.mode === 'completion'
      ? await generate(generator, messages, documents)
      : await chat(generator, messages, documents);
  if (!isEmpty(generateExceptions)) {
    generateExceptions.forEach((exception) => notifications.push(exception));
  }
  if (output !== undefined) {
    message = {
      ...output,
      speaker: 'agent',
      timestamp: Math.floor(Date.now() / 1000),
      contexts: documents,
    };
  }

  // Return
  return [message, notifications];
}

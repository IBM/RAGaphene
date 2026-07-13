/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import { Model, Message, Document } from '@/types/custom';
import { OpenAI as OpenAIClient } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama as OllamaClient } from 'ollama';

import { remap } from '@/src/common/utilities/objects';
import { randomUUID } from 'crypto';
import { hash } from '@/src/common/utilities/string';

// Metadata calls (model lists, auth token exchange) are expected to be fast.
const METADATA_TIMEOUT_MS = 30_000;
// Generation calls can be slow when max_new_tokens is large (e.g. 2048 for LLM judge).
// 3 minutes matches the client-side AbortSignal.timeout set in Runner.tsx judge().
const GENERATION_TIMEOUT_MS = 180_000;

// ===================================================================================
//                               SHARED TYPES
// ===================================================================================
export interface GeneratorResult {
  results: { generated_text: string }[];
}

// ===================================================================================
//                               SHARED HELPERS
// ===================================================================================

function encode_documents(
  documents: Document[] | undefined,
  template: string,
): string {
  let context = '';
  documents?.forEach((document) => {
    context += template.replaceAll('${TEXT}', document.text.trim());
  });
  return context.endsWith('\n') ? context.slice(0, -1) : context;
}

/**
 * Builds OpenAI-format wire messages from raw app data.
 * Used by WatsonXAI, OpenAI connectors.
 *
 * - Converts user/agent messages to user/assistant roles
 * - Strips any trailing empty assistant turn (pending response slot)
 * - Appends system message at front if provided
 * - Appends tool_calls + tool results for retrieved documents
 */
function buildOpenAIMessages(
  conversation: Message[],
  documents: Document[] | undefined,
  systemInstruction: string | undefined,
  contextTemplate: string,
): object[] {
  // Build base conversation messages
  let conversationMessages = conversation.map((message) => ({
    role: message.speaker === 'user' ? 'user' : 'assistant',
    content: message.text,
    ...(message.utterance_id && { utterance_id: message.utterance_id }),
  }));

  // Strip trailing empty assistant turn before appending tool usage
  if (
    conversationMessages.length > 0 &&
    (conversationMessages[conversationMessages.length - 1] as any).role ===
      'assistant' &&
    !(conversationMessages[conversationMessages.length - 1] as any).content
  ) {
    conversationMessages = conversationMessages.slice(0, -1);
  }

  // Prepend system message if provided
  const messages: object[] = systemInstruction
    ? [{ role: 'system', content: systemInstruction }, ...conversationMessages]
    : conversationMessages;

  // Build tool call + tool result messages for retrieved documents
  if (documents && documents.length > 0) {
    const tool_calls = new Map<string, object>();
    const tool_results = new Map<string, Document[]>();

    for (const document of documents) {
      const tool_id = document.query
        ? hash(JSON.stringify(document.query))
        : randomUUID();

      if (!tool_calls.has(tool_id)) {
        tool_calls.set(tool_id, {
          id: tool_id,
          type: 'function',
          function: {
            name: 'retrieve',
            // Use "{}" instead of null when no query exists to avoid WatsonX validation failures
            arguments: document.query ? JSON.stringify(document.query) : '{}',
          },
        });
      }

      tool_results.set(tool_id, [
        ...(tool_results.get(tool_id) || []),
        document,
      ]);
    }

    // Add tool calls message
    messages.push({
      role: 'assistant',
      tool_calls: Array.from(tool_calls.values()),
    });

    // Add tool results messages
    tool_results.forEach((docs, tool_call_id) => {
      messages.push({
        role: 'tool',
        tool_call_id: tool_call_id,
        content: encode_documents(docs, contextTemplate),
      });
    });
  }

  return messages;
}

// ===================================================================================
//                               ABSTRACT BASE CLASS
// ===================================================================================
/**
 * Abstract Class ActiveGenerator.
 *
 * @class ActiveGenerator
 */
class ActiveGenerator {
  /** Modes supported by this connector */
  readonly supportedModes: ('completion' | 'chat_completion')[] = [];

  constructor() {
    if (this.constructor === ActiveGenerator) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  /**
   * Fetch models
   * @returns
   */
  async getModels(): Promise<Model[]> {
    throw new Error("Method 'getModels()' must be implemented.");
  }

  /**
   * Generate response via invoking text completion endpoint for the specified model
   * @param model_id model to generate with
   * @param input pre-built prompt string
   * @param parameters text completion parameters
   * @returns
   */
  async generate(
    model_id: string,
    input: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    throw new Error("Method 'generate()' must be implemented.");
  }

  /**
   * Generate response via invoking chat completion endpoint for the specified model.
   * Each connector builds its own wire-format messages internally.
   *
   * @param model_id model to generate with
   * @param conversation raw app Message[] array
   * @param documents raw retrieved documents
   * @param systemInstruction optional system instruction string
   * @param contextTemplate template for encoding documents (e.g. '[DOCUMENT]\n${TEXT}\n[END]\n')
   * @param parameters chat completion parameters
   * @returns
   */
  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    throw new Error("Method 'chat()' must be implemented.");
  }
}

// ===================================================================================
//                               WATSONX.AI GENERATOR
// ===================================================================================
/**
 * WatsonXAI ActiveGenerator — supports both completion and chat_completion
 *
 * @class WatsonXAI
 * @extends {ActiveGenerator}
 */
class WatsonXAI extends ActiveGenerator {
  readonly supportedModes: ('completion' | 'chat_completion')[] = [
    'completion',
    'chat_completion',
  ];

  // Class variables
  endpoint;
  api_key;
  project_id;
  token;
  expiration;

  constructor(endpoint: string, api_key: string, project_id?: string) {
    // Step 1: Validate
    if (project_id === undefined) {
      throw new Error("Missing mandatory 'project_id' field.");
    }

    // Step 2: Initialize parent
    super();

    // Step 3: Set endpoint, API key, and project_id
    this.endpoint = endpoint;
    this.api_key = api_key;
    this.project_id = project_id;
  }

  /** */
  authenticate(api_key: string) {
    return fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: api_key,
      }).toString(),
    }).then(async (response) => {
      if (response.status === 200) {
        return await response.json();
      } else {
        throw new Error('Failed to authenticate');
      }
    });
  }

  /**
   * Fetch models
   * @returns
   */
  async getModels(): Promise<Model[]> {
    // Step 1: Authenticate, if required
    if (
      this.token === undefined ||
      (this.expiration && this.expiration <= Date.now())
    ) {
      await this.authenticate(this.api_key)
        .then(async (response) => {
          this.token = response['access_token'];
          this.expiration = response['expiration'] * 1000;
        })
        .catch((error) => {
          throw new Error(error.message);
        });
    }

    // Step 2: Invoke 'foundation_model_specs' request
    const fetch_models_request = await fetch(
      `${this.endpoint}/ml/v1/foundation_model_specs?version=2023-07-07`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      },
    );

    // Step 3: Wait for response
    const response = await fetch_models_request.json();

    // Step 4: Return limited models
    return response.resources
      .filter((model) =>
        model.task_ids?.includes('retrieval_augmented_generation'),
      )
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((model) => {
        return { id: model.model_id, name: model.label };
      });
  }

  /**
   * Generate response via invoking text completion endpoint for the specified model
   * @param model_id model to generate with
   * @param input request
   * @param parameters text completion parameters
   * @returns
   */
  async generate(model_id, input, parameters): Promise<GeneratorResult> {
    // Step 1: Authenticate, if required
    if (
      this.token === undefined ||
      (this.expiration && this.expiration <= Date.now())
    ) {
      await this.authenticate(this.api_key)
        .then(async (response) => {
          this.token = response['access_token'];
          this.expiration = response['expiration'] * 1000;
        })
        .catch((error) => {
          throw new Error(error.message);
        });
    }

    // Step 2: Remap parameters, if necessary
    const remapped_parameters = remap(parameters, {
      min_new_tokens: ['min_tokens'],
      max_new_tokens: ['max_tokens', 'max_completion_tokens'],
      stop_sequences: ['stop'],
    });

    // Step 3: Invoke 'text/generation' request
    const generate_request = await fetch(
      `${this.endpoint}/ml/v1/text/generation?version=2023-07-07`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          model_id: model_id,
          project_id: this.project_id,
          input: input,
          parameters: remapped_parameters,
        }),
        signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      },
    );

    // Step 4: Wait for response
    return await generate_request.json();
  }

  /**
   * Generate response via invoking chat completion endpoint for the specified model.
   * Builds OpenAI-format messages internally from raw app data.
   */
  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    // Step 1: Authenticate, if required
    if (
      this.token === undefined ||
      (this.expiration && this.expiration <= Date.now())
    ) {
      await this.authenticate(this.api_key)
        .then(async (response) => {
          this.token = response['access_token'];
          this.expiration = response['expiration'] * 1000;
        })
        .catch((error) => {
          throw new Error(error.message);
        });
    }

    // Step 2: Build provider-specific wire messages
    const messages = buildOpenAIMessages(
      conversation,
      documents,
      systemInstruction,
      contextTemplate,
    );

    // Step 3: Remap parameters for WatsonX chat API.
    // The /text/chat endpoint follows OpenAI chat format: max_tokens, not
    // max_new_tokens or max_completion_tokens. repetition_penalty is a
    // completion-only parameter and is rejected by the chat endpoint.
    const { repetition_penalty: _drop, ...chatParams } = parameters as Record<
      string,
      any
    >;
    const remapped_parameters = remap(chatParams, {
      max_tokens: ['max_new_tokens', 'max_completion_tokens'],
      stop: ['stop_sequences'],
    });

    // Step 4: Invoke 'text/chat' request
    const chat_request = await fetch(
      `${this.endpoint}/ml/v1/text/chat?version=2023-07-07`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          model_id: model_id,
          project_id: this.project_id,
          messages: messages,
          ...remapped_parameters,
        }),
        signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      },
    );

    // Step 5: Wait for response
    const response = await chat_request.json();

    // Step 6: Reformat return
    if (!chat_request.ok || !response.choices) {
      throw new Error(
        `WatsonX chat error (HTTP ${chat_request.status}): ${JSON.stringify(response)}`,
      );
    }
    return {
      results: response.choices.map((choice) => ({
        generated_text: choice.message.content,
      })),
    };
  }
}

// ===================================================================================
//                               OPENAI GENERATOR
// ===================================================================================
/**
 * OpenAI ActiveGenerator — chat_completion only
 *
 * @class OpenAI
 * @extends {ActiveGenerator}
 */
class OpenAI extends ActiveGenerator {
  readonly supportedModes: ('completion' | 'chat_completion')[] = [
    'chat_completion',
  ];

  // Class variables
  client;
  api_key;

  constructor(api_key: string) {
    // Step 1: Initialize parent
    super();

    // Step 2: Initialize client
    this.client = new OpenAIClient({ apiKey: api_key });

    // Step 3: Set api_key
    this.api_key = api_key;
  }

  /**
   * Fetch models
   * @returns
   */
  async getModels(): Promise<Model[]> {
    return [
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
      },
    ]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((model) => {
        return { id: model.id, name: model.name };
      });
  }

  /**
   * OpenAI does not support legacy text completion via this connector.
   * Use the chat() method instead.
   */
  async generate(model_id, input, parameters): Promise<GeneratorResult> {
    const response = await this.client.completions.create({
      model: model_id,
      prompt: input,
      max_tokens: parameters.max_new_tokens,
    });

    return {
      results: response.choices.map((choice) => ({
        generated_text: choice.text,
      })),
    };
  }

  /**
   * Generate response via invoking chat completion endpoint for the specified model.
   * Builds OpenAI-format messages internally from raw app data.
   */
  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    // Step 1: Build provider-specific wire messages
    const messages = buildOpenAIMessages(
      conversation,
      documents,
      systemInstruction,
      contextTemplate,
    );

    // Step 2: Wait for response
    const response = await this.client.chat.completions.create({
      model: model_id,
      messages: messages as any,
      ...parameters,
    });

    // Step 3: Return response
    return {
      results: response.choices.map((choice) => ({
        generated_text: choice.message.content,
      })),
    };
  }
}

// ===================================================================================
//                               ANTHROPIC GENERATOR
// ===================================================================================
/**
 * Anthropic ActiveGenerator — chat_completion only.
 * Uses the Anthropic Messages API with its native format:
 * top-level `system` string + `messages` array of content blocks.
 * Retrieved documents are injected as a user turn with a formatted context block.
 *
 * @class AnthropicGenerator
 * @extends {ActiveGenerator}
 */
class AnthropicGenerator extends ActiveGenerator {
  readonly supportedModes: ('completion' | 'chat_completion')[] = [
    'chat_completion',
  ];

  client: Anthropic;
  api_key: string;

  constructor(api_key: string) {
    super();
    this.api_key = api_key;
    this.client = new Anthropic({ apiKey: api_key });
  }

  async getModels(): Promise<Model[]> {
    const response = await this.client.models.list();
    return response.data
      .filter((m) => m.type === 'model')
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((m) => ({ id: m.id, name: m.display_name }));
  }

  /**
   * Anthropic does not offer a legacy text completion endpoint.
   * Calling generate() raises an informative error.
   */
  async generate(
    model_id: string,
    input: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    throw new Error(
      'Anthropic connector does not support text completion mode. Use chat_completion.',
    );
  }

  /**
   * Build Anthropic-native wire messages from raw app data.
   *
   * Anthropic format:
   *   - `system` top-level string (optional)
   *   - `messages`: [{role:'user'|'assistant', content: string | ContentBlock[]}]
   *   - No tool_call messages in base API; retrieved docs are prepended to the
   *     final user turn as a formatted context block.
   */
  private buildAnthropicMessages(
    conversation: Message[],
    documents: Document[] | undefined,
    contextTemplate: string,
  ): { role: 'user' | 'assistant'; content: string }[] {
    // Build context string from retrieved documents
    const contextBlock =
      documents && documents.length > 0
        ? encode_documents(documents, contextTemplate)
        : '';

    const wireMessages = conversation.map((message, idx) => {
      const isLastUserMessage =
        message.speaker === 'user' && idx === conversation.length - 1;

      const content =
        isLastUserMessage && contextBlock
          ? `${contextBlock}\n\n${message.text.trim()}`
          : message.text.trim();

      return {
        role: (message.speaker === 'user' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content,
      };
    });

    // Strip trailing empty assistant turn (pending response slot)
    if (
      wireMessages.length > 0 &&
      wireMessages[wireMessages.length - 1].role === 'assistant' &&
      !wireMessages[wireMessages.length - 1].content
    ) {
      wireMessages.pop();
    }

    return wireMessages;
  }

  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    const messages = this.buildAnthropicMessages(
      conversation,
      documents,
      contextTemplate,
    );

    // Remap parameters to Anthropic naming
    const remapped = remap(parameters, {
      max_tokens: ['max_new_tokens', 'max_completion_tokens'],
      stop_sequences: ['stop'],
    }) as any;

    // max_tokens is required by Anthropic API
    if (!remapped.max_tokens) {
      remapped.max_tokens = 1024;
    }

    const response = await this.client.messages.create({
      model: model_id,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      messages,
      ...remapped,
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    return { results: [{ generated_text: text }] };
  }
}

// ===================================================================================
//                               GEMINI GENERATOR
// ===================================================================================
/**
 * Gemini ActiveGenerator — chat_completion only.
 * Uses Google Generative AI SDK with its native `contents` format.
 * Retrieved documents are prepended to the final user turn as a context block.
 *
 * @class GeminiGenerator
 * @extends {ActiveGenerator}
 */
class GeminiGenerator extends ActiveGenerator {
  readonly supportedModes: ('completion' | 'chat_completion')[] = [
    'chat_completion',
  ];

  client: GoogleGenerativeAI;
  api_key: string;

  constructor(api_key: string) {
    super();
    this.api_key = api_key;
    this.client = new GoogleGenerativeAI(api_key);
  }

  async getModels(): Promise<Model[]> {
    // Static list of supported Gemini models
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash-8B' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Gemini does not have a legacy text completion endpoint.
   */
  async generate(
    model_id: string,
    input: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    throw new Error(
      'Gemini connector does not support text completion mode. Use chat_completion.',
    );
  }

  /**
   * Build Gemini-native `contents` array from raw app data.
   *
   * Gemini format:
   *   - `contents`: [{role:'user'|'model', parts:[{text:string}]}]
   *   - System instruction passed separately as `systemInstruction`
   *   - Retrieved docs prepended to the final user turn as a context block
   */
  private buildGeminiContents(
    conversation: Message[],
    documents: Document[] | undefined,
    contextTemplate: string,
  ): { role: 'user' | 'model'; parts: { text: string }[] }[] {
    const contextBlock =
      documents && documents.length > 0
        ? encode_documents(documents, contextTemplate)
        : '';

    const contents = conversation.map((message, idx) => {
      const isLastUserMessage =
        message.speaker === 'user' && idx === conversation.length - 1;

      const text =
        isLastUserMessage && contextBlock
          ? `${contextBlock}\n\n${message.text.trim()}`
          : message.text.trim();

      return {
        role: (message.speaker === 'user' ? 'user' : 'model') as
          | 'user'
          | 'model',
        parts: [{ text }],
      };
    });

    // Strip trailing empty model turn (pending response slot)
    if (
      contents.length > 0 &&
      contents[contents.length - 1].role === 'model' &&
      !contents[contents.length - 1].parts[0].text
    ) {
      contents.pop();
    }

    return contents;
  }

  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    const contents = this.buildGeminiContents(
      conversation,
      documents,
      contextTemplate,
    );

    // Remap parameters to Gemini naming
    const remapped = remap(parameters, {
      maxOutputTokens: ['max_new_tokens', 'max_completion_tokens'],
      stopSequences: ['stop_sequences', 'stop'],
    }) as any;

    const model = this.client.getGenerativeModel({
      model: model_id,
      ...(systemInstruction
        ? {
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemInstruction }],
            },
          }
        : {}),
      generationConfig: remapped,
    });

    const result = await model.generateContent({ contents });
    const text = result.response.text();

    return { results: [{ generated_text: text }] };
  }
}

// ===================================================================================
//                               OLLAMA GENERATOR
// ===================================================================================
/**
 * Ollama ActiveGenerator — supports both completion and chat_completion.
 * Connects to a locally-running Ollama server (default: http://localhost:11434).
 * Uses the Ollama JS SDK for both generate (completion) and chat endpoints.
 *
 * @class OllamaGenerator
 * @extends {ActiveGenerator}
 */
class OllamaGenerator extends ActiveGenerator {
  readonly supportedModes: ('completion' | 'chat_completion')[] = [
    'completion',
    'chat_completion',
  ];

  client: OllamaClient;
  endpoint: string;

  constructor(endpoint: string) {
    super();
    this.endpoint = endpoint || 'http://localhost:11434';
    this.client = new OllamaClient({ host: this.endpoint });
  }

  /**
   * List locally-available models from the running Ollama instance.
   */
  async getModels(): Promise<Model[]> {
    const response = await this.client.list();
    return response.models
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.name, name: m.name }));
  }

  async generate(
    model_id: string,
    input: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    // Remap parameters to Ollama naming
    const remapped = remap(parameters, {
      num_predict: ['max_new_tokens', 'max_completion_tokens'],
      stop: ['stop_sequences'],
    }) as any;

    const response = await this.client.generate({
      model: model_id,
      prompt: input,
      stream: false,
      options: remapped,
    });

    return { results: [{ generated_text: response.response }] };
  }

  async chat(
    model_id: string,
    conversation: Message[],
    documents: Document[] | undefined,
    systemInstruction: string | undefined,
    contextTemplate: string,
    parameters: {},
  ): Promise<GeneratorResult> {
    // Ollama uses OpenAI-compatible chat format
    const messages = buildOpenAIMessages(
      conversation,
      documents,
      systemInstruction,
      contextTemplate,
    ) as { role: string; content: string }[];

    // Remap parameters to Ollama naming
    const remapped = remap(parameters, {
      num_predict: ['max_new_tokens', 'max_completion_tokens'],
      stop: ['stop_sequences'],
    }) as any;

    const response = await this.client.chat({
      model: model_id,
      messages,
      stream: false,
      options: remapped,
    });

    return {
      results: [{ generated_text: response.message.content }],
    };
  }
}

export function getGenerator(
  name: string,
  endpoint: string,
  // Optional so no-auth connectors (e.g. Ollama) can be constructed without a key.
  // Authenticated subclasses still validate their own required fields.
  api_key?: string,
  project_id?: string,
): ActiveGenerator | Error {
  if (name === 'Ollama') {
    // No-auth connector: endpoint only, no key.
    return new OllamaGenerator(endpoint);
  }

  // Every remaining connector authenticates with an API key. Fail loudly rather
  // than construct a client that will error opaquely on the first request.
  if (api_key === undefined) {
    throw new Error(`Missing API key for generator (${name}).`);
  }

  if (name === 'WatsonX.AI') {
    return new WatsonXAI(endpoint, api_key, project_id);
  } else if (name === 'OpenAI') {
    return new OpenAI(api_key);
  } else if (name === 'Anthropic') {
    return new AnthropicGenerator(api_key);
  } else if (name === 'Gemini') {
    return new GeminiGenerator(api_key);
  } else {
    throw new Error(`Unsupported generator (${name}).`);
  }
}

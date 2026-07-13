/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/connectors/generator.ts
 *
 * All external SDK calls are mocked — no live API required.
 */

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared before any imports)
// ---------------------------------------------------------------------------

// Mock the OpenAI SDK
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ text: 'openai completion output' }],
      }),
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'openai chat output' } }],
        }),
      },
    },
  })),
}));

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'anthropic output' }],
  });
  const mockModelsList = jest.fn().mockResolvedValue({
    data: [
      {
        id: 'claude-sonnet-4-6',
        display_name: 'Claude Sonnet 4.6',
        type: 'model',
      },
      {
        id: 'claude-haiku-4-5-20251001',
        display_name: 'Claude Haiku 4.5',
        type: 'model',
      },
    ],
  });
  const AnthropicMock = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
    models: { list: mockModelsList },
  }));
  return {
    __esModule: true,
    default: AnthropicMock,
  };
});

// Mock the Google Generative AI SDK
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn().mockResolvedValue({
    response: { text: () => 'gemini output' },
  });
  const mockGetGenerativeModel = jest.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

// Mock the Ollama SDK
jest.mock('ollama', () => {
  const mockGenerate = jest
    .fn()
    .mockResolvedValue({ response: 'ollama completion output' });
  const mockChat = jest.fn().mockResolvedValue({
    message: { content: 'ollama chat output' },
  });
  const mockList = jest.fn().mockResolvedValue({
    models: [{ name: 'llama3.2' }, { name: 'mistral' }],
  });
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      generate: mockGenerate,
      chat: mockChat,
      list: mockList,
    })),
  };
});

// ---------------------------------------------------------------------------
// Import under test (AFTER mocks)
// ---------------------------------------------------------------------------
import { getGenerator } from '@/src/common/connectors/generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DEFAULT_CONTEXT_TEMPLATE = '[DOCUMENT]\n${TEXT}\n[END]\n';

function makeConversation(text = 'Hello') {
  return [{ speaker: 'user' as const, text, timestamp: Date.now() }];
}

// ---------------------------------------------------------------------------
// getGenerator — factory function
// ---------------------------------------------------------------------------

describe('getGenerator — factory', () => {
  it('creates a WatsonX.AI generator', () => {
    const gen = getGenerator(
      'WatsonX.AI',
      'https://us-south.ml.cloud.ibm.com',
      'test-key',
      'proj-123',
    );
    expect(gen).toBeDefined();
    expect(gen).not.toBeInstanceOf(Error);
  });

  it('throws when WatsonX.AI is missing project_id', () => {
    expect(() =>
      getGenerator('WatsonX.AI', 'https://us-south.ml.cloud.ibm.com', 'key'),
    ).toThrow("Missing mandatory 'project_id' field.");
  });

  it('creates an OpenAI generator', () => {
    const gen = getGenerator('OpenAI', '', 'test-key');
    expect(gen).toBeDefined();
  });

  it('creates an Anthropic generator', () => {
    const gen = getGenerator('Anthropic', '', 'ant-key');
    expect(gen).toBeDefined();
  });

  it('creates a Gemini generator', () => {
    const gen = getGenerator('Gemini', '', 'gem-key');
    expect(gen).toBeDefined();
  });

  it('creates an Ollama generator', () => {
    const gen = getGenerator('Ollama', 'http://localhost:11434', '');
    expect(gen).toBeDefined();
  });

  it('creates an Ollama generator with no api_key (no-auth connector)', () => {
    // Endpoint-only construction: the factory must not demand a key.
    const gen = getGenerator('Ollama', 'http://localhost:11434', undefined);
    expect(gen).toBeDefined();
    expect(gen).not.toBeInstanceOf(Error);
  });

  it('throws when an authenticated connector is missing its api_key', () => {
    expect(() =>
      getGenerator('OpenAI', 'https://api.openai.com/v1', undefined),
    ).toThrow('Missing API key for generator (OpenAI).');
  });

  it('throws for an unsupported name', () => {
    expect(() => getGenerator('Unknown', '', 'key')).toThrow(
      'Unsupported generator (Unknown).',
    );
  });
});

// ---------------------------------------------------------------------------
// supportedModes
// ---------------------------------------------------------------------------

describe('supportedModes', () => {
  it('WatsonX.AI supports both completion and chat_completion', () => {
    const gen = getGenerator(
      'WatsonX.AI',
      'https://us-south.ml.cloud.ibm.com',
      'key',
      'proj',
    ) as any;
    expect(gen.supportedModes).toContain('completion');
    expect(gen.supportedModes).toContain('chat_completion');
  });

  it('OpenAI supports only chat_completion', () => {
    const gen = getGenerator('OpenAI', '', 'key') as any;
    expect(gen.supportedModes).toEqual(['chat_completion']);
  });

  it('Anthropic supports only chat_completion', () => {
    const gen = getGenerator('Anthropic', '', 'key') as any;
    expect(gen.supportedModes).toEqual(['chat_completion']);
  });

  it('Gemini supports only chat_completion', () => {
    const gen = getGenerator('Gemini', '', 'key') as any;
    expect(gen.supportedModes).toEqual(['chat_completion']);
  });

  it('Ollama supports both completion and chat_completion', () => {
    const gen = getGenerator('Ollama', 'http://localhost:11434', '') as any;
    expect(gen.supportedModes).toContain('completion');
    expect(gen.supportedModes).toContain('chat_completion');
  });
});

// ---------------------------------------------------------------------------
// WatsonX.AI generator
// ---------------------------------------------------------------------------

describe('WatsonX.AI', () => {
  let gen: any;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    gen = getGenerator(
      'WatsonX.AI',
      'https://us-south.ml.cloud.ibm.com',
      'watsonx-key',
      'proj-001',
    );

    // Replace global fetch with a controlled mock
    mockFetch = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
    // Reset token so the next test re-authenticates
    gen.token = undefined;
    gen.expiration = undefined;
  });

  it('getModels() authenticates then calls foundation_model_specs', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'tok-abc',
            expiration: Math.floor(Date.now() / 1000) + 3600,
          }),
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        json: () =>
          Promise.resolve({
            resources: [
              {
                model_id: 'ibm/granite-13b',
                label: 'Granite 13B',
                task_ids: ['retrieval_augmented_generation'],
              },
              {
                model_id: 'ibm/other',
                label: 'Other',
                task_ids: ['summarization'],
              },
            ],
          }),
      } as any);

    const models = await gen.getModels();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('ibm/granite-13b');
  });

  it('getModels() skips authentication when token is still valid', async () => {
    gen.token = 'existing-token';
    gen.expiration = Date.now() + 60_000; // still valid

    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ resources: [] }),
    } as any);

    await gen.getModels();
    // Only one fetch call — the model specs request, no auth call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('generate() remaps max_completion_tokens → max_new_tokens', async () => {
    gen.token = 'tok';
    gen.expiration = Date.now() + 60_000;

    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: () =>
        Promise.resolve({ results: [{ generated_text: 'wx output' }] }),
    } as any);

    const result = await gen.generate('ibm/granite', 'prompt', {
      max_completion_tokens: 200,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parameters.max_new_tokens).toBe(200);
    expect(body.parameters.max_completion_tokens).toBeUndefined();
    expect(result).toEqual({ results: [{ generated_text: 'wx output' }] });
  });

  it('chat() builds OpenAI-format messages and reshapes choices into results[].generated_text', async () => {
    gen.token = 'tok';
    gen.expiration = Date.now() + 60_000;

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'assistant reply' } }],
        }),
    } as any);

    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const result = (await gen.chat(
      'ibm/granite',
      conversation,
      undefined,
      'You are helpful.',
      DEFAULT_CONTEXT_TEMPLATE,
      { max_new_tokens: 50 },
    )) as any;

    expect(result.results[0].generated_text).toBe('assistant reply');

    // Verify wire messages were built correctly
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are helpful.');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('What is RAG?');
  });

  it('chat() uses "{}" instead of null for tool_call arguments when no query', async () => {
    gen.token = 'tok';
    gen.expiration = Date.now() + 60_000;

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'reply' } }],
        }),
    } as any);

    const conversation = [
      { speaker: 'user' as const, text: 'hello', timestamp: 1 },
    ];
    const docs = [
      {
        type: 'DOCUMENT' as const,
        document_id: 'd1',
        text: 'some doc',
        score: 0.9,
      },
    ];
    await gen.chat(
      'ibm/granite',
      conversation,
      docs,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Find the assistant tool_calls message
    const assistantMsg = body.messages.find(
      (m: any) => m.role === 'assistant' && m.tool_calls,
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.tool_calls[0].function.arguments).toBe('{}');
  });

  it('chat() strips trailing empty assistant turn before tool usage', async () => {
    gen.token = 'tok';
    gen.expiration = Date.now() + 60_000;

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'reply' } }],
        }),
    } as any);

    // Last message is an empty-content assistant (pending response slot)
    const conversation = [
      { speaker: 'user' as const, text: 'hello', timestamp: 1 },
      { speaker: 'agent' as const, text: '', timestamp: 2 },
    ];
    const docs = [
      {
        type: 'DOCUMENT' as const,
        document_id: 'd1',
        text: 'some doc',
        score: 0.9,
      },
    ];
    await gen.chat(
      'ibm/granite',
      conversation,
      docs,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // There should be no empty-content assistant message before the tool_calls message
    const emptyAssistant = body.messages.find(
      (m: any) => m.role === 'assistant' && !m.tool_calls && m.content === '',
    );
    expect(emptyAssistant).toBeUndefined();
  });

  it('chat() throws when WatsonX returns an error response', async () => {
    gen.token = 'tok';
    gen.expiration = Date.now() + 60_000;

    mockFetch.mockResolvedValueOnce({
      status: 400,
      ok: false,
      json: () => Promise.resolve({ error: 'bad request' }),
    } as any);

    await expect(
      gen.chat(
        'ibm/granite',
        makeConversation(),
        undefined,
        undefined,
        DEFAULT_CONTEXT_TEMPLATE,
        {},
      ),
    ).rejects.toThrow('WatsonX chat error');
  });

  it('authenticate() throws when IAM returns non-200', async () => {
    mockFetch.mockResolvedValueOnce({ status: 401 } as any);
    await expect(gen.authenticate('bad-key')).rejects.toThrow(
      'Failed to authenticate',
    );
  });
});

// ---------------------------------------------------------------------------
// OpenAI generator
// ---------------------------------------------------------------------------

describe('OpenAI', () => {
  const gen = getGenerator('OpenAI', '', 'openai-key') as any;

  it('getModels() returns the static list of GPT models', async () => {
    const models = await gen.getModels();
    expect(models.length).toBeGreaterThan(0);
    const ids = models.map((m: any) => m.id);
    expect(ids).toContain('gpt-4o-mini');
  });

  it('generate() returns results[].generated_text', async () => {
    const result = (await gen.generate('gpt-4o-mini', 'prompt', {
      max_new_tokens: 50,
    })) as any;
    expect(result.results[0].generated_text).toBe('openai completion output');
  });

  it('chat() builds OpenAI-format messages and returns results[].generated_text', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'hello', timestamp: 1 },
    ];
    const result = (await gen.chat(
      'gpt-4o-mini',
      conversation,
      undefined,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    )) as any;
    expect(result.results[0].generated_text).toBe('openai chat output');
  });
});

// ---------------------------------------------------------------------------
// Anthropic generator
// ---------------------------------------------------------------------------

describe('Anthropic', () => {
  const gen = getGenerator('Anthropic', '', 'ant-key') as any;

  it('getModels() returns models from the SDK', async () => {
    const models = await gen.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    // Should be sorted by display name
    const names = models.map((m: any) => m.name);
    expect(names).toEqual([...names].sort());
  });

  it('generate() throws — completion mode not supported', async () => {
    await expect(
      gen.generate('claude-sonnet-4-6', 'hello', {}),
    ).rejects.toThrow(
      'Anthropic connector does not support text completion mode.',
    );
  });

  it('chat() returns results[].generated_text', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const result = (await gen.chat(
      'claude-sonnet-4-6',
      conversation,
      undefined,
      'You are helpful.',
      DEFAULT_CONTEXT_TEMPLATE,
      { max_new_tokens: 100 },
    )) as any;
    expect(result.results[0].generated_text).toBe('anthropic output');
  });

  it('chat() passes system instruction as top-level system param', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'hi', timestamp: 1 },
    ];
    await gen.chat(
      'claude-sonnet-4-6',
      conversation,
      undefined,
      'Be concise.',
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const AnthropicMock = require('@anthropic-ai/sdk').default;
    const instance = AnthropicMock.mock.results[0].value;
    const callArgs = instance.messages.create.mock.calls.at(-1)[0];
    expect(callArgs.system).toBe('Be concise.');
    // Messages should NOT contain a system role entry
    expect(callArgs.messages.every((m: any) => m.role !== 'system')).toBe(true);
  });

  it('chat() prepends context to the last user turn when documents provided', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const docs = [
      {
        type: 'DOCUMENT' as const,
        document_id: 'd1',
        text: 'RAG doc text',
        score: 0.9,
      },
    ];
    await gen.chat(
      'claude-sonnet-4-6',
      conversation,
      docs,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const AnthropicMock = require('@anthropic-ai/sdk').default;
    const instance = AnthropicMock.mock.results[0].value;
    const callArgs = instance.messages.create.mock.calls.at(-1)[0];
    const lastUserMsg = callArgs.messages.at(-1);
    expect(lastUserMsg.role).toBe('user');
    expect(lastUserMsg.content).toContain('RAG doc text');
    expect(lastUserMsg.content).toContain('What is RAG?');
  });

  it('chat() defaults max_tokens to 1024 when not provided', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'hi', timestamp: 1 },
    ];
    await gen.chat(
      'claude-sonnet-4-6',
      conversation,
      undefined,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const AnthropicMock = require('@anthropic-ai/sdk').default;
    const instance = AnthropicMock.mock.results[0].value;
    const callArgs = instance.messages.create.mock.calls.at(-1)[0];
    expect(callArgs.max_tokens).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// Gemini generator
// ---------------------------------------------------------------------------

describe('Gemini', () => {
  const gen = getGenerator('Gemini', '', 'gem-key') as any;

  it('getModels() returns static Gemini model list', async () => {
    const models = await gen.getModels();
    expect(models.length).toBeGreaterThan(0);
    const ids = models.map((m: any) => m.id);
    expect(ids).toContain('gemini-2.0-flash');
    expect(ids).toContain('gemini-1.5-pro');
  });

  it('generate() throws — completion mode not supported', async () => {
    await expect(gen.generate('gemini-2.0-flash', 'hello', {})).rejects.toThrow(
      'Gemini connector does not support text completion mode.',
    );
  });

  it('chat() returns results[].generated_text', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const result = (await gen.chat(
      'gemini-2.0-flash',
      conversation,
      undefined,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    )) as any;
    expect(result.results[0].generated_text).toBe('gemini output');
  });

  it('chat() passes systemInstruction to getGenerativeModel', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'hi', timestamp: 1 },
    ];
    await gen.chat(
      'gemini-2.0-flash',
      conversation,
      undefined,
      'You are an expert.',
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const { GoogleGenerativeAI: GeminiMock } = require('@google/generative-ai');
    const instance = GeminiMock.mock.results[0].value;
    const getModelCallArgs = instance.getGenerativeModel.mock.calls.at(-1)[0];
    expect(getModelCallArgs.systemInstruction.parts[0].text).toBe(
      'You are an expert.',
    );
  });

  it('chat() prepends context to the last user turn when documents provided', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const docs = [
      {
        type: 'DOCUMENT' as const,
        document_id: 'd1',
        text: 'Gemini doc text',
        score: 0.9,
      },
    ];
    await gen.chat(
      'gemini-2.0-flash',
      conversation,
      docs,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const { GoogleGenerativeAI: GeminiMock } = require('@google/generative-ai');
    const instance = GeminiMock.mock.results[0].value;
    const modelInstance = instance.getGenerativeModel.mock.results.at(-1).value;
    const generateArgs = modelInstance.generateContent.mock.calls.at(-1)[0];
    const lastUserContent = generateArgs.contents.at(-1);
    expect(lastUserContent.role).toBe('user');
    expect(lastUserContent.parts[0].text).toContain('Gemini doc text');
    expect(lastUserContent.parts[0].text).toContain('What is RAG?');
  });
});

// ---------------------------------------------------------------------------
// Ollama generator
// ---------------------------------------------------------------------------

describe('Ollama', () => {
  const gen = getGenerator('Ollama', 'http://localhost:11434', '') as any;

  it('getModels() returns models from the running Ollama instance', async () => {
    const models = await gen.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });

  it('generate() returns results[].generated_text', async () => {
    const result = (await gen.generate('llama3.2', 'Hello', {
      max_new_tokens: 100,
    })) as any;
    expect(result.results[0].generated_text).toBe('ollama completion output');
  });

  it('generate() remaps max_new_tokens → num_predict', async () => {
    const { Ollama: OllamaMock } = require('ollama');
    const instance = OllamaMock.mock.results[0].value;
    instance.generate.mockClear();
    await gen.generate('llama3.2', 'Hello', { max_new_tokens: 200 });
    const callArgs = instance.generate.mock.calls[0][0];
    expect(callArgs.options.num_predict).toBe(200);
    expect(callArgs.options.max_new_tokens).toBeUndefined();
  });

  it('chat() returns results[].generated_text', async () => {
    const conversation = [
      { speaker: 'user' as const, text: 'What is RAG?', timestamp: 1 },
    ];
    const result = (await gen.chat(
      'llama3.2',
      conversation,
      undefined,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    )) as any;
    expect(result.results[0].generated_text).toBe('ollama chat output');
  });

  it('chat() passes OpenAI-format messages to the Ollama chat API', async () => {
    const { Ollama: OllamaMock } = require('ollama');
    const instance = OllamaMock.mock.results[0].value;
    instance.chat.mockClear();

    const conversation = [
      { speaker: 'user' as const, text: 'hello', timestamp: 1 },
    ];
    await gen.chat(
      'llama3.2',
      conversation,
      undefined,
      'Be helpful.',
      DEFAULT_CONTEXT_TEMPLATE,
      {},
    );
    const callArgs = instance.chat.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[0].content).toBe('Be helpful.');
    expect(callArgs.messages[1].role).toBe('user');
    expect(callArgs.messages[1].content).toBe('hello');
  });

  it('chat() remaps max_new_tokens → num_predict for options', async () => {
    const { Ollama: OllamaMock } = require('ollama');
    const instance = OllamaMock.mock.results[0].value;
    instance.chat.mockClear();

    const conversation = [
      { speaker: 'user' as const, text: 'hi', timestamp: 1 },
    ];
    await gen.chat(
      'llama3.2',
      conversation,
      undefined,
      undefined,
      DEFAULT_CONTEXT_TEMPLATE,
      { max_new_tokens: 300 },
    );
    const callArgs = instance.chat.mock.calls[0][0];
    expect(callArgs.options.num_predict).toBe(300);
    expect(callArgs.options.max_new_tokens).toBeUndefined();
  });

  it('uses http://localhost:11434 as default when no endpoint provided', () => {
    const defaultGen = getGenerator('Ollama', '', '') as any;
    expect(defaultGen.endpoint).toBe('http://localhost:11434');
  });
});

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { SystemConfiguration } from '@/types/custom';

const authProvider =
  (process.env.AUTH_PROVIDER as 'credentials' | 'oauth' | 'github') ||
  'credentials';

const config: SystemConfiguration = {
  authenticator: { enabled: true, provider: authProvider },
  retrievers: [
    {
      disabled: false,
      name: 'Local Documents',
      description:
        'Upload your own documents (.txt, .md, .pdf) and search them locally. ' +
        'No external service required. Ideal for first-time setup and small demos. ' +
        'For production use, switch to Elasticsearch.',
      credentials: { provider: 'server' },
      provider: 'local',
      tags: ['Recommended'],
      // Disk-backed and local to this process — no benefit to caching, and
      // caching would hide out-of-band changes (manual deletes, TTL sweep).
      maxAge: 0,
      settings: {
        configurable: true,
        feedback: { enabled: false },
        max_count: 3,
        max_utterances: -1,
        query_syntax: JSON.stringify({ query: '${QUERY}' }),
        templates: {
          projection: '${text}',
          display: '<h4>${source}</h4>\n\n${text}',
        },
      },
    },
    {
      disabled: false,
      name: 'ElasticSearch',
      description:
        'Elasticsearch enables semantic retrieval over your indexed documents using ' +
        'sparse or dense vector search. Retrieves documents based on contextual meaning and user intent rather than exact keyword matches.',
      env_endpoint: 'ES_ENDPOINT',
      credentials: {
        provider: 'server',
        // API key auth (preferred) — takes precedence if both are set
        env_api_key: 'ES_API_KEY',
        // Basic auth alternative — both must be set together
        env_username: 'ES_USERNAME',
        env_password: 'ES_PASSWORD',
      },
      provider: 'elastic',
      settings: {
        configurable: true,
        feedback: { enabled: true },
        max_count: 3,
        max_utterances: -1,
        query_syntax: JSON.stringify({
          query: {
            bool: {
              must: {
                text_expansion: {
                  'ml.tokens': {
                    model_id: '.elser_model_1',
                    model_text: '${QUERY}',
                  },
                },
              },
            },
          },
        }),
        templates: {
          projection: '${text}',
          display:
            '<h4>${title}</h4>\n-----------------------------------------\n\n${text}',
        },
      },
    },
    {
      disabled: true,
      name: 'MongoDB',
      description:
        'MongoDB Atlas Vector Search enables semantic retrieval over your MongoDB collections using ' +
        'vector embeddings stored alongside your documents. Supports hybrid search combining vector ' +
        'similarity with standard query filters.',
      env_endpoint: 'MONGODB_ENDPOINT',
      credentials: {
        provider: 'server',
        env_username: 'MONGODB_USERNAME',
        env_password: 'MONGODB_PASSWORD',
        env_database: 'MONGODB_DATABASE',
      },
      provider: 'mongodb',
      tags: ['Coming Soon'],
      settings: {
        configurable: true,
        feedback: { enabled: false },
        max_count: 3,
        max_utterances: -1,
        query_syntax: JSON.stringify({ query: '${QUERY}' }),
        templates: {
          projection: '${text}',
          display:
            '<h4>${title}</h4>\n-----------------------------------------\n\n${text}',
        },
      },
    },
  ],
  generators: [
    {
      disabled: false,
      name: 'Ollama',
      description:
        'Ollama lets you run open-weight models (Llama, Mistral, Phi, Gemma, and more) locally ' +
        'on your own hardware with no internet dependency. Supports both text completion and chat ' +
        'completion modes. Requires a running Ollama instance accessible at the configured endpoint.',
      endpoint: 'http://localhost:11434',
      credentials: { provider: 'client' }, // local — no server env var needed
      // Ollama runs locally with no API key, so it skips the credential handshake:
      // the route resolves its endpoint from this config, avoiding the session round-trip.
      authentication: 'none',
      tags: ['Recommended'],
      provider: 'Ollama',
      settings: {
        configurable: true,
        supported_modes: ['chat_completion'],
        prompt: {
          template:
            '[INST]\n${CONTEXT}\n${SYSTEM_INST}\n${INPUT}\n[/INST]\nanswer:',
          input: '${SPEAKER}: ${TEXT}\n',
          context: '[DOCUMENT]\n${TEXT}\n[END]\n',
          system_instruction:
            'You are an AI Assistant, tasked with providing responses that are well-grounded in the provided documents. Given one or more documents and a user query, generate a response to the query. If no answer can be found in the documents, say, "I do not have specific information".',
        },
        feedback: { enabled: false },
        parameters: {
          min_new_tokens: 1,
          max_new_tokens: 512,
        },
      },
    },
    {
      disabled: false,
      name: 'WatsonX.AI',
      description:
        'IBM watsonx.ai provides access to a curated set of foundation models for text generation, ' +
        'summarization, and retrieval-augmented generation. Hosted on IBM Cloud.',
      endpoint: 'https://us-south.ml.cloud.ibm.com',
      credentials: {
        provider: 'server',
        env_api_key: 'WATSONX_API_KEY',
        env_project_id: 'WATSONX_PROJECT_ID',
      },
      tags: ['IBM Cloud'],
      provider: 'IBM',
      settings: {
        configurable: true,
        supported_modes: ['chat_completion', 'completion'],
        prompt: {
          template:
            '[INST]\n${CONTEXT}\n${SYSTEM_INST}\n${INPUT}\n[/INST]\nanswer:',
          input: '${SPEAKER}: ${TEXT}\n',
          context: '[DOCUMENT]\n${TEXT}\n[END]\n',
          system_instruction:
            'You are an AI Assistant, tasked with providing responses that are well-grounded in the provided documents. Given one or more documents and a user query, generate a response to the query. If no answer can be found in the documents, say, "I do not have specific information".',
        },
        feedback: { enabled: false },
        models: {
          regex: 'granite-4-h-small|llama-4-maverick|mistral-medium-2505',
        },
        parameters: {
          min_new_tokens: 1,
          max_new_tokens: 512,
          repetition_penalty: 1.05,
          stop_sequences: ['<|endoftext|>'],
        },
      },
    },
    {
      disabled: false,
      name: 'OpenAI',
      description:
        'OpenAI provides access to GPT-5 and other frontier language models via the OpenAI API. ' +
        'Supports both text completion and chat completion modes.',
      endpoint: 'https://api.openai.com/v1',
      credentials: {
        provider: 'server',
        env_api_key: 'OPENAI_API_KEY',
      },
      tags: ['Third Party'],
      provider: 'OpenAI',
      settings: {
        configurable: true,
        supported_modes: ['completion', 'chat_completion'],
        prompt: {
          template:
            '[INST]\n${CONTEXT}\n${SYSTEM_INST}\n${INPUT}\n[/INST]\nanswer:',
          input: '${SPEAKER}: ${TEXT}\n',
          context: '[DOCUMENT]\n${TEXT}\n[END]\n',
          system_instruction:
            'You are an AI Assistant, tasked with providing responses that are well-grounded in the provided documents. Given one or more documents and a user query, generate a response to the query. If no answer can be found in the documents, say, "I do not have specific information".',
        },
        feedback: { enabled: false },
        parameters: {
          min_new_tokens: 1,
          max_new_tokens: 512,
          repetition_penalty: 1.05,
          stop_sequences: ['<|endoftext|>'],
        },
      },
    },
    {
      disabled: false,
      name: 'Anthropic',
      description:
        'Anthropic Claude is a family of safety-focused large language models built by Anthropic. ' +
        'Claude excels at nuanced instruction following, long-context reasoning, and document-grounded ' +
        'question answering. Supported via the Anthropic Messages API (chat completion only).',
      endpoint: 'https://api.anthropic.com',
      credentials: {
        provider: 'server',
        env_api_key: 'ANTHROPIC_API_KEY',
      },
      tags: ['Third Party'],
      provider: 'Anthropic',
      settings: {
        configurable: true,
        supported_modes: ['chat_completion'],
        prompt: {
          template: '',
          input: '${SPEAKER}: ${TEXT}\n',
          context: '[DOCUMENT]\n${TEXT}\n[END]\n',
          system_instruction:
            'You are an AI Assistant, tasked with providing responses that are well-grounded in the provided documents. Given one or more documents and a user query, generate a response to the query. If no answer can be found in the documents, say, "I do not have specific information".',
        },
        feedback: { enabled: false },
        parameters: {
          max_new_tokens: 1024,
        },
      },
    },
    {
      disabled: true,
      name: 'Gemini',
      description:
        'Google Gemini is a multimodal model family from Google DeepMind, optimised for complex ' +
        'reasoning, coding, and retrieval-augmented generation tasks. Supported via the Google ' +
        'Generative Language API (chat completion only).',
      endpoint: 'https://generativelanguage.googleapis.com',
      credentials: {
        provider: 'server',
        env_api_key: 'GEMINI_API_KEY',
      },
      tags: ['Third Party', 'Coming Soon'],
      provider: 'Google',
      settings: {
        configurable: true,
        supported_modes: ['chat_completion'],
        prompt: {
          template: '',
          input: '${SPEAKER}: ${TEXT}\n',
          context: '[DOCUMENT]\n${TEXT}\n[END]\n',
          system_instruction:
            'You are an AI Assistant, tasked with providing responses that are well-grounded in the provided documents. Given one or more documents and a user query, generate a response to the query. If no answer can be found in the documents, say, "I do not have specific information".',
        },
        feedback: { enabled: false },
        parameters: {
          max_new_tokens: 512,
        },
      },
    },
  ],
  plugins: [
    {
      name: 'enrichments',
      settings: {
        values: {
          answerability: ['ANSWERABLE', 'PARTIAL', 'UNANSWERABLE'],
          'Question Type': [
            'Factoid',
            'How-To',
            'Explanation',
            'Summarization',
            'Troubleshooting',
            'Comparative',
            'Composite',
            'Opinion',
            'Keyword',
            'Non-Question',
            'Conversational',
          ],
          'Multi-Turn': ['Clarification', 'Correction', 'Follow-up'],
          'Standalone Type': ['Standalone', 'Non-standalone'],
          'Ambiguity Type': [
            'Needs Context from Chatbot Response',
            'Needs Context from Prior Question',
            'Coreference',
            'Ellipsis',
            'Other',
          ],
        },
      },
    },
  ],
};

export default config;

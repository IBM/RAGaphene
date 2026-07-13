/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { createContext, useState, useContext, useEffect } from 'react';
import { SystemConfiguration } from '@/types/custom';
import { useNotification } from '@/src/components/notification/Notification';

// ===================================================================================
//                               CONSTANTS
// ===================================================================================
const ConfigurationContext = createContext<{
  configuration: SystemConfiguration;
  setConfiguration: (configuration: SystemConfiguration) => void;
}>({
  configuration: {
    authenticator: { enabled: true, provider: 'credentials' },
    retrievers: [
      {
        disabled: false,
        name: 'ElasticSearch',
        description:
          'Elasticsearch enables semantic retrieval over your indexed documents using sparse or dense vector search. Retrieves documents based on contextual meaning and user intent rather than exact keyword matches.',
        credentials: { provider: 'client' },
        settings: {
          configurable: true,
          feedback: { enabled: true },
          max_count: 3,
          max_utterances: -1,
          query_syntax: '{"query": {"match": {"text": {"query": "${QUERY}"}}}}',
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
        name: 'WatsonX.AI',
        description:
          'IBM watsonx as a Service is where you work with, deploy, and govern foundation and machine learning models with watsonx.ai and watsonx.governance.',
        endpoint: 'https://us-south.ml.cloud.ibm.com',
        credentials: { provider: 'client' },
        tags: ['Recommended'],
        settings: {
          configurable: true,
          prompt: {
            template:
              '[INST]\n\${CONTEXT}\n\${SYSTEM_INST}\n\${INPUT}\n[/INST]\nanswer:',
            input: '\${SPEAKER}: \${TEXT}\n',
            context: '[DOCUMENT]\n\${TEXT}\n[END]\n',
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
        name: 'OpenAI',
        description: 'The OpenAI connector',
        endpoint: 'https://api.openai.com/v1',
        credentials: { provider: 'client' },
        tags: ['Third Party'],
        settings: {
          configurable: true,
          prompt: {
            template:
              '[INST]\n\${CONTEXT}\n\${SYSTEM_INST}\n\${INPUT}\n[/INST]\nanswer:',
            input: '\${SPEAKER}: \${TEXT}\n',
            context: '[DOCUMENT]\n\${TEXT}\n[END]\n',
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
    ],
  },
  setConfiguration(configuration) {},
});

// ===================================================================================
//                               MAIN FUNCTIONS
// ===================================================================================
export function ConfigurationProvider({ children }: { children: any }) {
  // Step 1: Define state variables
  const [configuration, setConfiguration] = useState<SystemConfiguration>({
    authenticator: { enabled: true, provider: 'credentials' },
    retrievers: [
      {
        disabled: false,
        name: 'ElasticSearch',
        description:
          'Elasticsearch enables semantic retrieval over your indexed documents using sparse or dense vector search. Retrieves documents based on contextual meaning and user intent rather than exact keyword matches.',
        credentials: { provider: 'client' },
        settings: {
          configurable: true,
          feedback: { enabled: true },
          max_count: 3,
          max_utterances: -1,
          query_syntax: '{"query": {"match": {"text": {"query": "${QUERY}"}}}}',
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
        name: 'WatsonX.AI',
        description:
          'IBM watsonx as a Service is where you work with, deploy, and govern foundation and machine learning models with watsonx.ai and watsonx.governance.',
        endpoint: 'https://us-south.ml.cloud.ibm.com',
        credentials: { provider: 'client' },
        tags: ['Recommended'],
        settings: {
          configurable: true,
          prompt: {
            template:
              '[INST]\n\${CONTEXT}\n\${SYSTEM_INST}\n\${INPUT}\n[/INST]\nanswer:',
            input: '\${SPEAKER}: \${TEXT}\n',
            context: '[DOCUMENT]\n\${TEXT}\n[END]\n',
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
        name: 'OpenAI',
        description: 'The OpenAI connector',
        endpoint: 'https://api.openai.com/v1',
        credentials: { provider: 'client' },
        tags: ['Third Party'],
        settings: {
          configurable: true,
          prompt: {
            template:
              '[INST]\n\${CONTEXT}\n\${SYSTEM_INST}\n\${INPUT}\n[/INST]\nanswer:',
            input: '\${SPEAKER}: \${TEXT}\n',
            context: '[DOCUMENT]\n\${TEXT}\n[END]\n',
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
    ],
  });

  // Step 2: Initialize notification provider
  const { createNotification } = useNotification();

  // Step 3: Update state's configuration value
  useEffect(() => {
    async function fetch_configuration() {
      await fetch('/api/configuration').then(async (response) => {
        // Step 3.a: If successful
        if (response.status === 200) {
          const configuration = await response.json();
          //@ts-ignore
          setConfiguration(configuration);
        } else {
          createNotification({
            title: 'Failed to configure',
            subtitle: 'Please contact system adminstrator',
            kind: 'error',
            timeout: 10000,
          });
        }
      });
    }

    fetch_configuration();
  }, []);

  // Step 4: Define update function
  const set = (configuration: SystemConfiguration) => {
    setConfiguration(configuration);
  };

  return (
    <ConfigurationContext.Provider
      value={{
        configuration: configuration,
        setConfiguration: set,
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
}

export function useConfiguration() {
  return useContext(ConfigurationContext);
}

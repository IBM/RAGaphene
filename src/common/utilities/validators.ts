/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty, has, countBy } from 'lodash';

import {
  Conversation,
  Message,
  ValidationError,
  RetrieverConfig,
  GeneratorConfig,
} from '@/types/custom';

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================

const isAnswerable = (userMessage) => {
  return (
    userMessage.speaker === 'user' &&
    has(userMessage, ['enrichments', 'answerability']) &&
    userMessage.enrichments.answerability.includes('ANSWERABLE')
  );
};

const isPartiallyAnswerable = (userMessage) => {
  return (
    userMessage.speaker === 'user' &&
    has(userMessage, ['enrichments', 'answerability']) &&
    userMessage.enrichments.answerability.includes('PARTIAL')
  );
};

const isUnanswerable = (userMessage) => {
  return (
    userMessage.speaker === 'user' &&
    has(userMessage, ['enrichments', 'answerability']) &&
    userMessage.enrichments.answerability.includes('UNANSWERABLE')
  );
};

// Given an agent message, return the number of contexts the user has marked as relevant
const countRelevantContexts = (agentMessage) => {
  if (agentMessage.speaker === 'agent' && has(agentMessage, ['contexts'])) {
    let yesCounts = 0;
    agentMessage.contexts.forEach((context, contextIdx) => {
      // Count how many no's and yes's. The returned object e.g. {"no": 0, "yes": 1}
      // @ts-ignore
      const computeFeedbackDistribution = (context) => {
        if (
          has(context, ['feedback']) &&
          context.feedback.hasOwnProperty('relevant')
        ) {
          return countBy(
            Object.values(context.feedback.relevant).map(
              // @ts-ignore
              (entry) => entry['value'],
            ),
          );
        }
        return null;
      };
      const feedbackDistribution = computeFeedbackDistribution(context);
      yesCounts =
        yesCounts +
        (has(feedbackDistribution, ['yes']) ? feedbackDistribution['yes'] : 0);
    });

    return yesCounts;
  }

  return 0;
};

// ===================================================================================
//                               PRIMARY FUNCTIONS
// ===================================================================================

export function computeUniqueRelevantContexts(messages: Message[]) {
  // Given a conversation, return an array of the unique and relevant contexts
  const uniqueRelevantContexts = new Set<string>();
  if (!isEmpty(messages)) {
    messages.forEach((message) => {
      if (
        message.speaker === 'agent' &&
        (message.contexts || !isEmpty(message.contexts))
      ) {
        message.contexts?.forEach((context) => {
          if (context.feedback && context.feedback.hasOwnProperty('relevant')) {
            // Step : Calculate feedback distribution
            const majorityFeedback = Object.keys(
              countBy(
                Object.values(context.feedback.relevant).map(
                  (entry) => entry['value'],
                ),
              ),
            )[0];

            if (majorityFeedback === 'yes') {
              uniqueRelevantContexts.add(context.document_id);
            }
          }
        });
      }
    });
  }
  return uniqueRelevantContexts;
}

export function findUnverifiedContexts(messages: Message[]) {
  //Missing passage relevance: If at least one passage misses the relevance annotation, provide hint
  let unverifiedPassages: number[][] = [];
  if (!isEmpty(messages)) {
    messages.forEach((message, messageIdx) => {
      if (
        message.speaker === 'agent' &&
        message.contexts &&
        !isEmpty(message.contexts)
      ) {
        message.contexts.forEach((context, contextIdx) => {
          if (
            context.feedback === undefined ||
            !context.feedback.hasOwnProperty('relevant')
          ) {
            unverifiedPassages.push([messageIdx, contextIdx]);
          }
        });
      }
    });
  }
  return unverifiedPassages;
}

// Validate whether an imported conversation object (by an imported json file from the user) is indeed a valid conversation
export function validateConversation(
  conversation: Conversation,
  isValidateRetriever: boolean = false,
): {
  valid: boolean;
  errors?: ValidationError[];
} {
  const errors: ValidationError[] = [];
  // Step : Verify 'messages' exits
  if (!conversation.hasOwnProperty('messages')) {
    errors.push({
      kind: `Missing mandatory 'messages' field in the conversation.`,
      data: conversation,
      recommendation:
        'Please add missing field or remove the conversation from the list to review.',
    });
  }
  // Step : Verify each message in 'messages' field
  conversation.messages.forEach((message, messageIdx) => {
    // Step : Verify text field
    if (!message.hasOwnProperty('text')) {
      errors.push({
        kind: `Missing mandatory 'text' field in ${messageIdx}th message of conversation.`,
        data: message,
        recommendation:
          'Please add missing field or remove the conversation from the list to review.',
      });
    }
    if (isEmpty(message.text)) {
      errors.push({
        kind: `Mandatory 'text' field is empty in ${messageIdx}th message of conversation.`,
        data: message,
        recommendation:
          'Please add missing field value or remove the conversation from the list to review.',
      });
    }

    // Step : Verify speaker field
    if (!message.hasOwnProperty('speaker')) {
      errors.push({
        kind: `Missing mandatory 'speaker' field in ${messageIdx}th message of conversation.`,
        data: message,
        recommendation:
          'Please add missing field or remove the conversation from the list to review.',
      });
    }

    if (isEmpty(message.speaker)) {
      errors.push({
        kind: `Mandatory 'speaker' field is empty in ${messageIdx}th message of conversation.`,
        data: message,
        recommendation:
          'Please add missing field value or remove the conversation from the list to review.',
      });
    }

    if (message.speaker !== 'user' && message.speaker !== 'agent') {
      errors.push({
        kind: `Invalid 'speaker' (${message.speaker}) in ${messageIdx}th message of conversation.`,
        data: message,
        recommendation:
          'Please use "user" or "agent" value for the speaker or remove the conversation from the list to review.',
      });
    }

    // Step : Verify agent message
    if (message.speaker === 'agent') {
      if (!message.hasOwnProperty('contexts')) {
        errors.push({
          kind: `Missing mandatory 'contexts' field for agent turn in ${messageIdx}th message of conversation.`,
          data: message,
          recommendation:
            'Please add missing field or remove the conversation from the list to review.',
        });
      }
      if (isEmpty(message.contexts)) {
        errors.push({
          kind: `Mandatory 'contexts' field is empty for agent turn in ${messageIdx}th message of conversation.`,
          data: message,
          recommendation:
            'Please add missing field value or remove the conversation from the list to review.',
        });
      }
    }
  });

  if (isValidateRetriever) {
    // Step 3: Verify each conversation has 'retriever' with collection details
    if (
      !conversation.hasOwnProperty('retriever') ||
      conversation.retriever === undefined ||
      conversation.retriever.collection === undefined ||
      conversation.retriever.collection.name === undefined
    ) {
      errors.push({
        kind: `Missing mandatory 'retriever.collection.name' field in the conversation.`,
        data: conversation,
        recommendation:
          'Please add missing field or remove the conversation from the list to review.',
      });
    }
  }

  return { valid: isEmpty(errors), errors: errors };
}

export function validateConversationDiversity(
  messages: Message[],
): ValidationError | null {
  // Diversity threshold
  // Number of unique context should be greater than ((number of question - 1) X 2) - 1
  if (!isEmpty(messages)) {
    const uniqueRelevantContexts = computeUniqueRelevantContexts(messages);
    const threshold = Math.max((messages.length / 2 - 1) * 2 - 1, 0);
    if (uniqueRelevantContexts.size < threshold) {
      return {
        kind: `Conversation does not seem to be diverse.`,
        data: uniqueRelevantContexts,
        recommendation: `There ${uniqueRelevantContexts.size === 1 ? 'is' : 'are'} ${uniqueRelevantContexts.size} unique relevant passage${uniqueRelevantContexts.size === 1 ? '' : 's'} for ${messages.length / 2} question${messages.length / 2 > 1 ? 's' : ''}. Your conversation MAY NOT be diverse. Consider adjusting the conversation to add at least ${threshold - uniqueRelevantContexts.size} more relevant passage${threshold - uniqueRelevantContexts.size > 1 ? 's' : ''}.`,
      };
    }
  }

  return null;
}

// Ensure contexts in the conversation were annotated for relevancy by the user
export function validateContextsRelevancy(
  messages: Message[],
): ValidationError | null {
  // Step 1: Find all unverified contexts
  const unverifiedContexts = findUnverifiedContexts(messages);

  // Step 2: If unverified contexts found
  if (!isEmpty(unverifiedContexts)) {
    const messageIndexsWithUnverifiedContexts = Array.from(
      new Set(unverifiedContexts.map(([messageIdx]) => messageIdx)),
    );
    return {
      kind: `Unverified documents found.`,
      data: unverifiedContexts,
      recommendation: `Please ensure that all passages are checked for relevance. We found unverified passages for ${messageIndexsWithUnverifiedContexts.length} responses.`,
    };
  }

  return null;
}

//Given a conversation, for every pair of query and answer, validate the query's answerability and the context's relevance
export function validateAnswerabilityAndRelevancy(
  messages: Message[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  //Relationship between query answerability and context relevance:
  //  If question is tagged as answerable or partially answerable and no passage is marked as relevant, provide hint
  //  If question is tagged as unanswerable and a passage is marked as relevant, provide hint
  let needRelevancyMarked: number[] = []; // An array of message indices in need of relevancy marked
  let unanswerableAndRelevancyMarked: number[] = []; // An array of agent message indices where a passage was marked as relevant when the question is unanswerable

  const isCurrentTurn = (messageIndex) => {
    //return true if the messageIndex is in the current turn (we consider the current turn to be the last two messages in a conversation)
    return messageIndex >= messages.length - 2;
  };

  // Iterate through pairs of the message (one user and one for the following agent response):
  for (let i = 0; i + 1 < messages.length; i = i + 2) {
    const user = messages[i].speaker === 'user' ? messages[i] : null;
    const agent = messages[i + 1].speaker === 'agent' ? messages[i + 1] : null;
    if (user != null && agent != null) {
      const relevantContextsCount = countRelevantContexts(agent);
      if (
        (isAnswerable(user) || isPartiallyAnswerable(user)) &&
        relevantContextsCount === 0 &&
        !isCurrentTurn(i) &&
        !isCurrentTurn(i + 1)
      ) {
        // we only do this check for all messages BUT the last two messages (since we don't want to bombard the user with these messages when they are still reviewing the last two messages which we consider as the current turn)
        // The question was tagged as answerable or partially answerable and no passage is marked as relevant
        needRelevancyMarked.push(i + 1);
      }

      if (isUnanswerable(user) && relevantContextsCount > 0) {
        // The question was tagged as unanswerable but a passage was marked as relevant...
        unanswerableAndRelevancyMarked.push(i + 1);
      }
    }
  }

  if (needRelevancyMarked.length > 0) {
    errors.push({
      kind: `Need at least one passage marked as relevant.`,
      data: needRelevancyMarked,
      recommendation: `A question was tagged as answerable or partially answerable, but no passage was marked as relevant.`,
    });
  }

  if (unanswerableAndRelevancyMarked.length > 0) {
    errors.push({
      kind: `Need to re-review passages marked as relevant.`,
      data: unanswerableAndRelevancyMarked,
      recommendation: `A question was tagged as unanswerable but one or more passages were marked as relevant.`,
    });
  }

  return errors;
}

// ===================================================================================
//                               PRIMARY FUNCTIONS (SETTINGS)
// ===================================================================================
export function validateSettings(settings: {
  retrievers?: RetrieverConfig[];
  generators?: GeneratorConfig[];
}): {
  valid: boolean;
  errors?: ValidationError[];
} {
  const errors: ValidationError[] = [];

  // Step 1: Validate retrievers, if provided
  if (settings.retrievers) {
    settings.retrievers.forEach((retriever) => {
      // Step 1.a: Verify requested name
      if (
        retriever.name !== 'ElasticSearch' &&
        retriever.name !== 'MongoDB' &&
        retriever.name !== 'Cloudant'
      ) {
        errors.push({
          kind: `Invalid value(${retriever.name}) for 'name' field in the retriever settings.`,
          data: retriever,
          recommendation:
            'Please set the "name" value to "ElasticSearch", "MongoDB" or "Cloudant".',
        });
      }

      // Step 1.b: Verify "settings.max_count" is provided
      if (
        retriever.settings.max_count === undefined ||
        retriever.settings.max_count === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.max_count' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.c: Verify "settings.max_utterances" is provided
      if (
        retriever.settings.max_utterances === undefined ||
        retriever.settings.max_utterances === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.max_utterances' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.d: Verify "settings.query_syntax" is provided
      if (
        retriever.settings.query_syntax === undefined ||
        retriever.settings.query_syntax === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.query_syntax' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.e: Verify "settings.templates" is provided
      if (
        retriever.settings.templates === undefined ||
        retriever.settings.templates === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.templates' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.f: Verify "settings.templates.projection" is provided
      if (
        retriever.settings.templates.projection === undefined ||
        retriever.settings.templates.projection === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.templates.projection' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.g: Verify "settings.templates.display" is provided
      if (
        retriever.settings.templates.display === undefined ||
        retriever.settings.templates.display === null
      ) {
        errors.push({
          kind: `Missing mandatory 'retriever.settings.templates.display' field in the retriever.`,
          data: retriever,
          recommendation: 'Please set missing field.',
        });
      }
    });
  }

  // Step 1: Validate generators, if provided
  if (settings.generators) {
    settings.generators.forEach((generator) => {
      // Step 1.a: Verify requested connector
      const SUPPORTED_GENERATOR_NAMES = [
        'WatsonX.AI',
        'OpenAI',
        'Anthropic',
        'Gemini',
        'Ollama',
      ];
      if (!SUPPORTED_GENERATOR_NAMES.includes(generator.name)) {
        errors.push({
          kind: `Invalid value(${generator.name}) for 'name' field in the generator settings.`,
          data: generator,
          recommendation: `Please set the "name" value to one of: ${SUPPORTED_GENERATOR_NAMES.join(', ')}.`,
        });
      }

      // Determine if this connector supports completion mode.
      // A connector supports completion if supported_modes includes 'completion',
      // OR if supported_modes is not set (legacy: rely on use_chat_completion flag).
      const supportsCompletionMode = generator.settings.supported_modes
        ? generator.settings.supported_modes.includes('completion')
        : !generator.settings.use_chat_completion;

      // Step 1.c: Verify "settings.prompt" is provided (only needed for completion mode)
      if (
        supportsCompletionMode &&
        (generator.settings.prompt === undefined ||
          generator.settings.prompt === null)
      ) {
        errors.push({
          kind: `Missing mandatory 'generator.settings.prompt' field in the generator.`,
          data: generator,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.d: Verify "settings.prompt.template" is provided
      if (
        supportsCompletionMode &&
        (generator.settings.prompt.template === undefined ||
          generator.settings.prompt.template === null)
      ) {
        errors.push({
          kind: `Missing mandatory 'generator.settings.prompt.template' field in the generator.`,
          data: generator,
          recommendation: 'Please set missing field.',
        });
      }

      // Step 1.e: Verify "settings.prompt.input" is provided
      if (
        supportsCompletionMode &&
        (generator.settings.prompt.input === undefined ||
          generator.settings.prompt.input === null)
      ) {
        errors.push({
          kind: `Missing mandatory 'generator.settings.prompt.input' field in the generator.`,
          data: generator,
          recommendation: 'Please set missing field.',
        });
      }
    });
  }

  return { valid: isEmpty(errors), errors: errors };
}

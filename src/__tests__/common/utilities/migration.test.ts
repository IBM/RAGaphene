/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CURRENT_SCHEMA_VERSION,
  migrateConversation,
} from '@/src/common/utilities/migration';

// ===================================================================================
//                              FIXTURES
// ===================================================================================

// V1: ELSER connector, parameters on retriever, prompt+parameters on generator, connector.provider present
const V1_ELSER_CONVERSATION = {
  author: 'test-user',
  retriever: {
    collection: { name: 'my-index' },
    parameters: {
      max_count: 3,
      max_utterances: -1,
      query_syntax: '{"query":{"match_all":{}}}',
      project: '{"text":"text","title":"title","url":"url"}',
    },
    connector: { name: 'ELSER' },
  },
  generator: {
    id: 'mistralai/mixtral-8x7b-instruct-v01',
    name: 'mixtral-8x7b-instruct-v01',
    prompt: {
      template: '[INST]\n${CONTEXT}\n${INPUT}\n[/INST]\nanswer:',
      input: '${SPEAKER}: ${TEXT}\n',
      context: '[DOCUMENT]\n${TEXT}\n[END]\n',
      system_instruction: 'You are a helpful assistant.',
    },
    parameters: { min_new_tokens: 1, max_new_tokens: 512 },
    connector: { name: 'WatsonX.AI', provider: 'IBM' },
  },
  messages: [],
  status: 'created',
};

// V1 with status 'accepted' — should become 'reviewed' after migration
const V1_ACCEPTED_CONVERSATION = {
  author: 'test-user',
  messages: [],
  status: 'accepted',
  status_history: [{ author: 'alice', status: 'accepted', timestamp: 1000 }],
};

// V1 with status 'rejected'
const V1_REJECTED_CONVERSATION = {
  author: 'test-user',
  messages: [],
  status: 'rejected',
  status_history: [{ author: 'bob', status: 'rejected', timestamp: 2000 }],
};

// V2: fully migrated shape
const V2_CONVERSATION = {
  schema_version: 2,
  author: 'test-user',
  retriever: {
    collection: { name: 'my-index' },
    settings: {
      max_count: 3,
      max_utterances: -1,
      query_syntax: { query: { match_all: {} } },
      templates: { projection: '${text}', display: '${text}' },
    },
    connector: { name: 'ElasticSearch' },
  },
  generator: {
    id: 'mistralai/mixtral-8x7b-instruct-v01',
    name: 'mixtral-8x7b-instruct-v01',
    mode: 'completion',
    settings: {
      prompt: {
        template: '[INST]\n${CONTEXT}\n${INPUT}\n[/INST]\nanswer:',
        input: '${SPEAKER}: ${TEXT}\n',
        context: '[DOCUMENT]\n${TEXT}\n[END]\n',
        system_instruction: 'You are a helpful assistant.',
      },
      parameters: { min_new_tokens: 1, max_new_tokens: 512 },
    },
    connector: { name: 'WatsonX.AI' },
  },
  messages: [],
  status: 'reviewed',
};

// V1 with non-ELSER connector, no project/query_syntax fields
const V1_NON_ELSER_CONVERSATION = {
  author: 'test-user',
  retriever: {
    collection: { name: 'my-index' },
    parameters: { max_count: 3, max_utterances: -1 },
    connector: { name: 'ElasticSearch' },
  },
  messages: [],
  status: 'created',
};

// ===================================================================================
//                              CONSTANT
// ===================================================================================

describe('CURRENT_SCHEMA_VERSION', () => {
  it('is 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});

// ===================================================================================
//                              migrateConversation()
// ===================================================================================

describe('migrateConversation()', () => {
  // --- Retriever migration ---

  it('migrates a v1 ELSER file: renames connector, lifts parameters→settings, stamps schema_version: 2', () => {
    const { conversation, migrated } = migrateConversation(
      V1_ELSER_CONVERSATION,
    );

    expect(migrated).toBe(true);
    expect(conversation.schema_version).toBe(2);
    expect(conversation.retriever?.connector?.name).toBe('ElasticSearch');
    expect(conversation.retriever?.settings).toBeDefined();
    expect(conversation.retriever?.parameters).toBeUndefined();
  });

  it('parses query_syntax from JSON string → object during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.retriever?.settings?.query_syntax).toEqual({
      query: { match_all: {} },
    });
  });

  it('converts "project" field map to templates.projection + templates.display', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.retriever?.settings?.templates).toEqual({
      projection: '${text}',
      display: '${text}',
    });
    expect(conversation.retriever?.settings?.project).toBeUndefined();
  });

  it('migrates v1 with no project field: defaults templates to ${text}', () => {
    const { conversation } = migrateConversation(V1_NON_ELSER_CONVERSATION);

    expect(conversation.retriever?.settings?.templates).toEqual({
      projection: '${text}',
      display: '${text}',
    });
  });

  // --- Generator migration ---

  it('lifts generator.prompt + generator.parameters under generator.settings', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.generator.settings).toBeDefined();
    expect(conversation.generator.settings.prompt).toEqual(
      V1_ELSER_CONVERSATION.generator.prompt,
    );
    expect(conversation.generator.settings.parameters).toEqual(
      V1_ELSER_CONVERSATION.generator.parameters,
    );
    expect(conversation.generator.prompt).toBeUndefined();
    expect(conversation.generator.parameters).toBeUndefined();
  });

  it('preserves generator.name as model display name (not connector name)', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.generator.name).toBe('mixtral-8x7b-instruct-v01');
  });

  it('preserves generator.id and generator.connector.name', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.generator.id).toBe(
      'mistralai/mixtral-8x7b-instruct-v01',
    );
    expect(conversation.generator.connector.name).toBe('WatsonX.AI');
  });

  it('drops generator.connector.provider during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.generator.connector.provider).toBeUndefined();
  });

  it('defaults generator.mode to completion during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.generator.mode).toBe('completion');
  });

  // --- Status migration ---

  it('converts status "accepted" → "reviewed" during v1→v2 migration', () => {
    const { conversation, migrated } = migrateConversation(
      V1_ACCEPTED_CONVERSATION,
    );

    expect(migrated).toBe(true);
    expect(conversation.schema_version).toBe(2);
    expect(conversation.status).toBe('reviewed');
  });

  it('converts status "rejected" → "reviewed" during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_REJECTED_CONVERSATION);

    expect(conversation.status).toBe('reviewed');
  });

  it('preserves status "created" unchanged during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_NON_ELSER_CONVERSATION);

    expect(conversation.status).toBe('created');
  });

  it('preserves status_history entries (accepted/rejected) verbatim during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_ACCEPTED_CONVERSATION);

    expect(conversation.status_history).toEqual([
      { author: 'alice', status: 'accepted', timestamp: 1000 },
    ]);
  });

  // --- General ---

  it('does not modify messages or author during v1→v2 migration', () => {
    const { conversation } = migrateConversation(V1_ELSER_CONVERSATION);

    expect(conversation.messages).toEqual([]);
    expect(conversation.author).toBe('test-user');
  });

  it('does not mutate the original input object', () => {
    const original = JSON.parse(JSON.stringify(V1_ELSER_CONVERSATION));
    migrateConversation(V1_ELSER_CONVERSATION);

    expect(V1_ELSER_CONVERSATION).toEqual(original);
  });

  it('returns migrated: false for a v2 file and leaves it unchanged', () => {
    const { conversation, migrated } = migrateConversation(V2_CONVERSATION);

    expect(migrated).toBe(false);
    expect(conversation).toBe(V2_CONVERSATION); // same reference — no clone
    expect(conversation.schema_version).toBe(2);
  });

  it('treats a file with no schema_version field as v1', () => {
    const { conversation, migrated } = migrateConversation(
      V1_NON_ELSER_CONVERSATION,
    );

    expect(migrated).toBe(true);
    expect(conversation.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('passes through an unknown future version unchanged with migrated: false', () => {
    const futureConversation = { ...V2_CONVERSATION, schema_version: 99 };
    const { conversation, migrated } = migrateConversation(futureConversation);

    expect(migrated).toBe(false);
    expect(conversation).toBe(futureConversation);
    expect(conversation.schema_version).toBe(99);
  });

  it('handles a conversation with no retriever gracefully', () => {
    const noRetriever = {
      author: 'test-user',
      messages: [],
      status: 'created',
    };
    const { conversation, migrated } = migrateConversation(noRetriever);

    expect(migrated).toBe(true);
    expect(conversation.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(conversation.retriever).toBeUndefined();
  });

  it('handles a conversation with no generator gracefully', () => {
    const noGenerator = {
      author: 'test-user',
      messages: [],
      status: 'created',
    };
    const { conversation, migrated } = migrateConversation(noGenerator);

    expect(migrated).toBe(true);
    expect(conversation.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(conversation.generator).toBeUndefined();
  });

  // --- editor/reviewer strip + edit history synthesis ---

  it('strips top-level editor field and does not duplicate an existing edited entry', () => {
    // status_history already has an 'edited' entry for alice — no synthesis needed
    const v1WithEditor = {
      author: 'test-user',
      messages: [],
      status: 'edited',
      editor: 'alice',
      status_history: [{ author: 'alice', status: 'edited', timestamp: 1000 }],
    };
    const { conversation } = migrateConversation(v1WithEditor);

    expect(conversation.editor).toBeUndefined();
    expect(conversation.status_history).toEqual([
      { author: 'alice', status: 'edited', timestamp: 1000 },
    ]);
  });

  it('synthesises an edited entry backdated 1 day before the earliest review when editor is present but no edited entry exists', () => {
    const reviewTimestamp = 10000;
    const v1EditorNoHistory = {
      author: 'test-user',
      messages: [],
      status: 'accepted',
      editor: 'alice',
      reviewer: 'bob',
      status_history: [
        { author: 'bob', status: 'accepted', timestamp: reviewTimestamp },
      ],
    };
    const { conversation } = migrateConversation(v1EditorNoHistory);

    expect(conversation.editor).toBeUndefined();
    // edited entry should be prepended before the review entry
    expect(conversation.status_history[0]).toEqual({
      author: 'alice',
      status: 'edited',
      timestamp: reviewTimestamp - 86400,
    });
    expect(conversation.status_history[1]).toEqual({
      author: 'bob',
      status: 'accepted',
      timestamp: reviewTimestamp,
    });
  });

  it('uses the earliest review timestamp as the anchor when multiple review entries exist', () => {
    const earlierReview = 5000;
    const laterReview = 10000;
    const v1MultiReview = {
      author: 'test-user',
      messages: [],
      status: 'accepted',
      editor: 'alice',
      status_history: [
        { author: 'bob', status: 'accepted', timestamp: laterReview },
        { author: 'carol', status: 'rejected', timestamp: earlierReview },
      ],
    };
    const { conversation } = migrateConversation(v1MultiReview);

    expect(conversation.status_history[0]).toEqual({
      author: 'alice',
      status: 'edited',
      timestamp: earlierReview - 86400,
    });
  });

  it('synthesises an edited entry backdated 1 day from now when editor is present but status_history has no review entries', () => {
    const before = Math.floor(Date.now() / 1000) - 86400;
    const v1EditorOnly = {
      author: 'test-user',
      messages: [],
      status: 'edited',
      editor: 'carol',
    };
    const { conversation } = migrateConversation(v1EditorOnly);
    const after = Math.floor(Date.now() / 1000) - 86400;

    expect(conversation.editor).toBeUndefined();
    expect(conversation.status_history).toHaveLength(1);
    expect(conversation.status_history[0].author).toBe('carol');
    expect(conversation.status_history[0].status).toBe('edited');
    expect(conversation.status_history[0].timestamp).toBeGreaterThanOrEqual(
      before,
    );
    expect(conversation.status_history[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('strips top-level reviewer field and preserves status_history entries verbatim', () => {
    const v1WithReviewer = {
      author: 'test-user',
      messages: [],
      status: 'accepted',
      reviewer: 'bob',
      status_history: [{ author: 'bob', status: 'accepted', timestamp: 2000 }],
    };
    const { conversation } = migrateConversation(v1WithReviewer);

    expect(conversation.reviewer).toBeUndefined();
    expect(conversation.status).toBe('reviewed');
    expect(conversation.status_history).toEqual([
      { author: 'bob', status: 'accepted', timestamp: 2000 },
    ]);
  });

  it('strips editor and reviewer even when status_history is absent', () => {
    const v1Legacy = {
      author: 'test-user',
      messages: [],
      editor: 'carol',
      reviewer: 'dave',
    };
    const { conversation } = migrateConversation(v1Legacy);

    expect(conversation.editor).toBeUndefined();
    expect(conversation.reviewer).toBeUndefined();
  });

  it('leaves editor/reviewer absent when they were never set', () => {
    const { conversation } = migrateConversation(V1_NON_ELSER_CONVERSATION);

    expect(conversation.editor).toBeUndefined();
    expect(conversation.reviewer).toBeUndefined();
  });
});

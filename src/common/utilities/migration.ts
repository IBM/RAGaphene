/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// Schema version release history
// Freeze a migration once its target version ships to production.
// Until released, you may fold additional changes into the pending migration.
// | Version | Released   | Notes                                                        |
// |---------|------------|--------------------------------------------------------------|
// | 1       | 2025-01-xx | Initial schema                                               |
// | 2       | (pending)  | parameters→settings, templates, status enum, strip editor/  |
// |         |            | reviewer top-level fields                                    |
export const CURRENT_SCHEMA_VERSION = 2;

// ===================================================================================
//                              MIGRATION FUNCTIONS
// ===================================================================================

function migrateV1toV2(conv: Record<string, any>): Record<string, any> {
  const result = JSON.parse(JSON.stringify(conv));

  // Rename ELSER → ElasticSearch
  if (result.retriever?.connector?.name === 'ELSER') {
    result.retriever.connector.name = 'ElasticSearch';
  }

  // Migrate retriever.parameters → retriever.settings
  if (result.retriever?.parameters !== undefined) {
    const params = result.retriever.parameters;

    // Parse query_syntax from JSON string → object (v1 stored it as a string)
    if (typeof params.query_syntax === 'string') {
      try {
        params.query_syntax = JSON.parse(params.query_syntax);
      } catch {
        // leave as-is if unparseable
      }
    }

    // Convert "project" field-map JSON string → templates.projection + templates.display
    // V1 "project" was a JSON string like {"text":"text","title":"title","url":"url"}.
    // V2 templates are template strings; default to ${text} for both.
    const projectStr: string | undefined = params.project;
    delete params.project;

    let projectionTemplate = '${text}';
    if (projectStr) {
      try {
        const projectObj: Record<string, string> = JSON.parse(projectStr);
        const textField =
          Object.entries(projectObj).find(([, v]) => v === 'text')?.[0] ??
          'text';
        projectionTemplate = `\${${textField}}`;
      } catch {
        // keep default ${text}
      }
    }

    params.templates = {
      projection: projectionTemplate,
      display: projectionTemplate,
    };

    result.retriever.settings = params;
    delete result.retriever.parameters;
  }

  // Migrate generator: lift prompt + parameters under settings; default mode to completion
  if (result.generator !== undefined) {
    const { prompt, parameters, ...rest } = result.generator;
    result.generator = {
      ...rest,
      mode: 'completion',
      ...(prompt !== undefined || parameters !== undefined
        ? {
            settings: {
              ...(prompt && { prompt }),
              ...(parameters && { parameters }),
            },
          }
        : {}),
    };

    // Drop connector.provider — v2 does not use it
    if (result.generator.connector?.provider !== undefined) {
      delete result.generator.connector.provider;
    }
  }

  // Convert status 'accepted' | 'rejected' → 'reviewed'
  // The full opinion record is preserved in status_history entries (unchanged).
  if (result.status === 'accepted' || result.status === 'rejected') {
    result.status = 'reviewed';
  }

  // Synthesise a missing status_history entry for the top-level editor field.
  // V1 data recorded edits only as conversation.editor (last-write-wins string).
  // V2 records them as status_history entries. If no 'edited' entry exists for
  // this author yet, prepend one backdated to 1 day before the earliest review
  // entry (or, if there are no review entries, 1 day before now).
  if (result.editor) {
    const hasEditEntry = (result.status_history ?? []).some(
      (e: Record<string, any>) =>
        e.author === result.editor && e.status === 'edited',
    );
    if (!hasEditEntry) {
      const reviewEntries: Record<string, any>[] = (
        result.status_history ?? []
      ).filter(
        (e: Record<string, any>) =>
          e.status === 'accepted' || e.status === 'rejected',
      );
      const anchorTimestamp: number =
        reviewEntries.length > 0
          ? Math.min(...reviewEntries.map((e) => e.timestamp))
          : Math.floor(Date.now() / 1000);
      const editTimestamp = anchorTimestamp - 86400; // 1 day before anchor

      const editEntry = {
        author: result.editor,
        status: 'edited',
        timestamp: editTimestamp,
      };

      // Prepend so the timeline reads: edit → review(s)
      result.status_history = [editEntry, ...(result.status_history ?? [])];
    }
  }

  // Strip top-level editor/reviewer — redundant last-write-wins caches.
  // All authorship information is now captured in status_history entries.
  delete result.editor;
  delete result.reviewer;

  result.schema_version = 2;
  return result;
}

// [fromVersion, toVersion, transformFn]
const MIGRATIONS: [
  number,
  number,
  (conv: Record<string, any>) => Record<string, any>,
][] = [[1, 2, migrateV1toV2]];

// ===================================================================================
//                              EXPORTED FUNCTION
// ===================================================================================

export function migrateConversation(raw: Record<string, any>): {
  conversation: Record<string, any>;
  migrated: boolean;
} {
  const version: number = raw.schema_version ?? 1;

  // If already at or beyond current version, pass through unchanged
  if (version >= CURRENT_SCHEMA_VERSION) {
    return { conversation: raw, migrated: false };
  }

  let conversation = raw;
  let migrated = false;

  for (const [from, , transform] of MIGRATIONS) {
    const currentVersion: number = conversation.schema_version ?? 1;
    if (currentVersion === from) {
      conversation = transform(conversation);
      migrated = true;
    }
  }

  return { conversation, migrated };
}

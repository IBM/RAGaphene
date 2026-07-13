/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { Notification, ActiveRetriever, Document } from '@/types/custom';
import { escape } from '@/src/common/utilities/string';

export async function retrieve(
  retriever: ActiveRetriever,
  queryText: string,
  max_count?: number,
): Promise<[Document[], Notification[]]> {
  // Step 1: Initialize necessary variables
  const notifications: Notification[] = [];
  let documents: Document[] = [];

  // Step 2: Formulate query
  const querySyntaxStr =
    typeof retriever.settings.query_syntax === 'string'
      ? retriever.settings.query_syntax
      : JSON.stringify(retriever.settings.query_syntax);
  const query = JSON.parse(
    querySyntaxStr.replaceAll('${QUERY}', escape(queryText)),
  );

  // Step 2.b: Store credentials in session if client-managed (secure HTTP-only cookies)
  if (retriever.connector.credentials.provider === 'client') {
    const { storeConnectorCredentials } = await import('./credentials');
    await storeConnectorCredentials(
      {
        [retriever.connector.name]: {
          endpoint: retriever.connector.endpoint,
          credentials: retriever.connector.credentials,
        },
      },
      undefined,
    );
  }

  // Step 2.c: Run retriever query (credentials now in secure session, not header)
  await fetch(`/api/queries`, {
    method: 'POST',
    body: JSON.stringify({
      query: query,
      collection: retriever.collection.name,
      max_count:
        max_count !== undefined ? max_count : retriever.settings.max_count,
      projection_template: retriever.settings.templates.projection,
      display_template: retriever.settings.templates.display,
      connector_name: retriever.connector.name,
      provider: retriever.connector.credentials.provider,
    }),
    headers: {
      'Content-Type': 'application/json',
      // No Authorization header - credentials in secure session
    },
    signal: AbortSignal.timeout(30000),
  }).then(async (response) => {
    const hits = await response.json();
    if (response.status === 200 && Array.isArray(hits)) {
      documents = hits;
    } else {
      notifications.push({
        title: response.statusText,
        subtitle: 'Current and future responses may be impacted.',
        kind: 'warning',
        timeout: 8000,
      });
    }
  });

  return [documents, notifications];
}

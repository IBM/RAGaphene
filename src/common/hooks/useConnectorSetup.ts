/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useEffect } from 'react';

import {
  ActiveGenerator,
  ActiveRetriever,
  Collection,
  SelectedConnectors,
} from '@/types/custom';
import { useNotification } from '@/src/components/notification/Notification';

// --- Types ---

interface ConnectorSetupResult {
  loading: boolean;
  collections: Collection[];
  retriever: ActiveRetriever | undefined;
  // Exposed so the conversation-restore path in Create.tsx can seed these
  // without re-running the fetch lifecycle.
  setRetriever: (r: ActiveRetriever | undefined) => void;
  generators: ActiveGenerator[];
  setGenerators: (g: ActiveGenerator[]) => void;
  // Triggers a forced cache-bypass re-fetch. Increments refreshSeq, which
  // is in the useEffect dep array — safe to call at any time.
  triggerRefresh: () => void;
}

// --- Hook ---

/**
 * Fetches collections then models sequentially for a fresh conversation setup.
 *
 * `active` must be true for the hook to run — callers pass `!configuring && !conversation`
 * so the hook is a no-op while the user is still on the Configure screen or when
 * continuing an existing conversation (which has its own restore path).
 *
 * `triggerRefresh` in the returned object lets callers force a cache-bypass
 * re-fetch without navigating away (e.g. the Renew button in the side panel).
 */
export function useConnectorSetup(
  application: SelectedConnectors | undefined,
  active: boolean,
): ConnectorSetupResult {
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [retriever, setRetriever] = useState<ActiveRetriever | undefined>(
    undefined,
  );
  const [generators, setGenerators] = useState<ActiveGenerator[]>([]);
  // Incrementing this counter re-fires the effect. When > 0, force=true is
  // appended to both fetch URLs so the server bypasses its TTL cache.
  const [refreshSeq, setRefreshSeq] = useState(0);

  const { createNotification } = useNotification();

  useEffect(() => {
    if (!active || !application) return;

    // Capture in a local const so TypeScript narrows the type inside `setup`.
    const app = application;
    const forceParam = refreshSeq > 0 ? '&force=true' : '';

    // AbortController lets us cancel in-flight requests if the effect re-fires
    // (e.g. user presses Back and reconfigures before both fetches complete).
    const controller = new AbortController();

    async function setup() {
      setLoading(true);

      try {
        // --- Collections fetch ---

        if (app.retriever.credentials.provider === 'client') {
          const { storeConnectorCredentials } =
            await import('@/src/common/utilities/credentials');
          await storeConnectorCredentials(
            {
              [app.retriever.name]: {
                endpoint: app.retriever.endpoint,
                credentials: app.retriever.credentials,
              },
            },
            undefined,
          );
        }

        const collectionParams = new URLSearchParams({
          connector_name: app.retriever.name,
          provider: app.retriever.credentials.provider,
          ...(app.retriever.settings?.collections?.regex && {
            name: app.retriever.settings.collections.regex,
          }),
        });

        const collectionRes = await fetch(
          `/api/collections?${collectionParams.toString()}${forceParam}`,
          { signal: controller.signal },
        );

        if (!collectionRes.ok) {
          createNotification({
            title: 'Retriever',
            subtitle: collectionRes.statusText,
            kind: 'error',
          });
          return;
        }

        const fetchedCollections: Collection[] = await collectionRes.json();

        if (fetchedCollections.length === 0) {
          createNotification({
            title: 'Failed to initialize retriever',
            subtitle:
              'No matching collections found for the configured retriever.',
            kind: 'error',
          });
          return;
        }

        setCollections(fetchedCollections);
        setRetriever({
          collection: fetchedCollections[0],
          settings: { ...app.retriever.settings },
          connector: app.retriever,
        });

        // --- Models fetch (sequential — only runs after collections succeed) ---

        if (app.generator.credentials.provider === 'client') {
          const { storeConnectorCredentials } =
            await import('@/src/common/utilities/credentials');
          await storeConnectorCredentials(undefined, {
            [app.generator.name]: {
              endpoint: app.generator.endpoint,
              api_key: app.generator.credentials.api_key,
              project_id: app.generator.credentials.project_id,
            },
          });
        }

        const modelParams = new URLSearchParams({
          connector_name: app.generator.name,
          provider: app.generator.credentials.provider,
          ...(app.generator.settings?.models?.regex && {
            name: app.generator.settings.models.regex,
          }),
        });

        const modelsRes = await fetch(
          `/api/models?${modelParams.toString()}${forceParam}`,
          { signal: controller.signal },
        );

        if (!modelsRes.ok) {
          createNotification({
            title: 'Generator',
            subtitle: modelsRes.statusText,
            kind: 'error',
          });
          return;
        }

        const models = await modelsRes.json();

        if (models.length === 0) {
          createNotification({
            title: 'Failed to initialize generator',
            subtitle: 'No matching models found for the configured generator.',
            kind: 'error',
          });
          return;
        }

        // Prefer supported_modes array; fall back to legacy use_chat_completion boolean.
        const supportedModes = app.generator.settings.supported_modes;
        const initialMode: 'completion' | 'chat_completion' = supportedModes
          ? supportedModes.includes('completion')
            ? 'completion'
            : 'chat_completion'
          : app.generator.settings.use_chat_completion
            ? 'chat_completion'
            : 'completion';

        const builtGenerators: ActiveGenerator[] = models.map((model) => ({
          ...model,
          mode: initialMode,
          settings: {
            prompt: app.generator.settings.prompt,
            parameters: app.generator.settings.parameters,
          },
          connector: app.generator,
        }));

        setGenerators(builtGenerators);
      } catch (err) {
        // AbortError is expected when the effect cleans up — not a real error.
        if (err instanceof Error && err.name !== 'AbortError') {
          createNotification({
            title: 'Setup failed',
            subtitle: err.message,
            kind: 'error',
          });
        }
      } finally {
        setLoading(false);
      }
    }

    setup();
    return () => controller.abort();
  }, [application, active, refreshSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerRefresh = () => setRefreshSeq((n) => n + 1);

  return {
    loading,
    collections,
    retriever,
    setRetriever,
    generators,
    setGenerators,
    triggerRefresh,
  };
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

import {
  ActiveGenerator,
  Message,
  SelectedConnectors,
  Conversation,
} from '@/types/custom';
import { useConfiguration } from '@/src/common/state/configuration';
import { useConnectorSetup } from '@/src/common/hooks';
import SplitViewer from '@/src/components/split-viewer/SplitViewer';
import Login from '@/src/components/login/Login';
import SidePanel from '@/src/components/side-panel/SidePanel';
import Configure from '@/src/views/create/Configure';
import CustomRAGConversationPanel from '@/src/components/creator/CustomRAG';

import classes from './Create.module.scss';

// --- Main component ---

export default function Create() {
  const [application, setApplication] = useState<
    SelectedConnectors | undefined
  >(undefined);
  const [configuring, setConfiguring] = useState<boolean>(true);
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedGenerator, setSelectedGenerator] = useState<
    ActiveGenerator | undefined
  >(undefined);

  const { data: session } = useSession();
  const { configuration } = useConfiguration();

  // Reset to the Configure screen whenever the system configuration changes
  // (e.g. an admin hot-swaps the config module without restarting the server).
  useEffect(() => {
    setConfiguring(true);
  }, [configuration]);

  // Fetches collections then models sequentially for new-conversation setup.
  // Inactive when the user is still on the Configure screen (`configuring`) or
  // when continuing an existing conversation (`conversation` defined) — the
  // restore effect below handles the continue path.
  const {
    loading,
    collections,
    retriever,
    setRetriever,
    generators,
    setGenerators,
    triggerRefresh,
  } = useConnectorSetup(application, !configuring && !conversation);

  // Select the first generator once the hook populates the list for a new conversation.
  // The hook owns `generators` state but `selectedGenerator` lives here, so this
  // bridges the gap. The `conversation` guard prevents overwriting the restore path.
  useEffect(() => {
    if (!conversation && generators.length > 0 && !selectedGenerator) {
      setSelectedGenerator(generators[0]);
    }
  }, [generators]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the user continues an existing conversation, seed retriever, generators,
  // and messages from the saved snapshot rather than fetching fresh from the APIs.
  // `application` is included in deps even though it is always set before
  // `conversation` — omitting it would make the closure stale.
  useEffect(() => {
    if (application && conversation) {
      setRetriever({
        collection: conversation.retriever?.collection ?? { name: '' },
        settings: {
          ...application.retriever.settings,
          ...(conversation.retriever?.settings.max_utterances && {
            max_utterances: conversation.retriever.settings.max_utterances,
          }),
          ...(conversation.retriever?.settings.max_count && {
            max_count: conversation.retriever.settings.max_count,
          }),
          ...(conversation.retriever?.settings.query_syntax && {
            query_syntax: conversation.retriever.settings.query_syntax,
          }),
        },
        connector: application.retriever,
      });

      const generator = {
        ...conversation.generator,
        settings: conversation.generator?.settings,
        connector: application.generator,
      };
      // @ts-ignore
      setGenerators([generator]);
      // @ts-ignore
      setSelectedGenerator(generator);

      setMessages(conversation.messages);
    }
  }, [application, conversation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (configuration.authenticator.enabled && !session) {
    return <Login />;
  } else if (
    configuration.retrievers &&
    configuration.generators &&
    configuring
  ) {
    return (
      <Configure
        systemConfiguration={configuration}
        onProceed={(application, conversation?: Conversation) => {
          setApplication(application);
          setConfiguring(false);

          if (conversation) {
            setConversation(conversation);
          }
        }}
      />
    );
  } else {
    return (
      <>
        {application ? (
          <SplitViewer>
            <CustomRAGConversationPanel
              user={
                session
                  ? session.user
                  : { username: 'System', firstName: 'System' }
              }
              messages={messages}
              setMessages={setMessages}
              retriever={retriever}
              generator={selectedGenerator}
              plugins={configuration.plugins}
              store={configuration.store}
              className={classes.conversationPanel}
            />
            <SidePanel
              loading={loading}
              collections={collections}
              retriever={retriever}
              onUpdateRetriever={(updatedRetriever) => {
                setRetriever(updatedRetriever);
              }}
              onRefresh={triggerRefresh}
              generators={generators}
              selectedGenerator={selectedGenerator}
              onGeneratorSelect={(generatorId) => {
                const generator = generators.find(
                  (entry) => entry.id === generatorId,
                );
                if (generator) {
                  setSelectedGenerator({
                    ...generator,
                    settings: selectedGenerator?.settings ?? generator.settings,
                  });
                }
              }}
              onUpdateGenerator={(generator) => {
                if (selectedGenerator) {
                  setSelectedGenerator({
                    ...selectedGenerator,
                    ...generator,
                  });
                }
              }}
              defaultParameters={{
                retriever: {
                  ...application.retriever.settings,
                },
                generator: {
                  prompt: application.generator.settings.prompt,
                  parameters: application.generator.settings.parameters,
                },
              }}
              messages={messages}
              setMessages={setMessages}
              className={classes.experienceSettingsPanel}
            />
          </SplitViewer>
        ) : null}
      </>
    );
  }
}

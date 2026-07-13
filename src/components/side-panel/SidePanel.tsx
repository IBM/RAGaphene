/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import { useEffect, useState } from 'react';
import { Button } from '@carbon/react';
import { SettingsAdjust, SearchAdvanced } from '@carbon/icons-react';

import {
  Collection,
  TextCompletionPromptSettings,
  ChatCompletionPromptSettings,
  TextCompletionParameters,
  ChatCompletionParameters,
  ActiveGenerator,
  ActiveRetriever,
  RetrieverParams,
  Message,
} from '@/types/custom';
import ExperienceSettings from '@/src/components/experience-settings/ExperienceSettings';
import SearchPanel from '@/src/components/search-panel/SearchPanel';
import classes from './SidePanel.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  loading: boolean;
  collections: Collection[];
  retriever: ActiveRetriever | undefined;
  onUpdateRetriever: Function;
  generators: ActiveGenerator[];
  selectedGenerator: ActiveGenerator | undefined;
  onGeneratorSelect: Function;
  onUpdateGenerator: Function;
  defaultParameters: {
    retriever: RetrieverParams;
    generator: {
      prompt: TextCompletionPromptSettings | ChatCompletionPromptSettings;
      parameters?: TextCompletionParameters | ChatCompletionParameters;
    };
  };
  messages: Message[];
  setMessages: Function;
  className?: string;
  disabled?: boolean;
  // Called when the user clicks Renew to force-refresh models and collections.
  onRefresh?: () => void;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function Nav({
  selectedItem,
  onClick,
}: {
  selectedItem: string;
  onClick: Function;
}) {
  return (
    <div className={classes.navigation}>
      <div
        className={cx(
          classes.navigationItem,
          selectedItem === 'search' ? classes.selected : null,
        )}
      >
        <Button
          kind="ghost"
          renderIcon={SearchAdvanced}
          iconDescription="Advanced Search"
          hasIconOnly
          tooltipPosition="bottom"
          tooltipAlignment="start"
          onClick={() => {
            onClick('search');
          }}
        ></Button>
      </div>
      <div
        className={cx(
          classes.navigationItem,
          selectedItem === 'settings' ? classes.selected : null,
        )}
      >
        <Button
          kind="ghost"
          renderIcon={SettingsAdjust}
          iconDescription="Experience Settings"
          hasIconOnly
          tooltipPosition="bottom"
          tooltipAlignment="start"
          onClick={() => {
            onClick('settings');
          }}
        ></Button>
      </div>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function SidePanel({
  loading = false,
  collections,
  retriever,
  onUpdateRetriever,
  generators,
  selectedGenerator,
  onGeneratorSelect,
  onUpdateGenerator,
  defaultParameters,
  messages,
  setMessages,
  className,
  disabled = false,
  onRefresh,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [selectedNavigationItem, setSelectedNavigationItem] =
    useState<string>('settings');

  // Step 2: Run effets
  // Step 2.a: Default to 'search' panel, if conversation has started
  useEffect(() => {
    if (messages.length > 1) {
      setSelectedNavigationItem('search');
    } else {
      setSelectedNavigationItem('settings');
    }
  }, [messages.length]);

  // Step 3: Render
  return (
    <div className={cx(className, classes.panel)}>
      <Nav
        selectedItem={selectedNavigationItem}
        onClick={(item) => {
          setSelectedNavigationItem(item);
        }}
      />
      {selectedNavigationItem === 'settings' ? (
        <ExperienceSettings
          loading={loading}
          collections={collections}
          retriever={retriever}
          onUpdateRetriever={onUpdateRetriever}
          generators={generators}
          selectedGenerator={selectedGenerator}
          onGeneratorSelect={onGeneratorSelect}
          onUpdateGenerator={onUpdateGenerator}
          defaultParameters={defaultParameters}
          disabled={disabled || messages.length > 1}
          onRefresh={onRefresh}
        />
      ) : selectedNavigationItem === 'search' ? (
        <SearchPanel
          retriever={retriever}
          messages={messages}
          setMessages={setMessages}
        />
      ) : null}
    </div>
  );
}

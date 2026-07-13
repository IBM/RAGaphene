/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import {
  IconButton,
  Select,
  SelectItem,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@carbon/react';
import {
  Information,
  IbmWatsonDiscovery,
  Renew,
  WatsonxAi,
} from '@carbon/icons-react';

import {
  Collection,
  TextCompletionPromptSettings,
  ChatCompletionPromptSettings,
  TextCompletionParameters,
  ChatCompletionParameters,
  ActiveGenerator,
  ActiveRetriever,
  RetrieverParams,
} from '@/types/custom';
import GeneratorSettings from '@/src/components/experience-settings/GeneratorSettings';
import RetrieverSettings from '@/src/components/experience-settings/RetrieverSettings';

import classes from './ExperienceSettings.module.scss';

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
  disabled?: boolean;
  // Called when the user clicks Renew to force-refresh models and collections.
  // Shown only after initial setup completes (not loading, generators populated).
  onRefresh?: () => void;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ExperienceSettings({
  loading = false,
  collections,
  retriever,
  onUpdateRetriever,
  generators,
  selectedGenerator,
  onGeneratorSelect,
  onUpdateGenerator,
  defaultParameters,
  disabled = false,
  onRefresh,
}: Props) {
  return (
    <div className={classes.container}>
      {onRefresh && !loading && generators.length > 0 && (
        <div className={classes.refreshRow}>
          <IconButton
            kind="ghost"
            label="Refresh models and collections"
            size="sm"
            onClick={onRefresh}
          >
            <Renew />
          </IconButton>
        </div>
      )}
      <Tabs>
        <TabList aria-label="experience-settings" contained fullWidth>
          {
            //@ts-ignore
            <Tab renderIcon={IbmWatsonDiscovery}>Retriever</Tab>
          }
          {
            //@ts-ignore
            <Tab renderIcon={WatsonxAi}>Generator</Tab>
          }
        </TabList>
        <TabPanels>
          <TabPanel>
            {disabled ? (
              <div className={classes.infoContainer}>
                <Information size={48} />
                <span className={classes.infoText}>
                  Retriever settings are locked once a conversation starts. They
                  can be modified by undoing all turns.
                </span>
              </div>
            ) : (
              <>
                {!isEmpty(collections) ? (
                  <Select
                    id={'collection-selector'}
                    labelText="Choose a collection"
                    onChange={(event) => {
                      const collection = collections.find(
                        (entry) => entry.uuid === event.target.value,
                      );
                      if (collection) {
                        if (retriever) {
                          onUpdateRetriever({
                            ...retriever,
                            collection: collection,
                          });
                        } else {
                          onUpdateRetriever({
                            collection: collection,
                            parameters: defaultParameters.retriever,
                          });
                        }
                      }
                    }}
                    defaultValue={retriever?.collection.uuid}
                  >
                    {collections.map((collection) => {
                      return (
                        <SelectItem
                          key={`${collection.uuid}-selector`}
                          value={collection.uuid}
                          text={collection.name}
                        ></SelectItem>
                      );
                    })}
                  </Select>
                ) : null}
                {retriever !== undefined && retriever.settings ? (
                  <RetrieverSettings
                    loading={loading}
                    retriever={retriever}
                    defaults={defaultParameters.retriever}
                    onChange={(parameters) =>
                      onUpdateRetriever({
                        ...retriever,
                        settings: parameters,
                      })
                    }
                  />
                ) : null}
              </>
            )}
          </TabPanel>
          <TabPanel>
            {disabled ? (
              <div className={classes.infoContainer}>
                <Information size={48} />
                <span className={classes.infoText}>
                  Generator settings are locked once a conversation starts. They
                  can be modified by undoing all turns.
                </span>
              </div>
            ) : (
              <>
                {!isEmpty(generators) ? (
                  <Select
                    id={'generator-selector'}
                    labelText="Choose a model"
                    onChange={(event) => {
                      onGeneratorSelect(event.target.value);
                    }}
                    disabled={disabled}
                    defaultValue={selectedGenerator?.id}
                  >
                    {generators.map((generator) => {
                      return (
                        <SelectItem
                          key={`${generator.id}-selector`}
                          value={generator.id}
                          text={generator.name}
                        ></SelectItem>
                      );
                    })}
                  </Select>
                ) : null}
                {selectedGenerator !== undefined ? (
                  <GeneratorSettings
                    loading={loading}
                    generator={selectedGenerator}
                    defaults={defaultParameters.generator}
                    onChange={onUpdateGenerator}
                  ></GeneratorSettings>
                ) : null}
              </>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

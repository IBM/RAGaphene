/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, Plugin } from '@/types/custom';

export function collectEnrichments(messages: Message[], plugin?: Plugin) {
  // Step 1: Initialize necessary variable
  const colors: string[] = [
    'green',
    'blue',
    'purple',
    'teal',
    'magenta',
    'gray',
  ];
  let colorIndex = 0;
  const collect: { [key: string]: { values: Set<string>; color: string } } = {};

  // Step 2: Read enrichment type and values from plugin
  if (plugin && plugin?.settings && plugin.settings.hasOwnProperty('values')) {
    for (const [enrichmentType, enrichmentValues] of Object.entries(
      plugin.settings['values'],
    )) {
      if (collect.hasOwnProperty(enrichmentType)) {
        //@ts-ignore
        enrichmentValues.forEach((value) =>
          collect[enrichmentType].values.add(value),
        );
      } else {
        collect[enrichmentType] = {
          //@ts-ignore
          values: new Set<string>(enrichmentValues),
          color:
            colorIndex > colors.length - 1 ? 'outline' : colors[colorIndex],
        };
        colorIndex += 1;
      }
    }
  }

  // Step 3: Read enrichment types and values used in messages
  messages.forEach((message) => {
    if (message.enrichments) {
      for (const [enrichmentType, enrichmentValues] of Object.entries(
        message.enrichments,
      )) {
        if (collect.hasOwnProperty(enrichmentType)) {
          enrichmentValues.forEach((value) =>
            collect[enrichmentType].values.add(value),
          );
        } else {
          collect[enrichmentType] = {
            values: new Set<string>(enrichmentValues),
            color:
              colorIndex > colors.length - 1 ? 'outline' : colors[colorIndex],
          };
          colorIndex += 1;
        }
      }
    }
  });

  return collect;
}

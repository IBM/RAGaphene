/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useEffect, useState } from 'react';

import { Select, SelectItem, TextInput, Button } from '@carbon/react';
import { Add } from '@carbon/icons-react';

import { hash } from '@/src/common/utilities/string';

import classes from './AddEnrichment.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  availableEnrichments?: {
    [key: string]: { values: Set<string>; color: string };
  };
  onSubmit: Function;
}

// ===================================================================================
//                                RENDER FUNCTIONS
// ===================================================================================
export default function AddEnrichment({
  availableEnrichments,
  onSubmit,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [selectedEnrichmentType, setSelectedEnrichmentType] =
    useState<string>('Custom');
  const [selectedEnrichmentValue, setSelectedEnrichmentValue] =
    useState<string>('Custom');
  const [enrichmentValue, setEnrichmentValue] = useState<string>('');
  const [enrichmentType, setEnrichmentType] = useState<string>('');

  useEffect(() => {
    setSelectedEnrichmentType(
      availableEnrichments && !isEmpty(availableEnrichments)
        ? Object.keys(availableEnrichments)[0]
        : 'Custom',
    );
  }, [hash(JSON.stringify(availableEnrichments))]);

  useEffect(() => {
    setSelectedEnrichmentValue(
      availableEnrichments &&
        !isEmpty(availableEnrichments) &&
        selectedEnrichmentType !== 'Custom' &&
        availableEnrichments[selectedEnrichmentType].values &&
        !isEmpty(availableEnrichments[selectedEnrichmentType].values)
        ? Array.from(availableEnrichments[selectedEnrichmentType].values)[0]
        : 'Custom',
    );
  }, [hash(JSON.stringify(availableEnrichments)), selectedEnrichmentType]);

  return (
    <div className={classes.enrichmentSpecification}>
      <Select
        id="enrichment-type__selector"
        labelText="Select enrichment type"
        onChange={(event) => {
          setSelectedEnrichmentType(event.target.value);
        }}
      >
        {availableEnrichments && !isEmpty(availableEnrichments)
          ? Object.keys(availableEnrichments).map((entry) => (
              <SelectItem
                key={`enrichment-type__selector--${entry}`}
                value={entry}
                text={entry}
              />
            ))
          : null}
        <hr></hr>
        <SelectItem
          key="enrichment-type__selector--placeholder"
          value="Custom"
          text="Create new type"
        />
      </Select>
      {selectedEnrichmentType === 'Custom' ? (
        <TextInput
          id="enrichment-type__input"
          type="text"
          labelText="Specify enrichment type"
          value={enrichmentType}
          invalid={
            selectedEnrichmentType === 'Custom' && isEmpty(enrichmentType)
          }
          invalidText={'Enrichment type must be specified'}
          onChange={(event) => {
            setEnrichmentType(event.target.value);
          }}
        />
      ) : availableEnrichments &&
        !isEmpty(availableEnrichments) &&
        availableEnrichments[selectedEnrichmentType] &&
        !isEmpty(availableEnrichments[selectedEnrichmentType]) ? (
        <Select
          key={`enrichment-value__selector--${selectedEnrichmentType}`}
          id="enrichment-value__selector"
          labelText="Select enrichment value"
          onChange={(event) => {
            setSelectedEnrichmentValue(event.target.value);
          }}
        >
          {Array.from(availableEnrichments[selectedEnrichmentType].values).map(
            (entry) => (
              <SelectItem
                key={`enrichment-value__selector--${entry}`}
                value={entry}
                text={entry}
              />
            ),
          )}
          <hr></hr>
          <SelectItem
            key="enrichment-value__selector--placeholder"
            value="Custom"
            text="Create new value"
          />
        </Select>
      ) : null}
      {selectedEnrichmentValue === 'Custom' ? (
        <TextInput
          id="enrichment-value__input"
          type="text"
          labelText="Specify enrichment value"
          value={enrichmentValue}
          disabled={
            selectedEnrichmentType === 'Custom' && isEmpty(enrichmentType)
          }
          invalid={isEmpty(enrichmentValue)}
          invalidText={'Enrichment value must be specified'}
          onChange={(event) => {
            setEnrichmentValue(event.target.value);
          }}
        />
      ) : null}
      <Button
        renderIcon={Add}
        iconDescription="Add enrichment"
        hasIconOnly
        onClick={() => {
          // Step 1: Add enrichment
          onSubmit(
            selectedEnrichmentType === 'Custom'
              ? enrichmentType
              : selectedEnrichmentType,
            selectedEnrichmentValue === 'Custom'
              ? enrichmentValue
              : selectedEnrichmentValue,
          );

          // Step 2: Reset enrichment type and enrichment value
          setEnrichmentType('');
          setEnrichmentValue('');
        }}
        disabled={
          (selectedEnrichmentType === 'Custom' &&
            isEmpty(enrichmentType.trim())) ||
          (selectedEnrichmentValue === 'Custom' &&
            isEmpty(enrichmentValue.trim()))
        }
      ></Button>
    </div>
  );
}

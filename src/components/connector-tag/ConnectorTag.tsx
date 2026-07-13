/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Tag } from '@carbon/react';

// --- Types ---

// Carbon's Tag `type` prop union (mirrors the TYPES constant in @carbon/react).
type TagType =
  | 'red'
  | 'magenta'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'gray'
  | 'cool-gray'
  | 'warm-gray'
  | 'high-contrast'
  | 'outline';

interface Props {
  tag: string;
}

// --- Color map ---

// Edit here to change tag colors across all connector/model selector UIs.
const TAG_COLORS: Record<string, TagType> = {
  Recommended: 'green',
  IBM: 'blue',
  'Third Party': 'teal',
  Beta: 'magenta',
  Restricted: 'red',
};

// --- Component ---

export default function ConnectorTag({ tag }: Props) {
  return <Tag type={TAG_COLORS[tag] ?? 'outline'}>{tag}</Tag>;
}

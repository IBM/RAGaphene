/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Button,
  ToastNotification,
  InlineLoading,
  Loading,
} from '@carbon/react';
import { Upload } from '@carbon/icons-react';
import { Collection } from '@/types/custom';
import { IngestResult } from '@/src/common/utilities/localIndex';
import UploadModal from './UploadModal';
import classes from './LocalCollectionsManager.module.scss';

// --- Types ---

interface Props {
  onChange: Function;
}

interface TrimRecord {
  source: string;
  rawChunks: number;
  keptChunks: number;
  percent: number;
}

const MAX_COLS = parseInt(
  process.env.NEXT_PUBLIC_LOCAL_INDEX_MAX_COLLECTIONS ?? '3',
);

// --- Helpers ---

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Component ---

export default function LocalCollectionsManager({ onChange }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [trimWarnings, setTrimWarnings] = useState<TrimRecord[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({
          connector_name: 'Local Documents',
          provider: 'server',
        });
        const res = await fetch(`/api/collections?${params.toString()}`);
        if (res.ok) {
          const data: Collection[] = await res.json();
          setCollections(data);
          onChange(data.length === 0);
        }
      } finally {
        setLoadingCollections(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleIngested(
    collection: Collection,
    trimmed: IngestResult['trimmed'],
    evicted: IngestResult['evicted'],
  ) {
    // Remove the evicted collection from the list if present, then prepend the new one.
    const updated = [
      collection,
      ...collections.filter((c) => c.name !== evicted),
    ];
    setCollections(updated);
    onChange(updated.length === 0);
    setUploadOpen(false);
    if (trimmed.length) setTrimWarnings(trimmed);
  }

  const isStateB = !loadingCollections && collections.length === 0;
  // Oldest collection (last in the sorted list) will be evicted next upload.
  const oldestName =
    collections.length >= MAX_COLS
      ? collections[collections.length - 1].name
      : null;

  if (loadingCollections) {
    return <Loading small withOverlay={false} />;
  }

  return (
    <>
      {trimWarnings.length > 0 ? (
        <ToastNotification
          kind="warning"
          title="Collection created with partial content"
          subtitle={trimWarnings
            .map(
              (t) =>
                `${t.source} — ${t.percent}% indexed (${t.keptChunks} of ${t.rawChunks} chunks)`,
            )
            .join('\n')}
          caption="To index fully, split large documents and re-upload."
          timeout={12000}
          onClose={() => setTrimWarnings([])}
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            zIndex: 9999,
          }}
        />
      ) : null}

      {isStateB ? (
        <div className={classes.emptyState}>
          <p className={classes.collectionsHeader}>No collections yet.</p>
          <Button
            kind="primary"
            renderIcon={Upload}
            onClick={() => setUploadOpen(true)}
          >
            Upload documents
          </Button>
          <p className={classes.emptyHint}>
            Supported formats: .txt &nbsp;&middot;&nbsp; .md
            &nbsp;&middot;&nbsp; .pdf &nbsp;&middot;&nbsp; Max 10 files
          </p>
        </div>
      ) : (
        <>
          <p className={classes.collectionsHeader}>
            Your collections ({collections.length} of {MAX_COLS})
          </p>
          <div className={classes.collectionGrid}>
            {collections.map((col) => (
              <div key={col.uuid} className={classes.collectionCard}>
                <span className={classes.collectionCardName}>{col.name}</span>
                {col.size !== undefined ? (
                  <span className={classes.collectionCardMeta}>
                    {col.size} chunks
                  </span>
                ) : null}
                {col.createdAt ? (
                  <span className={classes.collectionCardMeta}>
                    {formatDate(col.createdAt)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <Button
            kind="secondary"
            renderIcon={Upload}
            onClick={() => setUploadOpen(true)}
            size="sm"
          >
            Upload new collection
          </Button>
        </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onIngested={handleIngested}
        willEvict={oldestName}
      />
    </>
  );
}

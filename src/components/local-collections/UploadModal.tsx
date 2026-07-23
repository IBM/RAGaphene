/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState } from 'react';
import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  InlineLoading,
  InlineNotification,
  FileUploaderDropContainer,
  FileUploaderItem,
} from '@carbon/react';
import { Collection } from '@/types/custom';
import { IngestResult } from '@/src/common/utilities/localIndex';

// --- Types ---

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onIngested: (
    collection: Collection,
    trimmed: IngestResult['trimmed'],
    evicted: IngestResult['evicted'],
    skipped: IngestResult['skipped'],
  ) => void;
  // Name of the oldest collection that will be auto-removed to make room.
  // null when the user is not at the collection limit.
  willEvict: string | null;
}

type FileStatus = 'edit' | 'complete' | 'uploading';

interface FileEntry {
  file: File;
  status: FileStatus;
  errorSubject?: string;
  errorBody?: string;
}

const SUPPORTED = ['.txt', '.md', '.pdf'];

// --- Component ---

export default function UploadModal({
  open,
  onClose,
  onIngested,
  willEvict,
}: UploadModalProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validFiles = files.filter((f) => !f.errorSubject);

  function handleDrop(_event: unknown, addedFiles: { addedFiles: File[] }) {
    const incoming = addedFiles.addedFiles.map((file): FileEntry => {
      const supported = SUPPORTED.some((ext) => file.name.endsWith(ext));
      return {
        file,
        status: 'edit',
        errorSubject: supported ? undefined : 'Unsupported file type',
        errorBody: supported
          ? undefined
          : `${file.name.split('.').pop()} is not supported. Use ${SUPPORTED.join(', ')}.`,
      };
    });
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.file.name !== name));
  }

  async function handleIndex() {
    if (!validFiles.length || indexing) return;
    setIndexing(true);
    setError(null);

    try {
      const formData = new FormData();
      validFiles.forEach(({ file }) => formData.append('files[]', file));

      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? res.statusText);
      }

      const result: IngestResult = await res.json();
      setFiles([]);
      onIngested(
        result.collection,
        result.trimmed,
        result.evicted,
        result.skipped,
      );
    } catch (err: any) {
      setError(err.message ?? 'Indexing failed. Please try again.');
    } finally {
      setIndexing(false);
    }
  }

  function handleClose() {
    if (indexing) return;
    setFiles([]);
    setError(null);
    onClose();
  }

  return (
    <ComposedModal open={open} onClose={handleClose} size="sm">
      <ModalHeader title="Upload documents" />
      <ModalBody>
        {error ? (
          <InlineNotification
            kind="error"
            title="Indexing failed"
            subtitle={error}
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        ) : null}
        <FileUploaderDropContainer
          accept={SUPPORTED}
          labelText="Drop files here or click to browse"
          multiple
          onAddFiles={handleDrop}
          disabled={indexing}
        />
        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: 'var(--cds-text-helper)',
          }}
        >
          Supported: {SUPPORTED.join(' · ')} &middot; Max 10 files
        </p>
        {files.map(({ file, status, errorSubject, errorBody }) => (
          <FileUploaderItem
            key={file.name}
            name={file.name}
            status={status}
            invalid={!!errorSubject}
            errorSubject={errorSubject}
            errorBody={errorBody}
            onDelete={() => removeFile(file.name)}
          />
        ))}
        {willEvict ? (
          <InlineNotification
            kind="warning"
            title={`Collection "${willEvict}" will be removed to make room.`}
            lowContrast
            hideCloseButton
            style={{ marginTop: '1rem' }}
          />
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={handleClose} disabled={indexing}>
          Cancel
        </Button>
        {indexing ? (
          <InlineLoading description="Indexing…" status="active" />
        ) : (
          <Button
            kind="primary"
            onClick={handleIndex}
            disabled={validFiles.length === 0}
          >
            Index documents
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  );
}

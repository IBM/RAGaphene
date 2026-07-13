/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ingest route validation constants.
 * Multipart form data cannot be validated with Zod body schemas;
 * the route validates files directly from formData.
 */

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf'] as const;

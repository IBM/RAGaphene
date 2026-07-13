/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import { ValidationError } from '@/src/app/api/middleware/errorHandler';

// Hosts considered safe to reach when remote overrides are disabled. A no-auth
// connector (e.g. Ollama) is expected to run on the same host as the server, so
// by default only loopback targets are permitted.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Resolves the endpoint a no-auth connector should connect to.
 *
 * No-auth connectors carry no secret, so they never go through the credential
 * handshake. Their endpoint therefore comes either from the server-side system
 * config (the default) or from a client-supplied override.
 *
 * A client override lets an authenticated user make the server issue an outbound
 * request to an arbitrary URL, which is an SSRF primitive. To keep that surface
 * closed for public deployments, overrides are restricted to loopback hosts
 * unless ALLOW_REMOTE_LOCAL_CONNECTOR=true is set (trusted self-hosted install).
 *
 * @param override      Client-supplied endpoint, or undefined.
 * @param configDefault Endpoint from the connector's system config.
 * @returns The endpoint to connect to.
 * @throws ValidationError if the override is malformed or blocked by the SSRF guard.
 */
export function resolveNoAuthEndpoint(
  override: string | undefined,
  configDefault: string | undefined,
): string | undefined {
  if (!override) {
    return configDefault;
  }

  let url: URL;
  try {
    url = new URL(override);
  } catch {
    throw new ValidationError('Invalid endpoint');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Invalid endpoint');
  }

  const allowRemote = process.env.ALLOW_REMOTE_LOCAL_CONNECTOR === 'true';
  if (!allowRemote && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ValidationError(
      'Remote endpoints are not permitted for this connector',
    );
  }

  return override;
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stores connector credentials into the NextAuth JWT session using the
 * session update trigger. Credentials are encrypted in the HTTP-only cookie
 * and are never visible in the browser's network tab or JavaScript context.
 *
 * Callers pass only the credentials they are updating; any existing credentials
 * for other connectors already in the session are preserved via deep merge on
 * the server's jwt callback (trigger='update').
 *
 * @param retrievers  Map of retriever connector name → credential fields
 * @param generators  Map of generator connector name → credential fields
 * @returns true if the session was updated successfully, false otherwise
 */
export async function storeConnectorCredentials(
  retrievers?: Record<string, any>,
  generators?: Record<string, any>,
): Promise<boolean> {
  if (!retrievers && !generators) {
    return false;
  }

  try {
    // Fetch the current session so we can merge new credentials with existing ones.
    // GET /api/auth/session returns the current session object (or {} when unauthenticated).
    const currentResponse = await fetch('/api/auth/session');
    if (!currentResponse.ok) {
      return false;
    }

    const currentSession = await currentResponse.json();
    const existing = currentSession?.connectorCredentials ?? {};

    // Deep-merge new credentials into existing ones so that updating the
    // generator credentials does not wipe out previously stored retriever
    // credentials (and vice-versa).
    const merged = {
      retrievers: {
        ...(existing.retrievers ?? {}),
        ...(retrievers ?? {}),
      },
      generators: {
        ...(existing.generators ?? {}),
        ...(generators ?? {}),
      },
    };

    // PATCH /api/auth/session triggers the NextAuth jwt callback with
    // trigger='update' and session=<body.data>, which persists the merged
    // credentials into the encrypted JWT stored in the HTTP-only cookie.
    const updateResponse = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { connectorCredentials: merged } }),
    });

    return updateResponse.ok;
  } catch {
    return false;
  }
}

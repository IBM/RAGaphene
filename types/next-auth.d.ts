/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { User } from '@/types/custom';

/**
 * ConnectorCredentials interface for storing external service credentials
 * in secure HTTP-only session cookies
 */
interface ConnectorCredentials {
  retrievers?: {
    [connectorName: string]: {
      endpoint?: string;
      username?: string;
      password?: string;
      api_key?: string;
      credentials?: Record<string, any>;
    };
  };
  generators?: {
    [connectorName: string]: {
      endpoint?: string;
      api_key?: string;
      project_id?: string;
    };
  };
}

// Read more at: https://next-auth.js.org/getting-started/typescript#module-augmentation
declare module 'next-auth' {
  interface Session {
    user: User & DefaultSession['user'];
    connectorCredentials?: ConnectorCredentials;
  }
  interface Profile {
    // Standard OIDC claims plus the GitHub-specific fields we read.
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
    given_name?: string;
    login?: string;
    avatar_url?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    user: User;
    connectorCredentials?: ConnectorCredentials;
  }
}

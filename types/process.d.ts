/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

declare namespace NodeJS {
  export interface ProcessEnv {
    NEXTAUTH_URL: string;
    NEXTAUTH_SECRET: string;
    AUTH_PROVIDER: string;
    AUTH_CLIENT_ID: string;
    AUTH_CLIENT_SECRET: string;
  }
}

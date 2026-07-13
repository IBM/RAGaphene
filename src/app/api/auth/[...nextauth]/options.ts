/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextAuthOptions, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getAuthenticator } from '@/src/common/utilities/configuration';

const authenticator = getAuthenticator();
const provider = authenticator?.provider ?? 'credentials';

/**
 * OAuth providers for the configured authenticator.
 *
 * - `github` is the documented example: fixed GitHub OAuth endpoints, only the
 *   client id/secret come from env.
 * - `oauth` is a generic OIDC provider driven entirely by env vars, so any
 *   compliant identity provider can be wired in without code changes. The
 *   issuer's `.well-known/openid-configuration` supplies every endpoint.
 *
 * Both are expressed as next-auth OAuth provider configs rather than the
 * bundled provider modules, so no `next-auth/providers/*` sub-path import is
 * required. `credentials` (the default) registers no OAuth provider.
 */
function oauthProviders() {
  if (provider === 'github') {
    return [
      {
        id: 'github',
        name: 'GitHub',
        type: 'oauth' as const,
        authorization: {
          url: 'https://github.com/login/oauth/authorize',
          params: { scope: 'read:user user:email' },
        },
        token: 'https://github.com/login/oauth/access_token',
        userinfo: 'https://api.github.com/user',
        clientId: process.env.AUTH_CLIENT_ID,
        clientSecret: process.env.AUTH_CLIENT_SECRET,
        profile(profile: Record<string, any>) {
          return {
            id: profile.id?.toString(),
            name: profile.name ?? profile.login,
            email: profile.email,
            image: profile.avatar_url,
          };
        },
      },
    ];
  }

  if (provider === 'oauth') {
    return [
      {
        id: 'oauth',
        name: process.env.AUTH_PROVIDER_NAME ?? 'SSO',
        type: 'oauth' as const,
        // Endpoints are discovered from the issuer's well-known document.
        wellKnown: process.env.AUTH_ISSUER
          ? `${process.env.AUTH_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`
          : process.env.AUTH_WELL_KNOWN,
        clientId: process.env.AUTH_CLIENT_ID,
        clientSecret: process.env.AUTH_CLIENT_SECRET,
        idToken: true,
        // Map the standard OIDC claims onto our user shape.
        profile(profile: Record<string, any>) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      },
    ];
  }

  return [];
}

/**
 * Read a standard OIDC profile into our session user shape. GitHub returns
 * `login`/`avatar_url` instead of the OIDC names, so both are accepted.
 */
function toSessionUser(profile: Profile & Record<string, any>) {
  const email = profile.email ?? undefined;
  const displayName = profile.name ?? profile.login ?? 'User';
  return {
    username: email ?? profile.login ?? profile.sub ?? 'user',
    name: displayName,
    firstName: displayName.split(' ')[0],
    email,
    image: profile.picture ?? profile.avatar_url,
  };
}

/**
 * NextAuth configuration options.
 * Exported from a dedicated module so that route.ts only exports HTTP
 * handlers (GET/POST), satisfying Next.js Route Handler type constraints.
 */
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const expectedUsername = process.env.AUTH_USERNAME;
        const expectedPassword = process.env.AUTH_PASSWORD;

        // Refuse to authenticate when placeholder credentials are not configured.
        // Without this guard, empty env vars would accept empty form input
        // (`'' === ''`), an accidental auth bypass.
        if (!expectedUsername || !expectedPassword) {
          return null;
        }

        if (
          credentials?.username === expectedUsername &&
          credentials?.password === expectedPassword
        ) {
          return {
            id: expectedUsername,
            name: expectedUsername,
            email: `${expectedUsername}@example.com`,
          };
        }
        return null;
      },
    }),
    ...oauthProviders(),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user = token.user;

      if (token.connectorCredentials) {
        session.connectorCredentials = token.connectorCredentials;
      }

      return session;
    },
    async jwt({ token, user, profile, trigger, session }) {
      if (profile) {
        token.user = toSessionUser(profile);
      } else if (user) {
        token.user = {
          username: user.email ?? user.name ?? 'user',
          name: user.name ?? 'User',
          firstName: (user.name ?? 'user').split(' ')[0],
          email: user.email ?? undefined,
        };
      }

      if (trigger === 'update' && session?.connectorCredentials) {
        token.connectorCredentials = session.connectorCredentials;
      }

      return token;
    },
  },
  theme: {
    colorScheme: 'light',
  },
};

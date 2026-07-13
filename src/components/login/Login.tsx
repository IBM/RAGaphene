/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

import {
  Button,
  Form,
  TextInput,
  PasswordInput,
  InlineNotification,
} from '@carbon/react';
import { useConfiguration } from '@/src/common/state/configuration';
import classes from './Login.module.scss';

// --- Helpers ---

// Human-readable label for the OAuth sign-in button.
const OAUTH_LABEL: Record<string, string> = {
  github: 'Continue with GitHub',
  oauth: 'Continue with SSO',
};

// --- Main component ---

export default function Login() {
  const { configuration } = useConfiguration();
  const provider = configuration.authenticator?.provider ?? 'credentials';

  if (provider !== 'credentials') {
    return (
      <div className={classes.page}>
        <h1 className={classes.title}>
          Log in to your <br /> RAGaphene instance
        </h1>
        <Button onClick={() => signIn(provider)}>
          {OAUTH_LABEL[provider] ?? 'Log in'}
        </Button>
      </div>
    );
  }

  return <CredentialsLogin />;
}

function CredentialsLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(false);

    // redirect:false so we can surface an inline error instead of bouncing to
    // NextAuth's default error page.
    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(true);
      setSubmitting(false);
    } else {
      // Reload so the session-gated Home view re-renders as authenticated.
      window.location.reload();
    }
  }

  return (
    <div className={classes.page}>
      <h1 className={classes.title}>
        Log in to your <br /> RAGaphene instance
      </h1>
      <Form onSubmit={handleSubmit} className={classes.form}>
        {error ? (
          <InlineNotification
            kind="error"
            title="Invalid credentials"
            subtitle="Check your username and password and try again."
            lowContrast
            hideCloseButton
          />
        ) : null}
        <TextInput
          id="login-username"
          labelText="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <PasswordInput
          id="login-password"
          labelText="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </Form>
    </div>
  );
}

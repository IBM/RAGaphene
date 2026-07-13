/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { SessionProvider } from 'next-auth/react';
import HeaderView from '@/src/components/header/Header';
import { ThemeProvider } from '@/src/common/state/theme';
import { NotificationProvider } from '@/src/components/notification/Notification';
import { ConfigurationProvider } from '@/src/common/state/configuration';

import '@/src/app/global.scss';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider
          refetchInterval={60 * 60}
          refetchOnWindowFocus={false}
          refetchWhenOffline={false}
        >
          <ThemeProvider>
            <NotificationProvider>
              <ConfigurationProvider>
                <HeaderView />
                <main className="root">{children}</main>
              </ConfigurationProvider>
            </NotificationProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

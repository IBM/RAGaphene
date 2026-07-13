/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from '@carbon/react';
import {
  Home,
  Awake,
  Asleep,
  User,
  Settings as SettingsIcon,
} from '@carbon/icons-react';

import { useTheme } from '@/src/common/state/theme';
import ProfileDropdown from '@/src/components/user-settings/ProfileDropdown';
import Settings from '@/src/components/settings/Settings';
import { useConfiguration } from '@/src/common/state/configuration';

import classes from './Header.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function HeaderView() {
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { theme, set } = useTheme();
  const { configuration } = useConfiguration();
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <>
      <Header aria-label="IBM Research RAGaphene">
        <Link className={classes.homeBtn} href="/">
          <Home height={'16px'} width={'16px'} />
        </Link>
        <HeaderName prefix="IBM Research">RAGaphene</HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={
              theme === 'g10' ? 'Switch to dark mode' : 'Switch to light mode'
            }
            onClick={() => {
              theme === 'g10' ? set('g90') : set('g10');
            }}
          >
            {theme === 'g10' ? <Asleep size={20} /> : <Awake size={20} />}
          </HeaderGlobalAction>
          {session?.user ? (
            <HeaderGlobalAction
              aria-label="Settings"
              className={cx(pathname !== '/' ? classes.disabledActionBtn : '')}
              onClick={() => {
                if (pathname === '/') {
                  setShowSettings(true);
                }
              }}
            >
              <SettingsIcon size={20} />
            </HeaderGlobalAction>
          ) : null}
          {configuration.authenticator.enabled && session?.user && (
            <HeaderGlobalAction
              aria-label="Profile"
              isActive={showProfile}
              onClick={() => {
                setShowProfile((prev) => !prev);
              }}
            >
              <User size={20} />
            </HeaderGlobalAction>
          )}
        </HeaderGlobalBar>
      </Header>
      {configuration.authenticator.enabled && session?.user && showProfile ? (
        <ProfileDropdown
          user={session.user}
          open={showProfile}
          setOpen={setShowProfile}
        />
      ) : null}
      {session?.user && showSettings ? (
        <Settings
          open={showSettings}
          onClose={() => {
            setShowSettings(false);
          }}
        />
      ) : null}
    </>
  );
}

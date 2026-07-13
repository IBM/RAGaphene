/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useRef } from 'react';
import cx from 'classnames';
import { signOut } from 'next-auth/react';
import { useClickAway } from 'react-use';

import { Logout, UserAvatar } from '@carbon/icons-react';

import { User } from '@/types/custom';

import classes from './ProfileDropdown.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
// Derive up to two initials from the user's display name or username as a last resort.
function deriveInitials(user: User): string {
  const source = user.name || user.username || '';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function ProfileDropdown({
  user,
  open = false,
  setOpen,
}: {
  user: User;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const ref = useRef(null);

  useClickAway(ref, () => {
    setOpen(false);
  });

  return (
    <div ref={ref} className={classes.profileDropdown}>
      <div className={cx(classes.popover, open && classes.open)}>
        <div className={classes.userProfile}>
          {user.image ? (
            <div className={classes.userAvatar}>
              <img
                alt="Profile image"
                src={user.image}
                width={44}
                height={44}
              />
            </div>
          ) : (
            <div className={classes.placeholderAvatar}>
              {deriveInitials(user) || (
                <UserAvatar size={24} aria-label="User profile" />
              )}
            </div>
          )}
          <div className={classes.userInfo}>
            <div className={classes.userName} title={user.name ?? undefined}>
              {user.name}
            </div>
            <div className={classes.userEmail} title={user.email ?? undefined}>
              {user.email}
            </div>
          </div>
        </div>
        <ul className={classes.userActions} role={'menu'}>
          <li className={classes.userActionItem}>
            <a
              href={`/api/auth/signout`}
              className={classes.button}
              onClick={(e) => {
                e.preventDefault();
                signOut();
              }}
            >
              Log out
            </a>
            <Logout />
          </li>
        </ul>
      </div>
    </div>
  );
}

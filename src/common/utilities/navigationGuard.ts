/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

const SENTINEL_KEY = '__nav_guard_sentinel__';

/**
 * Intercepts Next.js App Router client-side navigation and browser back/forward
 * when `isDirty` is true.
 *
 * Back/forward strategy:
 *   Push a sentinel history entry tagged with SENTINEL_KEY on mount. When
 *   popstate fires and e.state is NOT the sentinel, the user went back past it.
 *   We re-push the sentinel and show the modal.
 *   On "Leave": go(-2) — undo the re-pushed sentinel + perform the original back.
 *   On "Stay": push sentinel again so the next back press is intercepted too.
 *
 * Known issue:
 *   On a fresh upload (Configure → Reviewer transition), Next.js internally adds
 *   an extra history entry during the route transition, making go(-2) land on
 *   /review instead of the previous page. The back button must be pressed twice
 *   in this flow. Resume session and link-click navigation (home button etc.) are
 *   not affected. TODO: investigate suppressing Next.js's extra pushState during
 *   the Configure → Reviewer transition, or intercept it at the router level.
 *
 * Returns:
 *  - `blockedUrl`  – non-null when the confirmation modal should be shown
 *  - `confirm()`   – allow the navigation
 *  - `cancel()`    – dismiss the modal, stay on page
 */
export function useNavigationGuard(
  isDirty: boolean,
  navigate: (url: string) => void,
) {
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  const isDirtyRef = useRef(isDirty);
  const blockedUrlRef = useRef<string | null>(null);
  const removeBeforeUnloadRef = useRef<(() => void) | null>(null);
  const navigateRef = useRef(navigate);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Register / unregister beforeunload when isDirty changes
  useEffect(() => {
    if (!isDirty) {
      removeBeforeUnloadRef.current?.();
      removeBeforeUnloadRef.current = null;
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    removeBeforeUnloadRef.current = () =>
      window.removeEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      removeBeforeUnloadRef.current = null;
    };
  }, [isDirty]);

  function setBlocked(url: string | null) {
    blockedUrlRef.current = url;
    setBlockedUrl(url);
  }

  function isSentinel(state: unknown): boolean {
    return (
      typeof state === 'object' &&
      state !== null &&
      SENTINEL_KEY in (state as object)
    );
  }

  function pushSentinel() {
    window.history.pushState(
      { ...window.history.state, [SENTINEL_KEY]: true },
      '',
      window.location.pathname,
    );
  }

  useEffect(() => {
    if (!isSentinel(window.history.state)) {
      pushSentinel();
    }

    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return;

      const anchor = (e.target as Element).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('#') ||
        anchor.hasAttribute('download') ||
        anchor.getAttribute('target') === '_blank'
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setBlocked(href);
    };

    const handlePopState = (e: PopStateEvent) => {
      if (isSentinel(e.state)) return;
      if (!isDirtyRef.current) return;
      if (blockedUrlRef.current !== null) return;

      // The user navigated past the sentinel. Push it back so the stack is
      // in a known state: [..., prev, current, sentinel]
      pushSentinel();
      setBlocked('__back__');
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function confirm() {
    const url = blockedUrlRef.current;
    if (!url) return;
    removeBeforeUnloadRef.current?.();
    removeBeforeUnloadRef.current = null;
    setBlocked(null);

    if (url === '__back__') {
      // go(-2): undo the sentinel we re-pushed in handlePopState, then go back
      window.history.go(-2);
    } else {
      navigateRef.current(url);
    }
  }

  function cancel() {
    setBlocked(null);
    // Re-arm: push sentinel so the next back press is intercepted again
    pushSentinel();
  }

  return { blockedUrl, confirm, cancel };
}

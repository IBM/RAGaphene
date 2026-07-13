/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BACK_BUTTON_MESSAGE } from '@/src/common/constants';

export function useWindowResize() {
  // UseEffect for adjusting graph width & height based on window size

  const [WindowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [WindowHeight, setWindowHeight] = useState<number>(
    global?.window && window.innerHeight,
  );

  useEffect(() => {
    // Step 1: Define window resize function
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    // Step 2: Add event listener
    window.addEventListener('resize', handleWindowResize);

    // Step 3: Cleanup to remove event listener
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  return {
    WindowWidth,
    WindowHeight,
  };
}

export function useBackButton(warningMessage?: string) {
  const onBackButtonEvent = (e) => {
    const leaveThisPage = window.confirm(
      warningMessage ? warningMessage : BACK_BUTTON_MESSAGE,
    );
    if (leaveThisPage) {
      // Let user go back
      window.history.back();
    }
  };

  useEffect(() => {
    //@ts-ignore
    window.history.pushState(null, null, window.location.pathname); // Prevent going back
    window.addEventListener('popstate', onBackButtonEvent);

    return () => {
      window.removeEventListener('popstate', onBackButtonEvent);
    };
  }, []);

  return {};
}

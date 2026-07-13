/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import React, { PropsWithChildren } from 'react';
import Split from 'react-split';

import { useTheme } from '@/src/common/state/theme';

import classes from './SplitViewer.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function SplitViewer({ children }: PropsWithChildren) {
  // Step 1: Run effects
  const { theme } = useTheme();

  // Step 2: Render
  return (
    <Split
      className={classes.page}
      sizes={[70, 30]}
      direction="horizontal"
      gutterStyle={() => {
        return {
          backgroundColor: theme,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '50%',
          width: '10px',
          cursor: 'col-resize',
          backgroundImage:
            "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAeCAYAAADkftS9AAAAIklEQVQoU2M4c+bMfxAGAgYYmwGrIIiDjrELjpo5aiZeMwF+yNnOs5KSvgAAAABJRU5ErkJggg==')",
        };
      }}
    >
      {children}
    </Split>
  );
}

/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import cx from 'classnames';
import { User } from '@carbon/icons-react';

import classes from './Avatar.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  isAgent?: boolean;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function AgentImage() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.1174 13.8765L2.87476 18.1191L13.8773 29.1217L18.12 24.8791L7.1174 13.8765Z"
        fill="url(#paint0_linear_3389_313614)"
      />
      <path
        d="M18.1174 2.87845L13.8748 7.12109L24.8773 18.1237L29.12 13.881L18.1174 2.87845Z"
        fill="url(#paint1_linear_3389_313614)"
      />
      <path
        d="M16 30C14.34 30 13 28.66 13 27V5C13 3.34 14.34 2 16 2C17.66 2 19 3.34 19 5V27C19 28.66 17.66 30 16 30Z"
        fill="url(#paint2_linear_3389_313614)"
      />
      <path
        d="M16 8C17.6569 8 19 6.65685 19 5C19 3.34315 17.6569 2 16 2C14.3431 2 13 3.34315 13 5C13 6.65685 14.3431 8 16 8Z"
        fill="#001D6C"
      />
      <path
        d="M16 30C17.6569 30 19 28.6569 19 27C19 25.3431 17.6569 24 16 24C14.3431 24 13 25.3431 13 27C13 28.6569 14.3431 30 16 30Z"
        fill="#001D6C"
      />
      <path
        d="M5 19C6.65685 19 8 17.6569 8 16C8 14.3431 6.65685 13 5 13C3.34315 13 2 14.3431 2 16C2 17.6569 3.34315 19 5 19Z"
        fill="#001D6C"
      />
      <path
        d="M27 19C28.6569 19 30 17.6569 30 16C30 14.3431 28.6569 13 27 13C25.3431 13 24 14.3431 24 16C24 17.6569 25.3431 19 27 19Z"
        fill="#001D6C"
      />
      <defs>
        <linearGradient
          id="paint0_linear_3389_313614"
          x1="4.99683"
          y1="15.996"
          x2="15.9968"
          y2="26.996"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#161616" stopOpacity="0.3" />
          <stop offset="1" stopColor="#161616" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_3389_313614"
          x1="15.9942"
          y1="5.00053"
          x2="26.9942"
          y2="16.0005"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#161616" stopOpacity="0.05" />
          <stop offset="1" stopColor="#161616" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient
          id="paint2_linear_3389_313614"
          x1="16"
          y1="30"
          x2="16"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#43D1CF" />
          <stop offset="1" stopColor="#418BFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Avatar({ isAgent }: Props) {
  return (
    <div className={cx(classes.wrapper, isAgent && classes.isBot)}>
      {isAgent ? <AgentImage /> : <User width="32px" height="32px" />}
    </div>
  );
}

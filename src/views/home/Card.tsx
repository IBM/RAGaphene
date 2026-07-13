/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import cx from 'classnames';
import Link from 'next/link';
import { memo, ReactNode, useId } from 'react';
import { Link as CarbonLink, Tag } from '@carbon/react';
import { ArrowRight, CarbonIconType, Launch } from '@carbon/icons-react';

import classes from './Card.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface Props {
  icon: CarbonIconType;
  title: string;
  href?: string | null;
  actionText?: ReactNode;
  text?: ReactNode;
  content?: ReactNode;
  headingLevel?: HeadingLevel;
  tag?: string | null;
  openInNewTab: boolean;
  disabled?: boolean;
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
function getHeading(level: HeadingLevel) {
  return `h${level}` as const;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
function Card({
  icon: Icon,
  title,
  text,
  href,
  actionText,
  content,
  headingLevel = 2,
  tag,
  openInNewTab,
  disabled,
}: Props) {
  const id = useId();
  const Heading = getHeading(headingLevel);
  return (
    <div className={cx(classes.root, disabled && classes.disabled)}>
      {href && actionText && (
        <CarbonLink
          as={Link}
          href={disabled ? 'javascript:void(0)' : href}
          className={classes.link}
          renderIcon={openInNewTab ? Launch : ArrowRight}
          target={openInNewTab ? '_blank' : undefined}
          disabled={disabled}
        >
          {actionText}
        </CarbonLink>
      )}
      <div className={classes.body}>
        <Icon className={classes.icon} size={24} />
        <Heading className={classes.heading}>
          {title}
          {tag && (
            <Tag as="span" size="sm" id={`${id}-tag`} type="high-contrast">
              {tag}
            </Tag>
          )}
        </Heading>
        {!!text && <p className={classes.text}>{text}</p>}
        {!!content && <div className={classes.content}>{content}</div>}
      </div>
    </div>
  );
}

export default memo(Card);

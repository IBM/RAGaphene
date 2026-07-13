/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { memo } from 'react';
import { Link as CarbonLink } from '@carbon/react';
import {
  ChartMultitype,
  ChatBot,
  TestTool,
  Rag,
  Chemistry,
  Compare,
} from '@carbon/icons-react';

import Login from '@/src/components/login/Login';
import Card from '@/src/views/home/Card';

import classes from './Home.module.scss';

// ===================================================================================
//                                CONSTANTS
// ===================================================================================
const DATA_COMPONENTS = [
  {
    title: 'Create',
    text: 'Create conversations using your RAG setup',
    href: '/data/create',
    actionText: 'Create',
    tag: null,
    icon: ChatBot,
    openInNewTab: false,
  },
  {
    title: 'Review',
    text: 'Review and annotate conversations created from your RAG setup',
    href: '/data/review',
    actionText: 'Review',
    tag: null,
    icon: TestTool,
    openInNewTab: false,
  },
];

const EXPERIMENT_COMPONENTS = [
  {
    title: 'Experiment',
    text: 'Evaluate and compare different RAG configurations on your data',
    href: '/experiment',
    actionText: 'Run',
    tag: 'Beta',
    icon: Compare,
    openInNewTab: false,
    disabled: false,
  },
];

const ANALYSIS_COMPONENTS = [
  {
    title: 'InspectorRAGet',
    text: 'An open-source introspection platform for RAG evaluation with aggregate and instance-level analysis, holistic metrics, and dataset characterization',
    href: 'https://github.com/IBM/InspectorRAGet',
    actionText: 'Go',
    tag: 'Open source',
    icon: ChartMultitype,
    openInNewTab: false,
  },
];

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default memo(function HomePage() {
  // Step 1: Run effects
  // Step 1.a: Get current session
  const { status } = useSession();

  // Step 2: Render
  if (status === 'authenticated') {
    return (
      <div className={classes.root}>
        <div className={classes.leadspaceWrapper}>
          <header className={classes.leadspace}>
            <h1 className={classes.heading}>Welcome to RAGaphene</h1>
            <p>
              A workbench for building, evaluating, and analyzing conversational
              AI datasets powered by Retrieval Augmented Generation (RAG).&nbsp;
              <CarbonLink
                as={Link}
                href="https://github.com/IBM/RAGaphene"
                inline
                target={'_blank'}
              >
                Learn more
              </CarbonLink>
            </p>
          </header>
        </div>
        <div className={classes.stages}>
          <div className={classes.stage}>
            <div className={classes.stageInformation}>
              <Rag size={24} />
              <span className={classes.stageTitle}>Data</span>
              <span className={classes.stageDescription}></span>
            </div>
            {DATA_COMPONENTS.map((component, index) => {
              return (
                <Card key={`stage__Data-${index}`} {...{ ...component }} />
              );
            })}
          </div>
          <div className={classes.stage}>
            <div className={classes.stageInformation}>
              <Chemistry size={24} />
              <span className={classes.stageTitle}>Experiment</span>
              <span className={classes.stageDescription}></span>
            </div>
            {EXPERIMENT_COMPONENTS.map((component, index) => {
              return (
                <Card
                  key={`stage__Experiment-${index}`}
                  {...{ ...component }}
                />
              );
            })}
          </div>
          <div className={classes.stage}>
            <div className={classes.stageInformation}>
              <ChartMultitype size={24} />
              <span className={classes.stageTitle}>Analyze</span>
              <span className={classes.stageDescription}></span>
            </div>
            {ANALYSIS_COMPONENTS.map((component, index) => {
              return (
                <Card key={`stage__Analyze-${index}`} {...{ ...component }} />
              );
            })}
          </div>
        </div>

        <div className={classes.footer}>© IBM Corp. 2023-Present</div>
      </div>
    );
  } else {
    return <Login />;
  }
});

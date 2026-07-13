/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { isEmpty } from 'lodash';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Button } from '@carbon/react';
import { ArrowRight, IbmWatsonDiscovery, WatsonxAi } from '@carbon/icons-react';

import { Pipeline, User, DatasetTask, Metric } from '@/types/custom';
import { useConfiguration } from '@/src/common/state/configuration';

import Login from '@/src/components/login/Login';
import PipelineBuilder from '@/src/components/pipeline-builder/PipelineBuilder';
import DatasetBuilder from '@/src/components/dataset/Dataset';
import MetricsSelector from '@/src/components/metrics/Metrics';
import Runner from '@/src/components/experiment/Runner';

import classes from './Experiment.module.scss';

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function Tutorial({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={classes.tutorialContainer}>
      <div className={classes.experimentTutorial}>
        <h2>Assess your RAG dataset</h2>
        <p>
          A quick way to check whether your dataset presents a meaningful
          challenge to a RAG pipeline before you commit to it.
        </p>
      </div>

      <div className={classes.evaluationCards}>
        <div className={classes.evaluationCard}>
          <div className={classes.evaluationCardHeader}>
            <IbmWatsonDiscovery size={20} />
            <span className={classes.evaluationCardTitle}>Retrieval</span>
          </div>
          <p className={classes.evaluationCardQuestion}>
            Did the retriever find the right documents?
          </p>
          <p className={classes.evaluationCardDetail}>
            Measured against your annotated gold contexts.
          </p>
        </div>
        <div className={classes.evaluationCard}>
          <div className={classes.evaluationCardHeader}>
            <WatsonxAi size={20} />
            <span className={classes.evaluationCardTitle}>Generation</span>
          </div>
          <p className={classes.evaluationCardQuestion}>
            Did the model answer correctly, from the retrieved context, not from
            memory?
          </p>
          <p className={classes.evaluationCardDetail}>
            Measured with NLP metrics and/or LLM-as-judge.
          </p>
        </div>
      </div>

      <div className={classes.beforeYouStart}>
        <p className={classes.beforeYouStartTitle}>Before you start</p>
        <ul className={classes.beforeYouStartList}>
          <li>
            Bring 10 to 30 representative conversations rather than your full
            dataset.
          </li>
          <li>
            Pick the strongest retriever and generator combination available to
            you.
          </li>
          <li>
            Make sure your gold contexts are thoroughly annotated. Recall scores
            are only as good as your annotations.
          </li>
          <li>
            A mix of answerable and unanswerable questions tends to make for a
            more revealing dataset.
          </li>
        </ul>
      </div>

      <div className={classes.navigationButtons}>
        <Button
          renderIcon={ArrowRight}
          iconDescription="Let's Go"
          onClick={onContinue}
        >
          Let's Go
        </Button>
      </div>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Experiment() {
  const [user, setUser] = useState<User>({
    username: 'System',
    firstName: 'System',
  });
  const [stage, setStage] = useState<
    'start' | 'pipelines' | 'metrics' | 'dataset' | 'run'
  >('start');
  const [componentToTest, setComponentToTest] = useState<string>('generator');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [datasetTasks, setDatasetTasks] = useState<DatasetTask[] | undefined>(
    undefined,
  );
  const [metrics, setMetrics] = useState<Metric[]>([
    {
      name: 'char_length',
      author: 'System',
      displayName: 'Length (in characters)',
      kind: 'algorithm',
      type: 'numerical',
      aggregator: 'average',
      range: [0, 1000, 50],
    },
  ]);

  const { data: session } = useSession();
  const { configuration } = useConfiguration();

  useEffect(() => {
    if (session) {
      setUser(session.user);
    }
  }, [session]);

  // Drop pipelines that are incompatible with the newly selected component to test.
  // Functional updater avoids declaring `pipelines` as a dep while still operating
  // on the latest value.
  useEffect(() => {
    setPipelines((prev) =>
      prev.filter((pipeline) =>
        componentToTest === 'both'
          ? pipeline.retriever && pipeline.generator
          : componentToTest === 'retriever'
            ? pipeline.retriever
            : componentToTest === 'generator'
              ? pipeline.generator
              : true,
      ),
    );
  }, [componentToTest]);

  if (configuration.authenticator.enabled && !session) {
    return <Login />;
  } else {
    return (
      <div className={classes.container}>
        {stage === 'start' ? (
          <Tutorial
            onContinue={() => {
              setStage('dataset');
            }}
          />
        ) : stage === 'dataset' ? (
          <DatasetBuilder
            onPrevious={() => {
              setStage('start');
              setDatasetTasks(undefined);
              setPipelines([]);
            }}
            onNext={(tasks: DatasetTask[], componentToTest: string) => {
              setComponentToTest(componentToTest);
              setDatasetTasks(tasks);
              setStage('pipelines');
            }}
            tasks={datasetTasks}
          />
        ) : stage === 'pipelines' ? (
          <PipelineBuilder
            user={user}
            systemConfiguration={configuration}
            componentToTest={componentToTest}
            pipelines={pipelines}
            onUpdate={setPipelines}
            onPrevious={() => {
              setStage('dataset');
            }}
            onNext={
              datasetTasks && !isEmpty(datasetTasks)
                ? () => {
                    setStage('metrics');
                  }
                : undefined
            }
            collectionNames={
              datasetTasks
                ? Array.from(
                    new Set(datasetTasks.map((task) => task.collection)),
                  )
                : undefined
            }
          ></PipelineBuilder>
        ) : stage === 'metrics' ? (
          <MetricsSelector
            systemConfiguration={configuration}
            componentToTest={componentToTest}
            metrics={metrics}
            onUpdate={setMetrics}
            onPrevious={() => {
              setStage('pipelines');
            }}
            onNext={
              datasetTasks && !isEmpty(datasetTasks)
                ? () => {
                    setStage('run');
                  }
                : undefined
            }
          />
        ) : datasetTasks && !isEmpty(pipelines) && !isEmpty(metrics) ? (
          <Runner
            componentToTest={componentToTest}
            tasks={datasetTasks}
            pipelines={pipelines}
            metrics={metrics}
            systemConfiguration={configuration}
            onPrevious={() => {
              setStage('metrics');
            }}
          />
        ) : null}
      </div>
    );
  }
}

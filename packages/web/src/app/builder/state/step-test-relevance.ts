import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowTrigger,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import deepEqual from 'deep-equal';

function comparableForTesting(step: WorkflowAction | WorkflowTrigger): unknown {
  const settings = Object.fromEntries(
    Object.entries(readRecord(step.settings)).filter(
      ([key]) => !SETTINGS_IGNORED_FOR_TESTING.includes(key),
    ),
  );
  return JSON.parse(
    JSON.stringify({
      name: step.name,
      type: step.type,
      displayName: step.displayName,
      skip: 'skip' in step ? step.skip === true : false,
      settings,
    }),
  );
}

function isSameForTesting({
  before,
  after,
}: {
  before: WorkflowAction | WorkflowTrigger;
  after: WorkflowAction | WorkflowTrigger;
}): boolean {
  return deepEqual(comparableForTesting(before), comparableForTesting(after));
}

function signatureOf(step: WorkflowAction | WorkflowTrigger): string {
  return JSON.stringify(sortKeys(comparableForTesting(step)));
}

function keepTestedSteps({
  workflowVersion,
  source,
}: {
  workflowVersion: WorkflowVersion;
  source: Pick<WorkflowVersion, 'trigger'>;
}): WorkflowVersion {
  const sourceSteps = new Map(
    workflowStructureUtil
      .getAllSteps(source.trigger)
      .map((step) => [step.name, step]),
  );
  return workflowStructureUtil.transferWorkflow(workflowVersion, (step) => {
    const sourceStep = sourceSteps.get(step.name);
    if (
      isNil(sourceStep) ||
      !isSameForTesting({ before: sourceStep, after: step })
    ) {
      return step;
    }
    return {
      ...step,
      lastUpdatedDate: sourceStep.lastUpdatedDate,
      settings: {
        ...step.settings,
        sampleData: sourceStep.settings.sampleData,
      },
    };
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNil(value) && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export const stepTestRelevance = {
  isSameForTesting,
  signatureOf,
  keepTestedSteps,
};

export const SETTINGS_IGNORED_FOR_TESTING: string[] = [
  'sampleData',
  'displayNumber',
  'errorHandlingOptions',
  'customLogoUrl',
  'pendingReview',
  'sensitiveOutput',
  'dedupe',
  'concurrency',
];

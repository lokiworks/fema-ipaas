import {
  BranchExecutionType,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowVersion,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { joinEdgeCandidates } from '@/app/builder/step-settings/join-edge-candidates';

const DATE = '2026-05-02T00:00:00.000Z';

function action({
  name,
  nextAction,
}: {
  name: string;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: `Name ${name}`,
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: {},
      propertySettings: {},
    },
    nextAction,
  };
}

function parallel({
  name,
  children,
  nextAction,
}: {
  name: string;
  children: WorkflowAction[];
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.PARALLEL,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: { branches: children.map((_, i) => ({ branchName: `B${i}` })) },
    children,
    nextAction,
  };
}

function router({
  name,
  children,
}: {
  name: string;
  children: WorkflowAction[];
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.ROUTER,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: {
      branches: children.map((_, i) => ({
        branchName: `B${i}`,
        branchType: BranchExecutionType.FALLBACK,
      })),
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
    },
    children,
  };
}

function versionOf(first: WorkflowAction): WorkflowVersion {
  const trigger: WorkflowTrigger = {
    name: 'trigger',
    type: WorkflowTriggerType.EMPTY,
    valid: true,
    displayName: 'Trigger',
    lastUpdatedDate: DATE,
    settings: {},
    nextAction: first,
  };
  return {
    id: 'v1',
    trigger,
    graph: { joinEdges: [] },
  } as unknown as WorkflowVersion;
}

describe('joinEdgeCandidates.listCandidates', () => {
  it('lists nothing for a purely sequential flow', () => {
    const version = versionOf(
      action({
        name: 'a',
        nextAction: action({ name: 'b', nextAction: action({ name: 'c' }) }),
      }),
    );
    expect(
      joinEdgeCandidates.listCandidates({
        workflowVersion: version,
        stepName: 'b',
      }),
    ).toEqual([]);
  });

  it('lists steps of sibling parallel branches only', () => {
    const version = versionOf(
      parallel({
        name: 'p',
        children: [
          action({ name: 'a1', nextAction: action({ name: 'a2' }) }),
          action({ name: 'b1' }),
        ],
        nextAction: action({ name: 'after' }),
      }),
    );
    expect(
      joinEdgeCandidates
        .listCandidates({ workflowVersion: version, stepName: 'b1' })
        .sort(),
    ).toEqual(['a1', 'a2']);
    expect(
      joinEdgeCandidates.listCandidates({
        workflowVersion: version,
        stepName: 'after',
      }),
    ).toEqual([]);
  });

  it('does not list steps from mutually exclusive router branches', () => {
    const version = versionOf(
      router({
        name: 'r',
        children: [action({ name: 'x' }), action({ name: 'y' })],
      }),
    );
    expect(
      joinEdgeCandidates.listCandidates({
        workflowVersion: version,
        stepName: 'y',
      }),
    ).toEqual([]);
  });

  it('does not list steps nested inside a router within a sibling parallel branch', () => {
    const version = versionOf(
      parallel({
        name: 'p',
        children: [
          router({ name: 'r', children: [action({ name: 'x' })] }),
          action({ name: 'b1' }),
        ],
      }),
    );
    expect(
      joinEdgeCandidates
        .listCandidates({ workflowVersion: version, stepName: 'b1' })
        .sort(),
    ).toEqual(['r']);
  });
});

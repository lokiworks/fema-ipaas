import {
  BranchExecutionType,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { deleteImpactUtils } from '@/app/builder/workflow-canvas/utils/delete-impact';

const DATE = '2026-05-02T00:00:00.000Z';

function action({
  name,
  input = {},
  nextAction,
}: {
  name: string;
  input?: Record<string, unknown>;
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
      input,
      propertySettings: {},
    },
    nextAction,
  };
}

function trigger(nextAction: WorkflowAction): WorkflowTrigger {
  return {
    name: 'trigger',
    type: WorkflowTriggerType.EMPTY,
    valid: true,
    displayName: 'Trigger',
    lastUpdatedDate: DATE,
    settings: {},
    nextAction,
  };
}

describe('deleteImpactUtils.impactOf', () => {
  it('needs no confirmation for a lone step nobody uses', () => {
    const impact = deleteImpactUtils.impactOf({
      trigger: trigger(
        action({ name: 'step_1', nextAction: action({ name: 'step_2' }) }),
      ),
      names: ['step_2'],
    });
    expect(impact.nestedCount).toBe(0);
    expect(impact.dependents).toEqual([]);
    expect(deleteImpactUtils.needsConfirmation({ impact })).toBe(false);
  });

  it('lists later steps that read the deleted step output', () => {
    const impact = deleteImpactUtils.impactOf({
      trigger: trigger(
        action({
          name: 'step_1',
          nextAction: action({
            name: 'step_2',
            input: { text: '{{step_1.output.id}}' },
          }),
        }),
      ),
      names: ['step_1'],
    });
    expect(impact.dependents).toEqual([
      { name: 'step_2', displayName: 'Name step_2' },
    ]);
    expect(deleteImpactUtils.needsConfirmation({ impact })).toBe(true);
  });

  it('does not count the step that follows as nested', () => {
    const impact = deleteImpactUtils.impactOf({
      trigger: trigger(
        action({ name: 'step_1', nextAction: action({ name: 'step_2' }) }),
      ),
      names: ['step_1'],
    });
    expect(impact.nestedCount).toBe(0);
  });

  it('counts steps inside a router branch as nested', () => {
    const router: WorkflowAction = {
      name: 'router',
      type: WorkflowActionType.ROUTER,
      valid: true,
      displayName: 'Router',
      lastUpdatedDate: DATE,
      settings: {
        executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        branches: [
          {
            branchType: BranchExecutionType.FALLBACK,
            branchName: 'Default',
          },
        ],
      },
      children: [action({ name: 'inner_1' })],
    };
    const impact = deleteImpactUtils.impactOf({
      trigger: trigger(router),
      names: ['router'],
    });
    expect(impact.nestedCount).toBe(1);
    expect(deleteImpactUtils.needsConfirmation({ impact })).toBe(true);
  });

  it('counts steps inside parallel branches as nested', () => {
    const parallel: WorkflowAction = {
      name: 'parallel',
      type: WorkflowActionType.PARALLEL,
      valid: true,
      displayName: 'Parallel',
      lastUpdatedDate: DATE,
      settings: { branches: [{ branchName: 'A' }, { branchName: 'B' }] },
      children: [action({ name: 'inner_1' }), action({ name: 'inner_2' })],
      nextAction: action({
        name: 'after',
        input: { text: '{{inner_1.output.id}}' },
      }),
    };
    const impact = deleteImpactUtils.impactOf({
      trigger: trigger(parallel),
      names: ['parallel'],
    });
    expect(impact.nestedCount).toBe(2);
    expect(deleteImpactUtils.needsConfirmation({ impact })).toBe(true);
  });
});

// @vitest-environment jsdom
import { WorkflowAction, WorkflowActionType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { DataSelectorTreeNode } from '@/app/builder/data-selector/type';
import { dataSelectorUtils } from '@/app/builder/data-selector/utils';

function loopStep({ items }: { items: string }): WorkflowAction {
  return {
    name: 'step_6',
    type: WorkflowActionType.LOOP_ON_ITEMS,
    displayName: 'Loop',
    valid: true,
    settings: { items },
  };
}

const stepNode: DataSelectorTreeNode = {
  key: 'step_5',
  data: {
    type: 'value',
    value: '',
    displayName: '5. Code',
    propertyPath: "step_5['output']",
    insertable: true,
  },
};

describe('dataSelectorUtils.branchConditionLabel', () => {
  it('names the branch a step after the join depends on', () => {
    const label = dataSelectorUtils.branchConditionLabel({
      onlyWhen: [
        { stepName: 'step_4', kind: 'ROUTER_BRANCH', branchName: 'Branch 1' },
        { stepName: 'step_5', kind: 'ON_FAILURE', branchName: null },
      ],
      displayNameOf: (stepName) => (stepName === 'step_5' ? 'Code' : stepName),
    });

    expect(label).toBe(
      'Only set when the run takes the "Branch 1" branch → the failure branch of "Code"',
    );
  });

  it('gives no label to steps that always run', () => {
    expect(
      dataSelectorUtils.branchConditionLabel({
        onlyWhen: [],
        displayNameOf: (stepName) => stepName,
      }),
    ).toBeNull();
  });

  it('adds the label as a badge next to an existing one', () => {
    const node = dataSelectorUtils.withBranchCondition({
      node: {
        ...stepNode,
        data: { ...stepNode.data, type: 'value', badge: 'Not tested' },
      },
      label: 'Only set on branch 1',
    });

    expect(node.data.type === 'value' ? node.data.badge : null).toBe(
      'Not tested · Only set on branch 1',
    );
  });
});

describe('dataSelectorUtils.inferLoopItemSample', () => {
  const sampleData = {
    step_5: { names: [{ name: 'Wang' }, { name: 'Li' }], total: 2 },
  };

  it('takes the first entry of the upstream list the loop iterates', () => {
    expect(
      dataSelectorUtils.inferLoopItemSample({
        loop: loopStep({ items: "{{step_5['output']['names']}}" }),
        sampleData,
      }),
    ).toEqual({ item: { name: 'Wang' } });
  });

  it('gives up when the list has no sample or the input is not a single reference', () => {
    expect(
      dataSelectorUtils.inferLoopItemSample({
        loop: loopStep({ items: "{{step_7['output']['names']}}" }),
        sampleData,
      }),
    ).toBeNull();
    expect(
      dataSelectorUtils.inferLoopItemSample({
        loop: loopStep({ items: "x {{step_5['output']['names']}}" }),
        sampleData,
      }),
    ).toBeNull();
    expect(
      dataSelectorUtils.inferLoopItemSample({
        loop: loopStep({ items: "{{step_5['output']['total']}}" }),
        sampleData,
      }),
    ).toBeNull();
  });
});

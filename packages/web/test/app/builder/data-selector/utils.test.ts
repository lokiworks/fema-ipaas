// @vitest-environment jsdom
// Importing the data-selector utils pulls in `@/features/connectors` → `src/lib/api.ts`,
// which reads `window.location.origin` at module load, so this suite needs a DOM.
import { WorkflowAction, WorkflowActionType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { DataSelectorTreeNode } from '@/app/builder/data-selector/type';
import { dataSelectorUtils } from '@/app/builder/data-selector/utils';

type TreeNode = ReturnType<typeof dataSelectorUtils.traverseStep>;

function collectPropertyPaths(node: TreeNode, acc: string[] = []): string[] {
  if (
    node.data.type === 'value' &&
    typeof node.data.propertyPath === 'string'
  ) {
    acc.push(node.data.propertyPath);
  }
  node.children?.forEach((child) => collectPropertyPaths(child, acc));
  return acc;
}

const codeStep: WorkflowAction & { dfsIndex: number } = {
  name: 'step_1',
  type: WorkflowActionType.CODE,
  displayName: 'Code',
  valid: true,
  lastUpdatedDate: '2024-01-01T00:00:00.000Z',
  settings: {
    sourceCode: { code: '', packageJson: '{}' },
    input: {},
    sampleData: { lastTestDate: '2024-01-01T00:00:00.000Z' },
  },
  dfsIndex: 0,
};

describe('dataSelectorUtils.traverseStep — zipped array (flattenNestedKeys)', () => {
  it("nests the step reference under ['output'] in the flattenNestedKeys arg", () => {
    const tree = dataSelectorUtils.traverseStep(
      codeStep,
      { step_1: [{ a: 1 }, { a: 2 }] },
      true,
      'step_1',
    );

    const paths = collectPropertyPaths(tree);
    const flattenPaths = paths.filter((p) =>
      p.startsWith('flattenNestedKeys('),
    );

    expect(flattenPaths).toContain(
      "flattenNestedKeys(step_1['output'], ['a'])",
    );
    // The bug: the data arg must reference step_1['output'], never the bare step.
    expect(
      flattenPaths.some((p) => p.startsWith('flattenNestedKeys(step_1,')),
    ).toBe(false);
  });
});

describe('dataSelectorUtils.filterBy — searchable value of containers', () => {
  const objectContainer: DataSelectorTreeNode = {
    key: 'obj',
    data: {
      type: 'value',
      value: { secret: 'hidden' },
      displayName: 'Obj',
      propertyPath: "step_1['output']['obj']",
      insertable: true,
    },
    children: [
      {
        key: 'field',
        data: {
          type: 'value',
          value: 'visible',
          displayName: 'Field',
          propertyPath: "step_1['output']['obj']['field']",
          insertable: true,
        },
      },
    ],
  };

  it('matches an object-valued container via its child leaf, not its stringified object', () => {
    expect(
      dataSelectorUtils.filterBy([objectContainer], 'visible'),
    ).toHaveLength(1);
    // 'hidden' lives only in the container's object value (not a child); the
    // container no longer stringifies that object, so it does not match.
    expect(
      dataSelectorUtils.filterBy([objectContainer], 'hidden'),
    ).toHaveLength(0);
  });

  it('still matches a container that carries a primitive value (zipped-view preview)', () => {
    const primitiveContainer: DataSelectorTreeNode = {
      key: 'data',
      data: {
        type: 'value',
        value: 'PRIMITIVE_TEXT',
        displayName: 'Data',
        propertyPath: "step_1['output']['data']",
        insertable: true,
      },
      children: [
        {
          key: 'nested',
          data: {
            type: 'value',
            value: 'deep',
            displayName: 'Nested',
            propertyPath: "step_1['output']['data']['nested']",
            insertable: true,
          },
        },
      ],
    };
    expect(
      dataSelectorUtils.filterBy([primitiveContainer], 'PRIMITIVE_TEXT'),
    ).toHaveLength(1);
  });
});

const failureTarget: WorkflowAction = {
  name: 'step_2',
  type: WorkflowActionType.CODE,
  displayName: 'Notify',
  valid: true,
  lastUpdatedDate: '2024-01-01T00:00:00.000Z',
  settings: {
    sourceCode: { code: '', packageJson: '{}' },
    input: {},
  },
};

const branchingStep: WorkflowAction & { dfsIndex: number } = {
  ...codeStep,
  settings: {
    ...codeStep.settings,
    errorHandlingOptions: {
      continueOnFailure: { value: true },
      retryOnFailure: { value: false },
    },
  },
  continueOnFailureBranches: { onFailure: failureTarget },
};

function leafNames(node: TreeNode): string[] {
  return (node.children ?? []).map((child) =>
    child.data.type === 'value' ? child.data.displayName : child.data.type,
  );
}

describe('dataSelectorUtils.traverseStep — failure branch', () => {
  it('offers the error code, message and time instead of the success output', () => {
    const tree = dataSelectorUtils.traverseStep(
      branchingStep,
      { step_1: { userId: 'u1' } },
      false,
      'step_2',
    );

    expect(leafNames(tree)).toEqual([
      'Failure error code',
      'Platform error category',
      'Failure error message',
      'Original error message',
      'Failure time',
      'Failure time (ISO 8601, UTC)',
    ]);
    expect(collectPropertyPaths(tree)).toContain(
      "step_1['output']['errorMessage']",
    );
    expect(collectPropertyPaths(tree)).not.toContain(
      "step_1['output']['userId']",
    );
  });

  it('shows the error fields even before the failing step is tested', () => {
    const untested = {
      ...branchingStep,
      settings: { ...branchingStep.settings, sampleData: {} },
    };
    const tree = dataSelectorUtils.traverseStep(untested, {}, false, 'step_2');

    expect(leafNames(tree)).toEqual([
      'Failure error code',
      'Platform error category',
      'Failure error message',
      'Original error message',
      'Failure time',
      'Failure time (ISO 8601, UTC)',
    ]);
  });
});

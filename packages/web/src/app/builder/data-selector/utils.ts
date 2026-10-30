import { isNil, isObject } from '@fema-ipaas/core-utils';
import {
  BranchGuard,
  workflowCanvasUtils,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowReferenceUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { FieldFormat } from '@/components/custom/smart-output-viewer/types';
import { connectorSelectorUtils } from '@/features/connectors';

import { pathHelpers } from './path-helpers';
import {
  DataSelectorTreeNode,
  DataSelectorTestNodeData,
  DataSelectorTreeNodeDataUnion,
  DataSelectorTreeNodeData,
} from './type';

type PathSegment = string | number;

const JOINED_VALUES_MAX_LENGTH = 32;

const FAILURE_FIELDS: { key: string; label: string; format?: FieldFormat }[] = [
  { key: 'errorCode', label: 'Failure error code' },
  { key: 'errorCategory', label: 'Failure category' },
  { key: 'errorMessage', label: 'Failure error message' },
  { key: 'rawMessage', label: 'Failure raw message' },
  { key: 'errorTime', label: 'Failure time' },
  { key: 'errorTimeIso', label: 'Failure time (ISO)' },
];

function buildTestStepNode(
  displayName: string,
  stepName: string,
): DataSelectorTreeNode<DataSelectorTreeNodeData> {
  return {
    key: stepName,
    data: {
      type: 'value',
      value: '',
      displayName,
      propertyPath: stepName,
      insertable: false,
      stepName,
    },
    children: [
      {
        data: {
          type: 'test',
          stepName,
          parentDisplayName: displayName,
        },
        key: `test_${stepName}`,
      },
    ],
  };
}

type Node = {
  values: unknown[];
  properties: Record<string, Node>;
};

function mergeUniqueKeys(
  obj: Record<string, Node>,
  obj2: Record<string, Node>,
): Record<string, Node> {
  const result: Record<string, Node> = { ...obj };
  for (const [key, values] of Object.entries(obj2)) {
    const properties = mergeUniqueKeys(
      result[key]?.properties || {},
      values.properties,
    );
    result[key] = {
      values: [...(result[key]?.values || []), ...values.values],
      properties,
    };
  }
  return result;
}

function extractUniqueKeys(obj: unknown): Record<string, Node> {
  let result: Record<string, Node> = {};
  if (isObject(obj)) {
    for (const [entryKey, entryValue] of Object.entries(obj)) {
      const resultValue = result[entryKey]?.values || [];
      if (Array.isArray(entryValue)) {
        const filteredValues = entryValue.filter(
          (v) => !isObject(v) && !Array.isArray(v),
        );
        resultValue.push(...filteredValues);
      } else if (!isObject(entryValue)) {
        resultValue.push(entryValue);
      }
      const properties = extractUniqueKeys(entryValue);
      result[entryKey] = {
        values: resultValue,
        properties,
      };
    }
  } else if (Array.isArray(obj)) {
    for (const value of obj) {
      const properties = extractUniqueKeys(value);
      result = mergeUniqueKeys(result, properties);
    }
  }
  return result;
}

function convertArrayToZippedView(
  obj: Record<string, Node>,
  propertyPath: PathSegment[],
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[] {
  const result: DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[] = [];
  for (const [key, node] of Object.entries(obj)) {
    const stepName = propertyPath[0];
    const subPath = [...propertyPath.slice(1), key];

    const arrayPath = pathHelpers.propertyPathStarter(String(stepName));
    const propertyPathWithFlattenArray = `flattenNestedKeys(${arrayPath}, ['${subPath
      .map((s) => String(s))
      .join("', '")}'])`;
    const joinedValues = node.values.join(', ');
    result.push({
      key: key,
      data: {
        type: 'value',
        value:
          joinedValues.length > JOINED_VALUES_MAX_LENGTH
            ? `${joinedValues.slice(0, JOINED_VALUES_MAX_LENGTH)}...`
            : joinedValues,
        displayName: key,
        propertyPath: propertyPathWithFlattenArray,
        insertable: true,
      },
      children:
        Object.keys(node.properties).length > 0
          ? convertArrayToZippedView(node.properties, [...propertyPath, key])
          : undefined,
    });
  }
  return result;
}

function buildJsonPath(propertyPath: PathSegment[]): string {
  const propertyPathWithoutStepName = propertyPath.slice(1);
  //need array indexes to not be quoted so we can add 1 to them when displaying the path in mention
  return propertyPathWithoutStepName.reduce((acc, segment) => {
    return `${acc}[${
      typeof segment === 'string'
        ? `'${pathHelpers.escapeMentionKey(String(segment))}'`
        : segment
    }]`;
  }, pathHelpers.propertyPathStarter(String(propertyPath[0]))) as string;
}

function buildDataSelectorNode(
  displayName: string,
  propertyPath: PathSegment[],
  value: unknown,
  children: DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[] | undefined,
  insertable = true,
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion> {
  const jsonPath = buildJsonPath(propertyPath);

  return {
    key: jsonPath,
    data: {
      type: 'value',
      value,
      displayName,
      propertyPath: jsonPath,
      insertable,
    },
    children,
  };
}

function traverseOutput(
  displayName: string,
  propertyPath: PathSegment[],
  node: unknown,
  zipArraysOfProperties: boolean,
  insertable = true,
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion> {
  if (Array.isArray(node)) {
    const isArrayOfObjects = node.some((value) => isObject(value));
    if (!zipArraysOfProperties || !isArrayOfObjects) {
      const mentionNodes = node.map((value, idx) =>
        traverseOutput(
          `${displayName} [${idx + 1}]`,
          [...propertyPath, idx],
          value,
          zipArraysOfProperties,
          insertable,
        ),
      );
      return buildDataSelectorNode(
        displayName,
        propertyPath,
        node,
        mentionNodes,
        insertable,
      );
    } else {
      return buildDataSelectorNode(
        displayName,
        propertyPath,
        node,
        convertArrayToZippedView(extractUniqueKeys(node), propertyPath),
        insertable,
      );
    }
  } else if (isObject(node)) {
    const children = Object.entries(node).map(([key, value]) => {
      if (zipArraysOfProperties) {
        return buildDataSelectorNode(
          key,
          [...propertyPath, key],
          value,
          convertArrayToZippedView(extractUniqueKeys(value), [
            ...propertyPath,
            key,
          ]),
          insertable,
        );
      }
      return traverseOutput(
        key,
        [...propertyPath, key],
        value,
        zipArraysOfProperties,
        insertable,
      );
    });
    return buildDataSelectorNode(
      displayName,
      propertyPath,
      node,
      children,
      insertable,
    );
  } else {
    return buildDataSelectorNode(
      displayName,
      propertyPath,
      node,
      undefined,
      insertable,
    );
  }
}

function getSearchableValue(
  item: DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>,
) {
  if (item.data.type === 'test') {
    return item.data.parentDisplayName;
  }
  if (item.data.type === 'chunk') {
    return item.data.displayName;
  }
  // A container whose value holds the real object/array (for the type icon +
  // count) is matched by displayName and by its children's leaf values, which
  // are searched separately — so don't stringify the whole subtree here every
  // keystroke (redundant and costly). Containers carrying a primitive value
  // (e.g. the zipped-view aggregated preview string) keep their value searchable.
  const isContainerObjectValue =
    !isNil(item.children) &&
    item.children.length > 0 &&
    (isObject(item.data.value) || Array.isArray(item.data.value));
  if (isContainerObjectValue) {
    return '';
  }
  if (!isNil(item.data.value)) {
    return JSON.stringify(item.data.value).toLowerCase();
  } else if (item.data.value === null) {
    return 'null';
  }
  return '';
}

function stepNeedsTesting(
  step: (WorkflowAction | WorkflowTrigger) & { dfsIndex: number },
): boolean {
  return (
    isNil(step.settings.sampleData?.lastTestDate) &&
    (step.type !== WorkflowTriggerType.CONNECTOR ||
      !connectorSelectorUtils.isManualTrigger({
        connectorName: step.settings.connectorName,
        triggerName: step.settings.triggerName ?? '',
      }))
  );
}

function traverseStep(
  step: (WorkflowAction | WorkflowTrigger) & { dfsIndex: number },
  sampleData: Record<string, unknown>,
  zipArraysOfProperties: boolean,
  targetStepName: string,
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion> {
  const displayName = `${step.dfsIndex + 1}. ${step.displayName}`;
  if (stepNeedsTesting(step)) {
    return applyContinueOnFailureView({
      step,
      stepNode: buildTestStepNode(displayName, step.name),
      targetStepName,
    });
  }
  if (step.type === WorkflowActionType.LOOP_ON_ITEMS) {
    const copiedSampleData = JSON.parse(JSON.stringify(sampleData[step.name]));
    delete copiedSampleData['iterations'];
    const headNode = traverseOutput(
      displayName,
      [step.name],
      copiedSampleData,
      zipArraysOfProperties,
      true,
    );
    headNode.isLoopStepNode = true;
    if (headNode.data.type === 'value') {
      headNode.data = { ...headNode.data, stepName: step.name };
    }
    return headNode;
  }

  const stepNode = traverseOutput(
    displayName,
    [step.name],
    sampleData[step.name],
    zipArraysOfProperties,
    true,
  );
  if (stepNode.data.type === 'value') {
    stepNode.data = { ...stepNode.data, stepName: step.name };
  }
  const branch = workflowCanvasUtils.hasContinueOnFailureBranches(step)
    ? workflowCanvasUtils.getStepBranchRelativeTo(step, targetStepName)
    : null;
  const wrapsPrimitiveOutput =
    !isNil(branch) &&
    branch !== 'on-failure' &&
    isNil(stepNode.children) &&
    stepNode.data.type === 'value';
  const nodeWithOutputLeaf: DataSelectorTreeNode<DataSelectorTreeNodeDataUnion> =
    wrapsPrimitiveOutput && stepNode.data.type === 'value'
      ? {
          ...stepNode,
          data: { ...stepNode.data, insertable: false },
          children: [
            {
              key: `${step.name}_output`,
              data: {
                type: 'value',
                displayName: t('Output'),
                propertyPath: pathHelpers.propertyPathStarter(step.name),
                value: stepNode.data.value,
                insertable: true,
                hideStepIcon: true,
              },
            },
          ],
        }
      : stepNode;
  return applyContinueOnFailureView({
    step,
    stepNode: nodeWithOutputLeaf,
    targetStepName,
  });
}

function applyContinueOnFailureView({
  step,
  stepNode,
  targetStepName,
}: {
  step: WorkflowAction | WorkflowTrigger;
  stepNode: DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>;
  targetStepName: string;
}): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion> {
  if (!workflowCanvasUtils.hasContinueOnFailureBranches(step)) {
    return stepNode;
  }
  const branch = workflowCanvasUtils.getStepBranchRelativeTo(
    step,
    targetStepName,
  );
  if (branch === 'on-success') {
    return stepNode;
  }
  const failureLeaves = buildFailureLeaves(step.name);
  if (branch === 'on-failure') {
    return {
      ...stepNode,
      data:
        stepNode.data.type === 'value'
          ? {
              ...stepNode.data,
              insertable: false,
              badge: undefined,
              structureOnly: undefined,
            }
          : stepNode.data,
      children: failureLeaves,
    };
  }
  return {
    ...stepNode,
    children: [
      {
        key: `${step.name}_on_success`,
        data: {
          type: 'chunk',
          displayName: t('On success'),
          displayNameClassName: 'text-success-800 dark:text-success-200',
        },
        children: stepNode.children,
      },
      {
        key: `${step.name}_on_failure`,
        data: {
          type: 'chunk',
          displayName: t('On failure'),
          displayNameClassName:
            'text-destructive-800 dark:text-destructive-200',
        },
        children: failureLeaves,
      },
    ],
  };
}

function buildFailureLeaves(
  stepName: string,
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[] {
  return FAILURE_FIELDS.map(({ key, label, format }) => ({
    key: `${stepName}_failure_${key}`,
    data: {
      type: 'value',
      displayName: t(label),
      propertyPath: pathHelpers.convertValuePathToPropertyPath(stepName, key),
      value: '',
      insertable: true,
      structureOnly: true,
      format,
    },
  }));
}

function failureFieldLabelOf(key: string): string | null {
  const field = FAILURE_FIELDS.find((candidate) => candidate.key === key);
  return isNil(field) ? null : t(field.label);
}

function branchConditionLabel({
  onlyWhen,
  displayNameOf,
}: {
  onlyWhen: BranchGuard[];
  displayNameOf: (stepName: string) => string;
}): string | null {
  if (onlyWhen.length === 0) {
    return null;
  }
  const path = onlyWhen
    .map((guard) => guardLabel({ guard, displayNameOf }))
    .join(' → ');
  return t('Only set when the run takes {path}', { path });
}

function guardLabel({
  guard,
  displayNameOf,
}: {
  guard: BranchGuard;
  displayNameOf: (stepName: string) => string;
}): string {
  switch (guard.kind) {
    case 'ROUTER_BRANCH':
      return t('the {branch} branch', {
        branch: guard.branchName ?? displayNameOf(guard.stepName),
      });
    case 'ON_SUCCESS':
      return t('the success branch of {step}', {
        step: displayNameOf(guard.stepName),
      });
    case 'ON_FAILURE':
      return t('the failure branch of {step}', {
        step: displayNameOf(guard.stepName),
      });
  }
}

function withBranchCondition({
  node,
  label,
}: {
  node: DataSelectorTreeNode;
  label: string | null;
}): DataSelectorTreeNode {
  if (isNil(label) || node.data.type !== 'value') {
    return node;
  }
  const badge = isNil(node.data.badge)
    ? label
    : `${node.data.badge} · ${label}`;
  return { ...node, data: { ...node.data, badge } };
}

function inferLoopItemSample({
  loop,
  sampleData,
}: {
  loop: WorkflowAction | WorkflowTrigger;
  sampleData: Record<string, unknown>;
}): { item: unknown } | null {
  if (loop.type !== WorkflowActionType.LOOP_ON_ITEMS) {
    return null;
  }
  const items = loop.settings.items;
  const references = workflowReferenceUtil.extractFromValue(items);
  if (
    typeof items !== 'string' ||
    references.length !== 1 ||
    references[0].token.trim() !== items.trim()
  ) {
    return null;
  }
  const [reference] = references;
  const list = readPath({
    value: sampleData[reference.root],
    path: workflowReferenceUtil.stepOutputPath(reference.path),
  });
  return Array.isArray(list) && list.length > 0 ? { item: list[0] } : null;
}

function readPath({ value, path }: { value: unknown; path: string[] }): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    return isObject(current) ? current[segment] : undefined;
  }, value);
}

function filterBy(
  mentions: DataSelectorTreeNode[],
  query: string | undefined,
): DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[] {
  if (!query) {
    return mentions;
  }

  const res = mentions
    .map((item) => {
      const filteredChildren = !isNil(item.children)
        ? filterBy(item.children, query)
        : undefined;

      if (filteredChildren && filteredChildren.length) {
        return {
          ...item,
          children: filteredChildren,
        };
      }
      const searchableValue = getSearchableValue(item);

      const normalizedQuery = query.toLowerCase();
      const displayName =
        item.data.type === 'value' ? item.data.displayName.toLowerCase() : '';
      const searchTerms =
        item.data.type === 'value' ? item.data.searchTerms ?? [] : [];
      const matchDisplayNameOrValue =
        displayName.includes(normalizedQuery) ||
        searchableValue.toLowerCase().includes(normalizedQuery) ||
        searchTerms.some((term) =>
          term.toLowerCase().includes(normalizedQuery),
        );
      if (matchDisplayNameOrValue) {
        return item;
      }
      return null;
    })
    .filter(
      (f) => !isNil(f),
    ) as DataSelectorTreeNode<DataSelectorTreeNodeDataUnion>[];
  return res;
}

function siblingRowIds(
  nodes: DataSelectorTreeNode[],
  parentId: string | undefined,
): string[] {
  const occurrences = new Map<string, number>();
  return nodes.map((node) => {
    const seen = occurrences.get(node.key) ?? 0;
    occurrences.set(node.key, seen + 1);
    const segment = encodeURIComponent(node.key);
    const localId = seen === 0 ? segment : `${segment}#${seen}`;
    return isNil(parentId) ? localId : `${parentId}/${localId}`;
  });
}

function flattenVisibleRows({
  nodes,
  searchActive,
  overrides,
  parentId,
  depth = 0,
}: {
  nodes: DataSelectorTreeNode[];
  searchActive: boolean;
  overrides: ReadonlyMap<string, boolean>;
  parentId?: string;
  depth?: number;
}): DataSelectorRow[] {
  const ids = siblingRowIds(nodes, parentId);
  return nodes.flatMap((node, index) => {
    const id = ids[index];
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expandedByDefault = searchActive || depth === 0;
    const expanded = hasChildren && (overrides.get(id) ?? expandedByDefault);
    const row: DataSelectorRow = { id, node, depth, expanded };
    return expanded
      ? [
          row,
          ...flattenVisibleRows({
            nodes: children,
            searchActive,
            overrides,
            parentId: id,
            depth: depth + 1,
          }),
        ]
      : [row];
  });
}

export const dataSelectorUtils = {
  isTestStepNode: (
    node: DataSelectorTreeNode,
  ): node is DataSelectorTreeNode<DataSelectorTestNodeData> =>
    node.data.type === 'test',
  traverseStep,
  stepNeedsTesting,
  applyContinueOnFailureView,
  failureFieldLabelOf,
  branchConditionLabel,
  withBranchCondition,
  inferLoopItemSample,
  filterBy,
  flattenVisibleRows,
};

export type DataSelectorRow = {
  id: string;
  node: DataSelectorTreeNode;
  depth: number;
  expanded: boolean;
};

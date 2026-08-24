// @vitest-environment jsdom
import {
  CodeAction,
  EmptyTrigger,
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { describe, expect, it, vi } from 'vitest';

import { workflowCanvasUtils } from '@/app/builder/workflow-canvas/utils/workflow-canvas-utils';
import { CanvasEdgeType, CanvasNodeType } from '@/app/builder/workflow-canvas/utils/types';

vi.mock('@/features/executions', () => ({
  executionUtils: {
    extractStepOutput: () => undefined,
    findLastStepWithStatus: () => null,
  },
}));

const createCodeAction = (
  name: string,
  nextAction?: CodeAction,
): CodeAction => ({
  name,
  valid: true,
  displayName: name,
  lastUpdatedDate: '2026-01-01T00:00:00.000Z',
  type: WorkflowActionType.CODE,
  settings: {
    sourceCode: {
      code: 'export const code = async () => true;',
      packageJson: '{}',
    },
    input: {},
    errorHandlingOptions: {},
  },
  nextAction,
});

const createWorkflowVersion = (firstAction?: CodeAction): WorkflowVersion => {
  const trigger: EmptyTrigger = {
    name: 'trigger',
    valid: false,
    displayName: 'Select Trigger',
    type: WorkflowTriggerType.EMPTY,
    settings: {},
    lastUpdatedDate: '2026-01-01T00:00:00.000Z',
    nextAction: firstAction,
  };
  return {
    id: 'version-id',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    workflowId: 'workflow-id',
    displayName: 'Test workflow',
    trigger,
    updatedBy: null,
    valid: false,
    schemaVersion: null,
    agentIds: [],
    state: WorkflowVersionState.DRAFT,
    connectionIds: [],
    backupFiles: null,
    notes: [],
  };
};

const getStepNode = (
  graph: ReturnType<typeof workflowCanvasUtils.createWorkflowGraph>,
  name: string,
) => {
  const node = graph.nodes.find(
    (n) => n.id === name && n.type === CanvasNodeType.STEP,
  );
  expect(node).toBeDefined();
  return node!;
};

describe('workflowCanvasUtils.createWorkflowGraph', () => {
  it('keeps the existing vertical layout untouched', () => {
    const graph = workflowCanvasUtils.createWorkflowGraph({
      version: createWorkflowVersion(createCodeAction('step_1')),
      notes: [],
      orientation: 'vertical',
    });
    expect(getStepNode(graph, 'trigger').position).toEqual({ x: 0, y: 0 });
    expect(getStepNode(graph, 'step_1').position).toEqual({ x: 0, y: 120 });
  });

  it('lays steps out left to right in horizontal orientation', () => {
    const graph = workflowCanvasUtils.createWorkflowGraph({
      version: createWorkflowVersion(
        createCodeAction('step_1', createCodeAction('step_2')),
      ),
      notes: [],
      orientation: 'horizontal',
    });
    expect(getStepNode(graph, 'trigger').position).toEqual({ x: 0, y: 0 });
    expect(getStepNode(graph, 'step_1').position).toEqual({ x: 160, y: 0 });
    expect(getStepNode(graph, 'step_2').position).toEqual({ x: 320, y: 0 });
  });

  it('connects each step edge to its subgraph end node', () => {
    const graph = workflowCanvasUtils.createWorkflowGraph({
      version: createWorkflowVersion(createCodeAction('step_1')),
      notes: [],
      orientation: 'vertical',
    });
    const triggerEdge = graph.edges.find((edge) => edge.source === 'trigger');
    expect(triggerEdge?.type).toEqual(CanvasEdgeType.STRAIGHT_LINE);
    expect(triggerEdge?.target).toEqual('trigger-subgraph-end');
    const lastEdge = graph.edges.find((edge) => edge.source === 'step_1');
    expect(lastEdge?.target).toEqual('step_1-subgraph-end');
  });
});

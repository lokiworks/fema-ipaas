// @vitest-environment jsdom
import {
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { CanvasEdgeType } from './types';
import { workflowCanvasUtils } from './workflow-canvas-utils';

const version = (
  joinEdges: { from: string; to: string }[],
): WorkflowVersion => ({
  id: 'version',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  workflowId: 'workflow',
  displayName: 'Workflow',
  updatedBy: null,
  valid: true,
  schemaVersion: null,
  agentIds: [],
  state: WorkflowVersionState.DRAFT,
  connectionIds: [],
  backupFiles: null,
  notes: [],
  graph: { joinEdges },
  trigger: {
    name: 'trigger',
    displayName: 'Trigger',
    type: WorkflowTriggerType.EMPTY,
    settings: {},
    valid: true,
    nextAction: {
      name: 'step_1',
      displayName: 'Step 1',
      type: WorkflowActionType.CODE,
      settings: { sourceCode: { code: '', packageJson: '' }, input: {} },
      valid: true,
      nextAction: {
        name: 'step_2',
        displayName: 'Step 2',
        type: WorkflowActionType.CODE,
        settings: { sourceCode: { code: '', packageJson: '' }, input: {} },
        valid: true,
      },
    },
  },
});

const joinEdgesOf = (joinEdges: { from: string; to: string }[]) =>
  workflowCanvasUtils
    .createWorkflowGraph({
      version: version(joinEdges),
      notes: [],
      orientation: 'vertical',
    })
    .edges.filter((edge) => edge.type === CanvasEdgeType.JOIN_EDGE);

describe('join edges on the canvas', () => {
  it('draws one edge per declared dependency', () => {
    const edges = joinEdgesOf([{ from: 'step_1', to: 'step_2' }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: 'join-step_1-step_2',
      source: 'step_1',
      target: 'step_2',
    });
  });

  it('drops edges pointing at steps the canvas does not draw', () => {
    expect(joinEdgesOf([{ from: 'deleted_step', to: 'step_2' }])).toHaveLength(
      0,
    );
    expect(joinEdgesOf([{ from: 'step_1', to: 'deleted_step' }])).toHaveLength(
      0,
    );
  });
});

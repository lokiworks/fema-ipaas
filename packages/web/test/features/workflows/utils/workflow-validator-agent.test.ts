import { AgentMcpServerInfo } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  ValidationCode,
  ValidationSeverity,
  ValidationTab,
  workflowValidator,
} from '@/features/workflows/utils/workflow-validator';

const DATE = '2026-10-04T00:00:00.000Z';

const hr: AgentMcpServerInfo = {
  externalId: 'hr',
  displayName: '企业人事工具',
  url: 'https://hr.corp/mcp',
  authType: 'bearer',
  ok: true,
  toolNames: ['query_employee', 'create_ticket'],
};

function agentStep(input: Record<string, unknown>): WorkflowAction {
  return {
    name: 'step_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'AI 智能体',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-ai',
      connectorVersion: '0.1.0',
      actionName: 'run_agent',
      input,
      propertySettings: {},
      errorHandlingOptions: undefined,
    },
  };
}

function flowWith(step: WorkflowAction): WorkflowTrigger {
  return {
    name: 'trigger',
    type: WorkflowTriggerType.EMPTY,
    valid: false,
    displayName: 'Trigger',
    settings: {},
    lastUpdatedDate: new Date(0).toISOString(),
    nextAction: step,
  };
}

function issuesOf({
  input,
  servers,
}: {
  input: Record<string, unknown>;
  servers: AgentMcpServerInfo[] | null;
}) {
  return workflowValidator
    .validate({
      trigger: flowWith(agentStep(input)),
      connectors: {},
      connections: null,
      mcpServers: servers,
      mappingTableIds: null,
      variableNames: null,
    })
    .issues.filter((found) => found.stepName === 'step_1');
}

const linked = {
  mcpServers: [
    {
      server: 'hr',
      url: 'https://hr.corp/mcp',
      authorization: "{{connections['hr'].props.token}}",
    },
  ],
  maxSteps: 6,
};

describe('workflowValidator agent servers', () => {
  it('is quiet when the picked server is there and healthy', () => {
    expect(issuesOf({ input: linked, servers: [hr] })).toEqual([]);
  });

  it('blocks publishing when the picked server was deleted, and names it', () => {
    const found = issuesOf({ input: linked, servers: [] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      code: ValidationCode.AGENT_SERVER_MISSING,
      severity: ValidationSeverity.ERROR,
      tab: ValidationTab.INPUT,
      params: { server: 'hr' },
    });
  });

  it('blocks publishing when the picked server cannot be reached', () => {
    const found = issuesOf({
      input: linked,
      servers: [{ ...hr, ok: false }],
    });
    expect(found[0]).toMatchObject({
      code: ValidationCode.AGENT_SERVER_BROKEN,
      severity: ValidationSeverity.ERROR,
      params: { server: '企业人事工具' },
    });
  });

  it('blocks publishing when an allowed tool is gone from the server', () => {
    const found = issuesOf({
      input: { ...linked, allowedTools: ['query_employee', 'drop_table'] },
      servers: [hr],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      code: ValidationCode.AGENT_TOOL_MISSING,
      severity: ValidationSeverity.ERROR,
      params: { tool: 'drop_table' },
    });
  });

  it('says nothing about servers until the server list has loaded', () => {
    expect(issuesOf({ input: linked, servers: null })).toEqual([]);
  });

  it('leaves hand-written addresses alone', () => {
    const found = issuesOf({
      input: {
        mcpServers: [
          { url: 'https://elsewhere/mcp', authorization: 'Bearer x' },
        ],
      },
      servers: [hr],
    });
    expect(found).toEqual([]);
  });

  it('still reports an agent without any server', () => {
    const found = issuesOf({ input: {}, servers: [hr] });
    expect(found.map((item) => item.code)).toEqual([
      ValidationCode.AGENT_NO_TOOLS,
    ]);
  });
});

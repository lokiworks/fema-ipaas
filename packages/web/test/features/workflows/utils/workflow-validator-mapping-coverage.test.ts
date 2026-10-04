import { MappingMissingBehavior } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';

import {
  ValidationCode,
  ValidationSeverity,
  workflowValidator,
} from '@/features/workflows/utils/workflow-validator';

const DATE = '2026-10-05T00:00:00.000Z';

function mapperStep(): WorkflowAction {
  return {
    name: 'step_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Map',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-data-mapper',
      connectorVersion: '0.4.0',
      actionName: 'map_fields',
      input: {
        mapping: {
          fields: [
            {
              id: 'a',
              target: 'dept',
              source: 'x',
              transforms: [{ type: 'LOOKUP', arg: 'mt_dept' }],
            },
          ],
        },
      },
      propertySettings: {},
      errorHandlingOptions: undefined,
    },
  };
}

function trigger(): WorkflowTrigger {
  return {
    name: 'trigger',
    type: WorkflowTriggerType.CONNECTOR,
    valid: true,
    displayName: 'Webhook',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-webhook',
      connectorVersion: '0.0.1',
      triggerName: 'catch',
      input: {},
      propertySettings: {},
    },
    nextAction: mapperStep(),
  };
}

function issuesFor(
  uncovered: string[],
  behavior = MappingMissingBehavior.ERROR,
) {
  return workflowValidator
    .validate({
      trigger: trigger(),
      connectors: {},
      connections: {},
      mappingTableIds: ['mt_dept'],
      variableNames: [],
      mappingCoverage: {
        step_1: [
          { tableName: 'Departments', uncovered, hitPercent: 50, behavior },
        ],
      },
    })
    .issues.filter(
      (issue) => issue.code === ValidationCode.MAPPING_COVERAGE_LOW,
    );
}

describe('workflowValidator mapping coverage', () => {
  it('warns, never blocks, when values seen in runs or samples have no row', () => {
    const [found] = issuesFor(['20399', '20400']);
    expect(found.severity).toBe(ValidationSeverity.WARNING);
    expect(found.stepName).toBe('step_1');
    expect(found.params).toMatchObject({
      table: 'Departments',
      count: '2',
      values: '20399, 20400',
      behavior: MappingMissingBehavior.ERROR,
    });
  });

  it('stays quiet when everything seen is covered', () => {
    expect(issuesFor([])).toEqual([]);
  });

  it('shows at most three values in the message', () => {
    const [found] = issuesFor(['1', '2', '3', '4']);
    expect(found.params['values']).toBe('1, 2, 3');
    expect(found.params['count']).toBe('4');
  });
});

import { blueprintFactory, BlueprintHttpMethod } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { blueprintWorkspaceUtils } from '@/features/connector-blueprints/utils/blueprint-workspace-utils';

function definitionWith(groups: string[], operationGroups: string[]) {
  return {
    ...blueprintFactory.definition({
      displayName: 'CRM',
      description: '',
      iconColor: '#2563EB',
      baseUrl: '',
    }),
    groups,
    operations: operationGroups.map((group, index) =>
      blueprintFactory.operation({
        key: `op_${index}`,
        name: `Op ${index}`,
        method: BlueprintHttpMethod.GET,
        path: '/x',
        group,
      }),
    ),
  };
}

describe('blueprintWorkspaceUtils', () => {
  it('lists named groups first and ungrouped operations last', () => {
    const groups = blueprintWorkspaceUtils.groupsOf(
      definitionWith(['客户'], ['', '订单', '客户']),
    );
    expect(
      groups.map((group) => [group.name, group.operations.length]),
    ).toEqual([
      ['客户', 1],
      ['订单', 1],
      ['', 1],
    ]);
  });

  it('renames a group on the operations that use it', () => {
    const renamed = blueprintWorkspaceUtils.renameGroup({
      definition: definitionWith(['客户'], ['客户', '']),
      from: '客户',
      to: '联系人',
    });
    expect(renamed.groups).toEqual(['联系人']);
    expect(renamed.operations.map((operation) => operation.group)).toEqual([
      '联系人',
      '',
    ]);
  });

  it('moves operations to ungrouped when their group is deleted', () => {
    const removed = blueprintWorkspaceUtils.removeGroup({
      definition: definitionWith(['客户'], ['客户']),
      name: '客户',
    });
    expect(removed.groups).toEqual([]);
    expect(removed.operations[0].group).toBe('');
  });
});

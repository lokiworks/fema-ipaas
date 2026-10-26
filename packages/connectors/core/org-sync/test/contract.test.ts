import { connectorContract, createMockActionContext } from '@fema-ipaas/connector-sdk';
import { orgSync } from '../src';
import { planTreeSync } from '../src/lib/actions/plan-tree-sync';
import { resolveOperation } from '../src/lib/actions/resolve-operation';

it('satisfies the connector contract', () => {
  expect(connectorContract.violationsOf({ connector: orgSync })).toEqual([]);
});

it('plans against Feishu fields and resolves a child using a binding created earlier in the same loop', async () => {
  const source = [{ key: '1', parentKey: null, name: 'Root', order: null, disabled: false }, { key: '2', parentKey: '1', name: 'HR', order: null, disabled: false }, { key: '3', parentKey: '2', name: 'Recruiting', order: null, disabled: false }];
  const plan = await planTreeSync.run(createMockActionContext({ propsValue: { source, target: [{ open_department_id: 'od-hr', department_id: 'manual-hr', parent_department_id: '0', name: 'HR' }], bindings: {}, rootSourceKey: '1', rootTargetId: '0' } }));
  expect(plan.ops).toEqual([{ op: 'BIND', sourceKey: '2', targetId: 'od-hr' }, { op: 'CREATE', sourceKey: '3', customId: 'bs-3', name: 'Recruiting', parentSourceKey: '2', order: null }]);
  const resolved = await resolveOperation.run(createMockActionContext({ propsValue: { operation: plan.ops[1], source, bindings: { '2': 'od-hr' }, rootSourceKey: '1', rootTargetId: '0' } }));
  expect(resolved).toMatchObject({ kind: 'UPSERT', parentDepartmentId: 'od-hr', customDepartmentId: 'bs-3' });
});

it('fails before root binding or target writes when the source root is missing', async () => {
  await expect(planTreeSync.run(createMockActionContext({ propsValue: { source: [], target: [], bindings: {}, rootSourceKey: 'missing', rootTargetId: '0' } }))).rejects.toThrow('source organization root is missing');
});

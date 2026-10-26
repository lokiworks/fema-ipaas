import { createAction, fixOwnerMarker, orgTreePlan, Property } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';

export const planTreeSync = createAction({
  name: 'plan_tree_sync', displayName: 'Plan department synchronization',
  description: 'Compare department trees and return parent-first changes without writing to either system',
  requireAuth: false, classification: 'READ', audience: 'both',
  aiMetadata: { description: 'Plan department creation, binding, changes and archiving. Never deletes a department. Stops if the archive or move gate is exceeded.', idempotent: true },
  props: {
    source: Property.Json({ displayName: 'Source departments', required: true }),
    target: Property.Json({ displayName: 'Target departments', required: true }),
    bindings: Property.Json({ displayName: 'Department bindings', required: true, defaultValue: {} }),
    rootSourceKey: Property.ShortText({ displayName: 'Source root', required: true }),
    rootTargetId: Property.ShortText({ displayName: 'Target root', required: true, defaultValue: '0' }),
    archiveParentId: Property.ShortText({ displayName: 'Archive department', required: false }),
    maxArchives: Property.Number({ displayName: 'Maximum departments to archive', required: false, defaultValue: 10 }),
    failOnOrphans: Property.Checkbox({ displayName: 'Stop when a source parent chain is broken', required: false, defaultValue: false }),
    maxMoves: Property.Number({ displayName: 'Maximum departments to move', required: false, defaultValue: 50 }),
  },
  outputSchema: { fields: [{ key: 'ops', label: 'Changes', listItems: [{ key: 'op' }, { key: 'sourceKey' }, { key: 'targetId' }, { key: 'customId' }, { key: 'name' }, { key: 'parentSourceKey' }] }, { key: 'gateExceeded', label: 'Gate exceeded' }, { key: 'noticeCount' }, { key: 'noticeText' }] },
  async run(context) {
    const raw = context.propsValue;
    const input = Input.safeParse(raw);
    if (!input.success) {
      throw new Error(fixOwnerMarker.attach({ message: 'orgSync.invalidInput', owner: 'WORKFLOW_OWNER' }));
    }
    if (!input.data.source.some((node) => node.key === input.data.rootSourceKey)) throw new Error(fixOwnerMarker.attach({ message: 'The source organization root is missing from the returned tree', owner: 'SOURCE_DATA_OWNER' }));
    const plan = orgTreePlan.build(input.data);
    if (plan.gateExceeded) {
      throw new Error(fixOwnerMarker.attach({ message: `Department safety gate exceeded: archives ${plan.gateExceeded.archives}/${input.data.maxArchives}, moves ${plan.gateExceeded.moves}/${input.data.maxMoves}`, owner: 'WORKFLOW_OWNER' }));
    }
    if (context.propsValue.failOnOrphans && plan.ops.some((op) => op.op === 'ORPHAN')) throw new Error(fixOwnerMarker.attach({ message: 'Some source department parent chains do not reach the selected root. Repair the source tree before synchronizing.', owner: 'SOURCE_DATA_OWNER' }));
    const notices = plan.ops.filter((op) => op.op === 'REPORT_DISABLED' || op.op === 'ORPHAN');
    return { ...plan, archiveParentId: input.data.archiveParentId ?? '', rootSourceKey: input.data.rootSourceKey, rootTargetId: input.data.rootTargetId, notices, noticeCount: notices.length, noticeText: `${notices.length} departments need review: ${JSON.stringify(notices.slice(0, 20))}` };
  },
});


const Target = z.object({ id: z.string(), customId: z.string().nullable(), parentId: z.string().nullable(), name: z.string() });
const FeishuTarget = z.object({ open_department_id: z.string(), department_id: z.string(), parent_department_id: z.string(), name: z.string() }).transform((node) => ({ id: node.open_department_id, customId: node.department_id, parentId: node.parent_department_id, name: node.name }));

const Input = z.object({
  source: z.array(z.object({ key: z.string(), parentKey: z.string().nullable(), name: z.string(), order: z.number().nullable(), disabled: z.boolean() })),
  target: z.array(z.union([Target, FeishuTarget])),
  bindings: z.record(z.string(), z.string()), rootSourceKey: z.string(), rootTargetId: z.string(),
  archiveParentId: z.string().optional(), maxArchives: z.number().int().nonnegative('formErrors.required').default(10), maxMoves: z.number().int().nonnegative('formErrors.required').default(50),
});

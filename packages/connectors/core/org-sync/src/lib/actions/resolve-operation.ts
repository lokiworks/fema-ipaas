import { createAction, fixOwnerMarker, Property } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';

export const resolveOperation = createAction({
  name: 'resolve_operation', displayName: 'Resolve department change', description: 'Resolve a planned change against the latest bindings', classification: 'READ', requireAuth: false,
  aiMetadata: { description: 'Resolve a department change to target IDs without writing.', idempotent: true },
  props: {
    operation: Property.Json({ displayName: 'Planned change', required: true }), source: Property.Json({ displayName: 'Source departments', required: true }), bindings: Property.Json({ displayName: 'Latest bindings', required: true }),
    rootSourceKey: Property.ShortText({ displayName: 'Source root', required: true }), rootTargetId: Property.ShortText({ displayName: 'Target root', required: true }),
  },
  outputSchema: { fields: ['kind', 'sourceKey', 'targetId', 'customDepartmentId', 'name', 'parentDepartmentId', 'onConflict', 'order'].map((key) => ({ key })) },
  async run(context) {
    const input = Input.parse(context.propsValue);
    const op = input.operation;
    const source = input.source.find((node) => node.key === op.sourceKey);
    const bindings = { ...input.bindings, [input.rootSourceKey]: input.rootTargetId };
    if (op.op === 'BIND' || op.op === 'ARCHIVE') return { kind: op.op, sourceKey: op.sourceKey, targetId: op.targetId, onConflict: 'KEEP' };
    if (!['CREATE', 'REBIND_CREATE', 'UPDATE'].includes(op.op)) return { kind: 'NOTICE', sourceKey: op.sourceKey };
    if (!source || !source.parentKey) throw new Error(fixOwnerMarker.attach({ message: 'The planned source department no longer has a parent', owner: 'SOURCE_DATA_OWNER' }));
    const parentDepartmentId = bindings[source.parentKey] ?? `bs-${source.parentKey}`;
    return { kind: 'UPSERT', sourceKey: source.key, targetId: op.targetId, customDepartmentId: `bs-${source.key}`, name: source.name, parentDepartmentId, ...(source.order === null ? {} : { order: source.order }), onConflict: op.op === 'REBIND_CREATE' ? 'REPLACE' : 'KEEP' };
  },
});

const Input = z.object({ operation: z.object({ op: z.string(), sourceKey: z.string(), targetId: z.string().optional() }), source: z.array(z.object({ key: z.string(), parentKey: z.string().nullable(), name: z.string(), order: z.number().nullable() })), bindings: z.record(z.string(), z.string()), rootSourceKey: z.string(), rootTargetId: z.string() });

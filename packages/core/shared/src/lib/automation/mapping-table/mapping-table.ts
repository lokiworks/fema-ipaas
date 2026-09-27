import { BaseModelSchema, MappingMissingBehavior, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const MAPPING_TABLE_MAX_ROWS = 5000

export const MappingTableRow = z.object({
    k: z.string().trim().min(1, 'mappingKeyRequired').max(100, 'mappingKeyTooLong'),
    v: z.string().max(200, 'mappingValueTooLong'),
})
export type MappingTableRow = z.infer<typeof MappingTableRow>

export const MappingTable = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    name: z.string(),
    description: z.string(),
    keyLabel: z.string(),
    valueLabel: z.string(),
    missingBehavior: z.enum(MappingMissingBehavior),
    defaultValue: Nullable(z.string()),
    rows: z.array(MappingTableRow),
    updatedById: Nullable(z.string()),
})
export type MappingTable = z.infer<typeof MappingTable>

export const MappingTableSummary = MappingTable.omit({ rows: true }).extend({
    rowCount: z.number(),
})
export type MappingTableSummary = z.infer<typeof MappingTableSummary>

export const MappingTableReference = z.object({
    workflowId: z.string(),
    workflowDisplayName: z.string(),
    stepName: z.string(),
    stepDisplayName: z.string(),
    published: z.boolean(),
})
export type MappingTableReference = z.infer<typeof MappingTableReference>

export const UpsertMappingTableRequestBody = z.object({
    projectId: z.string(),
    name: z.string().trim().min(1, 'formErrors.required').max(30, 'mappingTableNameTooLong'),
    description: z.string().max(100, 'mappingTableDescriptionTooLong'),
    keyLabel: z.string().trim().min(1, 'formErrors.required').max(20, 'mappingLabelTooLong'),
    valueLabel: z.string().trim().min(1, 'formErrors.required').max(20, 'mappingLabelTooLong'),
    missingBehavior: z.enum(MappingMissingBehavior),
    defaultValue: z.string().nullable(),
    rows: z.array(MappingTableRow).max(MAPPING_TABLE_MAX_ROWS, 'mappingTableTooManyRows'),
}).superRefine((body, ctx) => {
    if (body.keyLabel === body.valueLabel) {
        ctx.addIssue({ code: 'custom', path: ['valueLabel'], message: 'mappingLabelsMustDiffer' })
    }
    if (body.missingBehavior === MappingMissingBehavior.DEFAULT && (body.defaultValue ?? '').length === 0) {
        ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: 'formErrors.required' })
    }
    const seen = new Set<string>()
    body.rows.forEach((row, index) => {
        if (seen.has(row.k)) {
            ctx.addIssue({ code: 'custom', path: ['rows', index, 'k'], message: 'mappingKeyDuplicated' })
        }
        seen.add(row.k)
    })
})
export type UpsertMappingTableRequestBody = z.infer<typeof UpsertMappingTableRequestBody>

export const ListMappingTablesRequestQuery = z.object({
    projectId: z.string(),
})
export type ListMappingTablesRequestQuery = z.infer<typeof ListMappingTablesRequestQuery>

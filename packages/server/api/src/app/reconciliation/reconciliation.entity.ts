import { ReconciliationDifference, ReconciliationRule, ReconciliationRun } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const ReconciliationRuleEntity = new EntitySchema<ReconciliationRule>({
    name: 'reconciliation_rule',
    columns: {
        ...BaseColumnSchemaPart, projectId: EntityIdSchema, name: { type: String }, workflowId: EntityIdSchema,
        source: { type: 'jsonb' }, target: { type: 'jsonb' }, scope: { type: 'jsonb' }, expectations: { type: 'jsonb' }, repair: { type: 'jsonb' },
        cron: { type: String }, enabled: { type: Boolean, default: true }, maxRepairsPerRun: { type: Number, default: 20 },
    },
    indices: [{ name: 'idx_reconciliation_rule_project', columns: ['projectId'] }],
    foreignKeys: [{ target: 'project', columnNames: ['projectId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }, { target: 'workflow', columnNames: ['workflowId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }],
})

export const ReconciliationRunEntity = new EntitySchema<ReconciliationRun>({
    name: 'reconciliation_run',
    columns: {
        ...BaseColumnSchemaPart, projectId: EntityIdSchema, ruleId: EntityIdSchema,
        status: { type: String }, startedAt: { type: 'timestamptz', nullable: true }, finishedAt: { type: 'timestamptz', nullable: true },
        sourceCount: { type: Number, default: 0 }, targetCount: { type: Number, default: 0 }, matchedCount: { type: Number, default: 0 }, differenceCount: { type: Number, default: 0 }, repairedCount: { type: Number, default: 0 }, error: { type: 'text', nullable: true },
    },
    indices: [{ name: 'idx_reconciliation_run_rule_created', columns: ['projectId', 'ruleId', 'created'] }],
    foreignKeys: [{ target: 'project', columnNames: ['projectId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }, { target: 'reconciliation_rule', columnNames: ['ruleId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }],
})

export const ReconciliationDifferenceEntity = new EntitySchema<ReconciliationDifference>({
    name: 'reconciliation_difference',
    columns: {
        ...BaseColumnSchemaPart, projectId: EntityIdSchema, ruleId: EntityIdSchema, businessKey: { type: String }, aspect: { type: String },
        kind: { type: String }, expected: { type: 'jsonb', nullable: true }, actual: { type: 'jsonb', nullable: true }, status: { type: String },
        firstSeenRunId: EntityIdSchema, lastSeenRunId: EntityIdSchema, repairExecutionId: { ...EntityIdSchema, nullable: true }, resolvedAt: { type: 'timestamptz', nullable: true },
    },
    indices: [{ name: 'idx_reconciliation_difference_open', columns: ['ruleId', 'businessKey', 'aspect'], unique: true, where: 'status IN (\'OPEN\', \'REPAIRING\')' }, { name: 'idx_reconciliation_difference_project_rule', columns: ['projectId', 'ruleId'] }],
    foreignKeys: [{ target: 'project', columnNames: ['projectId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }, { target: 'reconciliation_rule', columnNames: ['ruleId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' }],
})

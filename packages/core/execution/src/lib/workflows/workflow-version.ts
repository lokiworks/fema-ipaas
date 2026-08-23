import { z } from 'zod'
import { BaseModelSchema, Nullable } from '@fema/core-utils'
import { UserWithMetaInformation } from '@fema/connector-types'
import { Note } from './note'
import { WorkflowTrigger } from './triggers/trigger'

export const LATEST_WORKFLOW_SCHEMA_VERSION = '23'

export enum WorkflowVersionState {
    LOCKED = 'LOCKED',
    DRAFT = 'DRAFT',
}

export const WorkflowVersion = z.object({
    ...BaseModelSchema,
    workflowId: z.string(),
    displayName: z.string(),
    trigger: WorkflowTrigger,
    updatedBy: Nullable(z.string()),
    valid: z.boolean(),
    schemaVersion: Nullable(z.string()),
    agentIds: z.array(z.string()),
    state: z.nativeEnum(WorkflowVersionState),
    connectionIds: z.array(z.string()),
    backupFiles: Nullable(z.record(z.string(), z.string())),
    notes: z.array(Note),
})

export type WorkflowVersion = z.infer<typeof WorkflowVersion>

export const WorkflowVersionMetadata = z.object({
    ...BaseModelSchema,
    workflowId: z.string(),
    displayName: z.string(),
    valid: z.boolean(),
    state: z.nativeEnum(WorkflowVersionState),
    updatedBy: Nullable(z.string()),
    schemaVersion: Nullable(z.string()),
    updatedByUser: Nullable(UserWithMetaInformation),
})

export type WorkflowVersionMetadata = z.infer<typeof WorkflowVersionMetadata>


import { BaseModelSchema, DateOrString, Nullable } from "@fema-ipaas/core-utils";
import * as z from "zod/mini";

export enum WorkflowStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export enum WorkflowTriggerType {
    EMPTY = 'EMPTY',
    CONNECTOR = 'CONNECTOR_TRIGGER',
}

export const StopResponse = z.object({
    status: z.optional(z.number()),
    body: z.optional(z.unknown()),
    headers: z.optional(z.record(z.string(), z.string())),
})
export type StopResponse = z.infer<typeof StopResponse>

export const Workspace = z.object({
    ...BaseModelSchema,
    deleted: Nullable(DateOrString),
    ownerId: z.string(),
    displayName: z.string(),
    tenantId: z.string(),
    externalId: Nullable(z.string()),
})
export type Workspace = z.infer<typeof Workspace>

export const USE_DRAFT_QUERY_PARAM_NAME = 'useDraft'

export const PARENT_RUN_ID_HEADER = 'ap-parent-run-id'
export const FAIL_PARENT_ON_FAILURE_HEADER = 'ap-fail-parent-on-failure'
export const RAW_PAYLOAD_HEADER = 'ap-raw-payload'

export type PopulatedWorkflow = {
    id: string
    externalId?: string
    status: WorkflowStatus
    version: {
        displayName: string
        trigger: {
            type: WorkflowTriggerType
            settings: {
                connectorName?: string
                input: {
                    exampleData?: unknown
                } & Record<string, unknown>
            } & Record<string, unknown>
        }
    }
}

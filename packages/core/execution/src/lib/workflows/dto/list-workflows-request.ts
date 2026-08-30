import { z } from 'zod'
import { OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { Cursor } from '@fema-ipaas/core-utils'
import { WorkflowStatus } from '../workflow'
import { WorkflowVersionState } from '../workflow-version'

export const ListWorkflowsRequest = z.object({
    folderId: z.string().optional(),
    folderIds: OptionalArrayFromQuery(z.string()),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    status: OptionalArrayFromQuery(z.nativeEnum(WorkflowStatus)),
    projectId: z.string(),
    name: z.string().optional(),
    agentExternalIds: OptionalArrayFromQuery(z.string()),
    versionState: z.nativeEnum(WorkflowVersionState).optional(),
    connectionExternalIds: OptionalArrayFromQuery(z.string()),
    externalIds: OptionalArrayFromQuery(z.string()),
})

export type ListWorkflowsRequest = Omit<z.infer<typeof ListWorkflowsRequest>, 'cursor'> & { cursor: Cursor | undefined }

export const GetWorkflowQueryParamsRequest = z.object({
    versionId: z.string().optional(),
})

export type GetWorkflowQueryParamsRequest = z.infer<typeof GetWorkflowQueryParamsRequest>

export const ListWorkflowVersionRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
})

export type ListWorkflowVersionRequest = Omit<z.infer<typeof ListWorkflowVersionRequest>, 'cursor'> & { cursor: Cursor | undefined }

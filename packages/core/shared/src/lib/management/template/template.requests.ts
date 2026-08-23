import { Metadata, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { TemplateStatus, TemplateTag, TemplateType, WorkflowVersionTemplate } from './template'

export const CreateTemplateRequestBody = z.object({
    name: z.string(),
    summary: z.string(),
    description: z.string(),
    tags: z.array(TemplateTag).optional(),
    blogUrl: z.string().optional(),
    metadata: Nullable(Metadata),
    author: z.string(),
    categories: z.array(z.string()),
    type: z.nativeEnum(TemplateType),
    workflows: z.array(WorkflowVersionTemplate).optional(),
})
export type CreateTemplateRequestBody = z.infer<typeof CreateTemplateRequestBody>

export const UpdateWorkflowTemplateRequestBody = z.object({
    name: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(TemplateTag).optional(),
    blogUrl: z.string().optional(),
    metadata: Nullable(Metadata),
    status: z.nativeEnum(TemplateStatus).optional(),
    categories: z.array(z.string()).optional(),
    workflows: z.array(WorkflowVersionTemplate).optional(),
})
export type UpdateWorkflowTemplateRequestBody = z.infer<typeof UpdateWorkflowTemplateRequestBody>

export const UpdateTemplateRequestBody = UpdateWorkflowTemplateRequestBody
export type UpdateTemplateRequestBody = z.infer<typeof UpdateTemplateRequestBody>

export const ListWorkflowTemplatesRequestQuery = z.object({
    type: z.nativeEnum(TemplateType).optional(),
    connectors: OptionalArrayFromQuery(z.string()),
    tags: OptionalArrayFromQuery(z.string()),
    search: z.string().optional(),
    category: z.string().optional(),
})
export type ListWorkflowTemplatesRequestQuery = z.infer<typeof ListWorkflowTemplatesRequestQuery>

export const ListTemplatesRequestQuery = ListWorkflowTemplatesRequestQuery
export type ListTemplatesRequestQuery = z.infer<typeof ListTemplatesRequestQuery>

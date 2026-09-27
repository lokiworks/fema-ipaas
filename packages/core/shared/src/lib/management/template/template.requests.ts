import { Metadata, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'
import { TEMPLATE_CATEGORY_MAX_LENGTH, TEMPLATE_DESCRIPTION_MAX_LENGTH, TEMPLATE_HELP_LINK_REGEX, TEMPLATE_NAME_MAX_LENGTH, TemplateStatus, TemplateTag, TemplateType, TemplateVisibility, WorkflowVersionTemplate } from './template'

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
    featured: z.boolean().optional(),
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
    featured: z.boolean().optional(),
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

export const GenerateTemplateFromWorkflowRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
    name: z.string().trim().min(1, formErrors.required).max(TEMPLATE_NAME_MAX_LENGTH, 'templateNameTooLong'),
    description: z.string().trim().max(TEMPLATE_DESCRIPTION_MAX_LENGTH, 'templateDescriptionTooLong'),
    category: z.string().trim().max(TEMPLATE_CATEGORY_MAX_LENGTH, 'templateCategoryTooLong'),
    blogUrl: z.union([z.literal(''), z.string().regex(TEMPLATE_HELP_LINK_REGEX, 'templateHelpLinkInvalid')]),
    visibility: z.enum(TemplateVisibility),
})
export type GenerateTemplateFromWorkflowRequestBody = z.infer<typeof GenerateTemplateFromWorkflowRequestBody>

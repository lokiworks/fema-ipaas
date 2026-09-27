import { ApplicationError, ErrorCode, generateId, isNil, SeekPage, spreadIfDefined } from '@fema-ipaas/core-utils'
import { CreateTemplateRequestBody, GenerateTemplateFromWorkflowRequestBody, ListTemplatesRequestQuery, Template, TemplateStatus, TemplateType, TemplateVisibility, UpdateTemplateRequestBody, WorkflowVersionTemplate } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, ArrayOverlap, Equal, IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { userService } from '../user/user-service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { templateFromWorkflow } from './template-from-workflow'
import { templateValidator } from './template-validator'
import { TemplateEntity } from './template.entity'

const templateRepo = repoFactory<Template>(TemplateEntity)

export const templateService = (log: FastifyBaseLogger) => ({
    async getOne({ id }: GetParams): Promise<Template | null> {
        return templateRepo().findOneBy({ id })
    },
    async getOneOrThrow({ id }: GetParams): Promise<Template> {
        const template = await templateRepo().findOneBy({ id })
        if (isNil(template)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'template',
                    entityId: id,
                    message: `Template ${id} not found`,
                },
            })
        }
        return template
    },
    async create({ tenantId, params, createdBy = null, visibility = null }: CreateParams): Promise<Template> {
        const preparedTemplate = await templateValidator.validateAndPrepare({
            workflows: params.workflows,
            tenantId,
            log,
        })

        const { workflows, connectors } = preparedTemplate
        const { name, summary, description, tags, blogUrl, metadata, author, categories, type } = params

        const newTags = tags ?? []

        switch (type) {
            case TemplateType.OFFICIAL:
            case TemplateType.CUSTOM:
            case TemplateType.SHARED: {
                const newTemplate: NewTemplate = {
                    id: generateId(),
                    name,
                    type,
                    summary,
                    description,
                    tenantId,
                    tags: newTags,
                    blogUrl,
                    metadata,
                    author,
                    categories,
                    connectors,
                    workflows,
                    status: TemplateStatus.PUBLISHED,
                    createdBy,
                    visibility,
                    usageCount: 0,
                    featured: params.featured ?? false,
                }
                return templateRepo().save(newTemplate)
            }
        }
    },

    async createFromWorkflow({ projectId, tenantId, userId, request }: CreateFromWorkflowParams): Promise<Template> {
        const workflow = await workflowService(log).getOneOrThrow({ id: request.workflowId, projectId })
        if (isNil(workflow.publishedVersionId)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Only a published workflow can be turned into a template',
                },
            })
        }
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId: workflow.id,
            versionId: workflow.publishedVersionId,
            removeSampleData: true,
            projectId,
        })
        const user = await userService(log).getMetaInformation({ id: userId })
        const params = templateFromWorkflow.buildCreateBody({
            request,
            version,
            author: templateFromWorkflow.authorName(user),
            externalId: workflow.externalId,
        })
        return this.create({ tenantId, params, createdBy: userId, visibility: request.visibility })
    },

    async update({ id, params }: UpdateParams): Promise<Template> {
        const { name, summary, description, tags, blogUrl, metadata, categories, status, featured } = params
        const template = await this.getOneOrThrow({ id })

        let sanatizedWorkflows: WorkflowVersionTemplate[] | undefined = undefined
        let connectors: string[] | undefined = undefined
        if (!isNil(params.workflows) && params.workflows.length > 0) {
            const preparedTemplate = await templateValidator.validateAndPrepare({
                workflows: params.workflows,
                tenantId: undefined,
                log,
            })
            sanatizedWorkflows = preparedTemplate.workflows
            connectors = preparedTemplate.connectors
        }

        switch (template.type) {
            case TemplateType.OFFICIAL:
            case TemplateType.CUSTOM:
            case TemplateType.SHARED: {
                await templateRepo().update(id, {
                    ...spreadIfDefined('name', name),
                    ...spreadIfDefined('summary', summary),
                    ...spreadIfDefined('description', description),
                    ...spreadIfDefined('tags', tags),
                    ...spreadIfDefined('blogUrl', blogUrl),
                    ...spreadIfDefined('metadata', metadata),
                    ...spreadIfDefined('categories', categories),
                    ...spreadIfDefined('workflows', sanatizedWorkflows),
                    ...spreadIfDefined('connectors', connectors),
                    ...spreadIfDefined('status', status),
                    ...spreadIfDefined('featured', featured),
                })
                return templateRepo().findOneByOrFail({ id })
            }
        }
    },

    async list({ tenantId, connectors, tags, search, type, category, viewerUserId = null }: ListParams): Promise<SeekPage<Template>> {
        const commonFilters: Record<string, unknown> = {}

        if (connectors) {
            commonFilters.connectors = ArrayOverlap(connectors)
        }
        if (category) {
            commonFilters.categories = ArrayContains([category])
        }
        switch (type) {
            case TemplateType.OFFICIAL:
                commonFilters.type = Equal(TemplateType.OFFICIAL)
                commonFilters.tenantId = IsNull()
                break
            case TemplateType.CUSTOM:
                commonFilters.type = Equal(TemplateType.CUSTOM)
                if (isNil(tenantId)) {
                    throw new ApplicationError({
                        code: ErrorCode.VALIDATION,
                        params: {
                            message: 'Tenant ID is required to list custom templates',
                        },
                    })
                }
                commonFilters.tenantId = Equal(tenantId)
                break
            case TemplateType.SHARED:
                throw new ApplicationError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: 'Shared templates are not supported to being listed',
                    },
                })
        }
        commonFilters.status = Equal(TemplateStatus.PUBLISHED)
        const queryBuilder = templateRepo()
            .createQueryBuilder('template')
            .where(commonFilters)

        if (tags && tags.length > 0) {
            queryBuilder.andWhere(
                '(SELECT array_agg(tag->>\'title\') FROM jsonb_array_elements(template.tags) tag) @> :tags::text[]',
                { tags },
            )
        }
        if (type === TemplateType.CUSTOM) {
            queryBuilder.andWhere(
                '(template."createdBy" IS NULL OR template.visibility = :tenantVisibility OR template."createdBy" = :viewerUserId)',
                { tenantVisibility: TemplateVisibility.TENANT, viewerUserId: viewerUserId ?? '' },
            )
        }
        if (search) {
            queryBuilder.andWhere(
                '(template.name ILIKE :search OR template.summary ILIKE :search OR template.description ILIKE :search)',
                { search: `%${search}%` },
            )
        }

        const templates = await queryBuilder.getMany()
        return paginationHelper.createPage(templates, null)
    },

    async incrementUsage({ id, tenantId }: IncrementUsageParams): Promise<void> {
        await templateRepo()
            .createQueryBuilder()
            .update()
            .set({ usageCount: () => '"usageCount" + 1' })
            .where('id = :id', { id })
            .andWhere('("tenantId" IS NULL OR "tenantId" = :tenantId)', { tenantId })
            .execute()
    },

    async delete({ id }: DeleteParams): Promise<void> {
        await templateRepo().delete({ id })
    },
})

type GetParams = {
    id: string
}

type CreateParams = {
    tenantId: string | undefined
    params: CreateTemplateRequestBody
    createdBy?: string | null
    visibility?: TemplateVisibility | null
}

type NewTemplate = Omit<Template, 'created' | 'updated'>

type ListParams = Omit<ListTemplatesRequestQuery, 'type'> & {
    tenantId: string | null
    type: TemplateType
    viewerUserId?: string | null
}

type CreateFromWorkflowParams = {
    projectId: string
    tenantId: string
    userId: string
    request: GenerateTemplateFromWorkflowRequestBody
}

type IncrementUsageParams = {
    id: string
    tenantId: string
}

type DeleteParams = {
    id: string
}

type UpdateParams = {
    id: string
    params: UpdateTemplateRequestBody
}
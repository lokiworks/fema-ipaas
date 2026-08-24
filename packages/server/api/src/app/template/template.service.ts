import { ApplicationError, ErrorCode, generateId, isNil, SeekPage, spreadIfDefined } from '@fema-ipaas/core-utils'
import { CreateTemplateRequestBody, ListTemplatesRequestQuery, Template, TemplateStatus, TemplateType, UpdateTemplateRequestBody, WorkflowVersionTemplate } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, ArrayOverlap, Equal, IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { paginationHelper } from '../helper/pagination/pagination-utils'
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
    async create({ tenantId, params }: CreateParams): Promise<Template> {
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
                }
                return templateRepo().save(newTemplate)
            }
        }
    },

    async update({ id, params }: UpdateParams): Promise<Template> {
        const { name, summary, description, tags, blogUrl, metadata, categories, status } = params
        const template = await this.getOneOrThrow({ id })

        const newTags = tags ?? []

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
                    ...spreadIfDefined('tags', newTags),
                    ...spreadIfDefined('status', status),
                })
                return templateRepo().findOneByOrFail({ id })
            }
        }
    },

    async list({ tenantId, connectors, tags, search, type, category }: ListParams): Promise<SeekPage<Template>> {
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
        if (search) {
            queryBuilder.andWhere(
                '(template.name ILIKE :search OR template.summary ILIKE :search OR template.description ILIKE :search)',
                { search: `%${search}%` },
            )
        }

        const templates = await queryBuilder.getMany()
        return paginationHelper.createPage(templates, null)
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
}

type NewTemplate = Omit<Template, 'created' | 'updated'>

type ListParams = Omit<ListTemplatesRequestQuery, 'type'> & {
    tenantId: string | null
    type: TemplateType
}

type DeleteParams = {
    id: string
}

type UpdateParams = {
    id: string
    params: UpdateTemplateRequestBody
}
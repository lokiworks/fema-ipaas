import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import {
    GlobalSearchGroup,
    GlobalSearchItem,
    GlobalSearchResponse,
    GlobalSearchResultType,
    MCP_CONNECTOR_NAME,
    TemplateStatus,
    TemplateVisibility,
    WorkflowOperationStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { connectionAccessService } from '../connection/connection-access.service'
import { connectionShareService } from '../connection/connection-share.service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { repoFactory } from '../core/db/repo-factory'
import { dataStoreRepo } from '../data-store/data-store.service'
import { issueRepo } from '../issue/issue.service'
import { mappingTableRepo } from '../mapping-table/mapping-table.service'
import { mcpServerService } from '../mcp-server/mcp-server.service'
import { mcpServiceService } from '../mcp-service/mcp-service.service'
import { projectRepo } from '../project/project-repo'
import { TemplateEntity } from '../template/template.entity'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { globalSearchUtils } from './global-search-utils'

const templateSearchRepo = repoFactory(TemplateEntity)

export const globalSearchService = (log: FastifyBaseLogger) => ({
    async search({ tenantId, userId, query }: SearchParams): Promise<GlobalSearchResponse> {
        const projectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const projects = projectIds.length === 0 ? [] : await projectRepo().find({ where: { id: In(projectIds), tenantId, deleted: IsNull() }, select: ['id', 'displayName'] })
        const context: SearchContext = {
            tenantId,
            userId,
            query,
            pattern: globalSearchUtils.likePattern(query),
            projectIds: projects.map((project) => project.id),
            projectNames: new Map(projects.map((project) => [project.id, project.displayName])),
            log,
        }
        const searchers: [GlobalSearchResultType, (ctx: SearchContext) => Promise<GlobalSearchItem[]>][] = [
            [GlobalSearchResultType.WORKFLOW, searchWorkflows],
            [GlobalSearchResultType.PROJECT, searchProjects],
            [GlobalSearchResultType.CONNECTION, searchConnections],
            [GlobalSearchResultType.CONNECTOR, searchConnectors],
            [GlobalSearchResultType.MCP_SERVICE, searchMcpServices],
            [GlobalSearchResultType.TEMPLATE, searchTemplates],
            [GlobalSearchResultType.DATA_STORE, searchDataStores],
            [GlobalSearchResultType.ISSUE, searchIssues],
            [GlobalSearchResultType.MAPPING_TABLE, searchMappingTables],
            [GlobalSearchResultType.MCP_SERVER, searchMcpServers],
        ]
        const groups = await Promise.all(searchers.map(async ([type, searcher]): Promise<GlobalSearchGroup> => {
            const { data, error } = await tryCatch(() => searcher(context))
            if (!isNil(error)) {
                log.warn({ error, search: { type } }, '[globalSearchService#search] Search group failed')
                return globalSearchUtils.toGroup({ type, items: [] })
            }
            return globalSearchUtils.toGroup({ type, items: data ?? [] })
        }))
        return { groups: globalSearchUtils.arrange(groups) }
    },
})

async function searchWorkflows(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    if (ctx.projectIds.length === 0) {
        return []
    }
    const rows: { id: string, projectId: string, displayName: string }[] = await workflowRepo()
        .createQueryBuilder('workflow')
        .innerJoin('workflow_version', 'latest_version', 'latest_version."workflowId" = workflow.id AND latest_version.id = (SELECT v.id FROM workflow_version v WHERE v."workflowId" = workflow.id ORDER BY v.created DESC LIMIT 1)')
        .select('workflow.id', 'id')
        .addSelect('workflow."projectId"', 'projectId')
        .addSelect('latest_version."displayName"', 'displayName')
        .where('workflow."projectId" IN (:...projectIds)', { projectIds: ctx.projectIds })
        .andWhere('workflow."operationStatus" <> :deleting', { deleting: WorkflowOperationStatus.DELETING })
        .andWhere('latest_version."displayName" ILIKE :pattern', { pattern: ctx.pattern })
        .orderBy('workflow.updated', 'DESC')
        .limit(globalSearchUtils.fetchSize)
        .getRawMany()
    return rows.map((row) => item({ ctx, type: GlobalSearchResultType.WORKFLOW, id: row.id, label: row.displayName, projectId: row.projectId }))
}

async function searchProjects(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    return [...ctx.projectNames.entries()]
        .filter(([, name]) => globalSearchUtils.matches({ query: ctx.query, values: [name] }))
        .slice(0, globalSearchUtils.fetchSize)
        .map(([id, name]) => item({ ctx, type: GlobalSearchResultType.PROJECT, id, label: name, projectId: id }))
}

async function searchConnections(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    const page = await connectionShareService(ctx.log).listAccessible({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        query: { search: ctx.query, limit: CONNECTION_FETCH_SIZE, status: undefined },
    })
    return page.data
        .filter((connection) => connection.connectorName !== MCP_CONNECTOR_NAME)
        .slice(0, globalSearchUtils.fetchSize)
        .map((connection) => item({ ctx, type: GlobalSearchResultType.CONNECTION, id: connection.id, label: connection.displayName, subtitle: connection.connectorName }))
}

async function searchConnectors(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    const connectors = await connectorMetadataService(ctx.log).list({ tenantId: ctx.tenantId, includeHidden: false, searchQuery: ctx.query })
    return connectors
        .slice(0, globalSearchUtils.fetchSize)
        .map((connector) => item({ ctx, type: GlobalSearchResultType.CONNECTOR, id: connector.name, label: connector.displayName, subtitle: connector.description }))
}

async function searchMcpServices(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    const services = await mcpServiceService(ctx.log).list({ tenantId: ctx.tenantId, userId: ctx.userId, query: { search: ctx.query } })
    return services
        .slice(0, globalSearchUtils.fetchSize)
        .map((service) => item({ ctx, type: GlobalSearchResultType.MCP_SERVICE, id: service.id, label: service.name, subtitle: service.description, projectId: service.projectId }))
}

async function searchTemplates(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    const templates = await templateSearchRepo()
        .createQueryBuilder('template')
        .where('template.status = :status', { status: TemplateStatus.PUBLISHED })
        .andWhere('(template."tenantId" IS NULL OR (template."tenantId" = :tenantId AND (template."createdBy" IS NULL OR template.visibility = :tenantVisibility OR template."createdBy" = :userId)))', {
            tenantId: ctx.tenantId,
            tenantVisibility: TemplateVisibility.TENANT,
            userId: ctx.userId,
        })
        .andWhere('(template.name ILIKE :pattern OR template.summary ILIKE :pattern)', { pattern: ctx.pattern })
        .orderBy('template.updated', 'DESC')
        .limit(globalSearchUtils.fetchSize)
        .getMany()
    return templates.map((template) => item({ ctx, type: GlobalSearchResultType.TEMPLATE, id: template.id, label: template.name, subtitle: template.summary }))
}

async function searchDataStores(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    if (ctx.projectIds.length === 0) {
        return []
    }
    const stores = await dataStoreRepo()
        .createQueryBuilder('store')
        .where('store."projectId" IN (:...projectIds)', { projectIds: ctx.projectIds })
        .andWhere('store.name ILIKE :pattern', { pattern: ctx.pattern })
        .orderBy('store.updated', 'DESC')
        .limit(globalSearchUtils.fetchSize)
        .getMany()
    return stores.map((store) => item({ ctx, type: GlobalSearchResultType.DATA_STORE, id: store.id, label: store.name, projectId: store.projectId }))
}

async function searchIssues(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    if (ctx.projectIds.length === 0) {
        return []
    }
    const issues = await issueRepo()
        .createQueryBuilder('issue')
        .where('issue."projectId" IN (:...projectIds)', { projectIds: ctx.projectIds })
        .andWhere('(issue.title ILIKE :pattern OR issue."stepDisplayName" ILIKE :pattern)', { pattern: ctx.pattern })
        .orderBy('issue."lastSeenAt"', 'DESC')
        .limit(globalSearchUtils.fetchSize)
        .getMany()
    return issues.map((issue) => item({ ctx, type: GlobalSearchResultType.ISSUE, id: issue.id, label: issue.title, projectId: issue.projectId }))
}

async function searchMappingTables(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    if (ctx.projectIds.length === 0) {
        return []
    }
    const tables = await mappingTableRepo()
        .createQueryBuilder('mapping_table')
        .select(['mapping_table.id', 'mapping_table.name', 'mapping_table.projectId'])
        .where('mapping_table."projectId" IN (:...projectIds)', { projectIds: ctx.projectIds })
        .andWhere('mapping_table.name ILIKE :pattern', { pattern: ctx.pattern })
        .orderBy('mapping_table.updated', 'DESC')
        .limit(globalSearchUtils.fetchSize)
        .getMany()
    return tables.map((table) => item({ ctx, type: GlobalSearchResultType.MAPPING_TABLE, id: table.id, label: table.name, projectId: table.projectId }))
}

async function searchMcpServers(ctx: SearchContext): Promise<GlobalSearchItem[]> {
    const servers = await mcpServerService(ctx.log).list({ tenantId: ctx.tenantId, userId: ctx.userId, search: ctx.query })
    return servers
        .slice(0, globalSearchUtils.fetchSize)
        .map((server) => item({ ctx, type: GlobalSearchResultType.MCP_SERVER, id: server.id, label: server.displayName, subtitle: server.url }))
}

function item({ ctx, type, id, label, subtitle, projectId }: ItemParams): GlobalSearchItem {
    return {
        id,
        type,
        label,
        subtitle: isNil(subtitle) || subtitle.length === 0 ? null : subtitle,
        projectId: projectId ?? null,
        projectName: isNil(projectId) ? null : ctx.projectNames.get(projectId) ?? null,
    }
}

const CONNECTION_FETCH_SIZE = 12

type SearchParams = {
    tenantId: string
    userId: string
    query: string
}

type SearchContext = {
    tenantId: string
    userId: string
    query: string
    pattern: string
    projectIds: string[]
    projectNames: Map<string, string>
    log: FastifyBaseLogger
}

type ItemParams = {
    ctx: SearchContext
    type: GlobalSearchResultType
    id: string
    label: string
    subtitle?: string | null
    projectId?: string | null
}

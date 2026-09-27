import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum GlobalSearchResultType {
    WORKFLOW = 'WORKFLOW',
    PROJECT = 'PROJECT',
    CONNECTION = 'CONNECTION',
    CONNECTOR = 'CONNECTOR',
    MCP_SERVICE = 'MCP_SERVICE',
    TEMPLATE = 'TEMPLATE',
    DATA_STORE = 'DATA_STORE',
    ISSUE = 'ISSUE',
    MAPPING_TABLE = 'MAPPING_TABLE',
    MCP_SERVER = 'MCP_SERVER',
}

export const GlobalSearchRequestQuery = z.object({
    query: z.string().trim().min(1).max(100),
})
export type GlobalSearchRequestQuery = z.infer<typeof GlobalSearchRequestQuery>

export const GlobalSearchItem = z.object({
    id: z.string(),
    type: z.enum(GlobalSearchResultType),
    label: z.string(),
    subtitle: Nullable(z.string()),
    projectId: Nullable(z.string()),
    projectName: Nullable(z.string()),
})
export type GlobalSearchItem = z.infer<typeof GlobalSearchItem>

export const GlobalSearchGroup = z.object({
    type: z.enum(GlobalSearchResultType),
    items: z.array(GlobalSearchItem),
    hasMore: z.boolean(),
})
export type GlobalSearchGroup = z.infer<typeof GlobalSearchGroup>

export const GlobalSearchResponse = z.object({
    groups: z.array(GlobalSearchGroup),
})
export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponse>

export const GLOBAL_SEARCH_GROUP_LIMIT = 5

export const GLOBAL_SEARCH_GROUP_ORDER: GlobalSearchResultType[] = [
    GlobalSearchResultType.WORKFLOW,
    GlobalSearchResultType.PROJECT,
    GlobalSearchResultType.CONNECTION,
    GlobalSearchResultType.CONNECTOR,
    GlobalSearchResultType.MCP_SERVICE,
    GlobalSearchResultType.TEMPLATE,
    GlobalSearchResultType.DATA_STORE,
    GlobalSearchResultType.ISSUE,
    GlobalSearchResultType.MAPPING_TABLE,
    GlobalSearchResultType.MCP_SERVER,
]

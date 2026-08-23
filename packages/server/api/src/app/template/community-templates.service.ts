import { ActivepiecesError, ErrorCode, isNil, SeekPage } from '@fema/core-utils'
import { safeHttp } from '@fema/server-utils'
import { ListTemplatesRequestQuery, Template } from '@fema/shared'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

function registryUrl(): string | null {
    const configured = system.get(AppSystemProp.TEMPLATES_SOURCE_URL)
    return isNil(configured) || configured.trim() === '' ? null : configured.replace(/\/+$/, '')
}

function emptyPage(): SeekPage<Template> {
    return { data: [], next: null, previous: null }
}

export const communityTemplates = {
    getOrThrow: async (id: string): Promise<Template> => {
        const base = registryUrl()
        if (isNil(base)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'template',
                    entityId: id,
                    message: `Template ${id} not found, no template registry is configured`,
                },
            })
        }
        const response = await safeHttp.axios.get<Template>(`${base}/${id}`)
        return response.data
    },

    getCategories: async (): Promise<string[]> => {
        const base = registryUrl()
        if (isNil(base)) {
            return []
        }
        const response = await safeHttp.axios.get<string[]>(`${base}/categories`)
        return response.data
    },

    list: async (request: ListTemplatesRequestQuery): Promise<SeekPage<Template>> => {
        const base = registryUrl()
        if (isNil(base)) {
            return emptyPage()
        }
        const response = await safeHttp.axios.get<SeekPage<Template>>(`${base}?${convertToQueryString(request)}`)
        return response.data
    },
}

function convertToQueryString(params: ListTemplatesRequestQuery): string {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
        if (isNil(value)) {
            return
        }
        if (Array.isArray(value)) {
            value.forEach((item) => searchParams.append(key, String(item)))
            return
        }
        searchParams.append(key, String(value))
    })
    return searchParams.toString()
}

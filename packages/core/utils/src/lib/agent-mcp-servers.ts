function read(value: unknown): AgentMcpServerEntry[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value.flatMap((item): AgentMcpServerEntry[] => {
        if (typeof item !== 'object' || item === null) {
            return []
        }
        const url = Reflect.get(item, 'url')
        const authorization = Reflect.get(item, 'authorization')
        const server = Reflect.get(item, 'server')
        return [{
            server: typeof server === 'string' && server.trim().length > 0 ? server.trim() : null,
            url: typeof url === 'string' ? url.trim() : '',
            authorization: typeof authorization === 'string' ? authorization : '',
        }]
    })
}

function readNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value.flatMap((item) => {
        const name = typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''
        return name.length > 0 ? [name] : []
    })
}

function authorizationOf({ authType, externalId }: { authType: AgentMcpAuthType, externalId: string }): string {
    if (authType === 'bearer') {
        return `{{connections['${externalId}'].props.token}}`
    }
    if (authType === 'oauth2') {
        return `{{connections['${externalId}'].access_token}}`
    }
    return ''
}

function entryOf({ server }: { server: AgentMcpServerInfo }): AgentMcpServerEntry {
    return {
        server: server.externalId,
        url: server.url,
        authorization: authorizationOf({ authType: server.authType, externalId: server.externalId }),
    }
}

function referencedExternalId(authorization: string): string | null {
    const match = CONNECTION_REFERENCE.exec(authorization)
    return match === null ? null : match[1]
}

function externalIdOf({ entry, servers }: { entry: AgentMcpServerEntry, servers: AgentMcpServerInfo[] }): string | null {
    if (entry.server !== null) {
        return entry.server
    }
    const referenced = referencedExternalId(entry.authorization)
    if (referenced !== null) {
        return referenced
    }
    return servers.find((server) => server.url === entry.url)?.externalId ?? null
}

function inspect({ entries, servers, allowedTools }: { entries: AgentMcpServerEntry[], servers: AgentMcpServerInfo[], allowedTools: string[] }): AgentMcpServerProblem[] {
    const links = entries.map((entry, index) => ({ entry, index, externalId: externalIdOf({ entry, servers }) }))
    const serverProblems = links.flatMap(({ entry, index, externalId }): AgentMcpServerProblem[] => {
        if (externalId === null) {
            return []
        }
        const server = servers.find((candidate) => candidate.externalId === externalId)
        if (server === undefined) {
            return [{ code: AgentMcpServerProblemCode.SERVER_MISSING, entryIndex: index, server: entry.server ?? externalId, tool: null }]
        }
        return server.ok
            ? []
            : [{ code: AgentMcpServerProblemCode.SERVER_BROKEN, entryIndex: index, server: server.displayName, tool: null }]
    })
    const hasManualEntry = links.some(({ externalId }) => externalId === null)
    const allToolNames = new Set(links.flatMap(({ externalId }) => servers.find((server) => server.externalId === externalId)?.toolNames ?? []))
    const toolProblems = hasManualEntry || serverProblems.length > 0
        ? []
        : allowedTools
            .filter((tool) => !allToolNames.has(tool) && !isExposedAlias({ tool, names: allToolNames }))
            .map((tool): AgentMcpServerProblem => ({ code: AgentMcpServerProblemCode.TOOL_MISSING, entryIndex: -1, server: '', tool }))
    return [...serverProblems, ...toolProblems]
}

function isExposedAlias({ tool, names }: { tool: string, names: Set<string> }): boolean {
    const match = EXPOSED_ALIAS.exec(tool)
    return match !== null && names.has(match[1])
}

export const agentMcpServers = {
    read,
    readNames,
    authorizationOf,
    entryOf,
    externalIdOf,
    inspect,
}

export enum AgentMcpServerProblemCode {
    SERVER_MISSING = 'SERVER_MISSING',
    SERVER_BROKEN = 'SERVER_BROKEN',
    TOOL_MISSING = 'TOOL_MISSING',
}

const CONNECTION_REFERENCE = /connections\[\s*['"]([^'"]+)['"]\s*\]/
const EXPOSED_ALIAS = /^server\d+_(.+)$/

export type AgentMcpAuthType = 'none' | 'bearer' | 'oauth2'

export type AgentMcpServerEntry = {
    server: string | null
    url: string
    authorization: string
}

export type AgentMcpServerInfo = {
    externalId: string
    displayName: string
    url: string
    authType: AgentMcpAuthType
    ok: boolean
    toolNames: string[]
}

export type AgentMcpServerProblem = {
    code: AgentMcpServerProblemCode
    entryIndex: number
    server: string
    tool: string | null
}

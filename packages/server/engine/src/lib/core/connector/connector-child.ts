import { Connector } from '@fema-ipaas/connector-sdk'
import { isNil, isObject } from '@fema-ipaas/core-utils'
import { extractConnectorFromModule } from '@fema-ipaas/shared'
import { buildContext } from './connector-context-builder'
import { ChildMessage, connectorProtocol, ParentMessage } from './connector-protocol'

export const connectorChild = {
    listen: (): void => {
        process.on('message', (message: ParentMessage) => void handleParentMessage(message))
        process.on('disconnect', () => process.exit(0))
        process.on('unhandledRejection', (reason) => report({ type: 'done', success: false, error: connectorProtocol.serializeError(reason) }))
        process.on('uncaughtException', (error) => report({ type: 'done', success: false, error: connectorProtocol.serializeError(error) }))
    },
}

async function handleParentMessage(message: ParentMessage): Promise<void> {
    try {
        const connector = await loadConnector(message)
        if (message.type === 'describe') {
            report({ type: 'done', success: true, result: describe(connector) })
            return
        }
        const built = isNil(message.context) ? undefined : await buildContext({ connector, request: message.context })
        const method = resolveMethod({ connector, path: message.path })
        const result = await method.call(...[...message.args, ...built?.args ?? []])
        await Promise.allSettled(built?.pending ?? [])
        report({
            type: 'done',
            success: true,
            result: connectorProtocol.toTransferable(result),
            hooks: built?.hooks,
        })
    }
    catch (error) {
        report({ type: 'done', success: false, error: connectorProtocol.serializeError(error) })
    }
}

async function loadConnector({ connectorPath, connectorName, connectorVersion }: { connectorPath: string, connectorName: string, connectorVersion: string }): Promise<Connector> {
    const connectorModule = await import(connectorPath)
    return extractConnectorFromModule<Connector>({ module: connectorModule, connectorName, connectorVersion })
}

function describe(connector: Connector): unknown {
    return {
        metadata: connectorProtocol.toTransferable(connector.metadata()),
        functionPaths: collectFunctionPaths({ value: callableRoot(connector), path: [], depth: 0, seen: new Set() }),
    }
}

function callableRoot(connector: Connector): Record<string, unknown> {
    return {
        actions: connector.actions(),
        triggers: connector.triggers(),
        auth: connector.auth,
        events: connector.events,
    }
}

function resolveMethod({ connector, path }: { connector: Connector, path: string[] }): BoundMethod {
    let owner: unknown = undefined
    let current: unknown = callableRoot(connector)
    for (const segment of path) {
        if (!isObject(current)) {
            throw new Error(`Path not found in connector: ${path.join('.')}`)
        }
        owner = current
        current = Reflect.get(current, segment)
    }
    if (typeof current !== 'function') {
        throw new Error(`Path is not callable in connector: ${path.join('.')}`)
    }
    const method = current
    return { call: async (...args: unknown[]) => method.apply(owner, args) }
}

function collectFunctionPaths({ value, path, depth, seen }: CollectParams): string[] {
    if (depth > MAX_FUNCTION_PATH_DEPTH || !isObject(value) || seen.has(value)) {
        return []
    }
    return Object.entries(value).flatMap(([key, item]) => {
        const itemPath = [...path, key]
        return typeof item === 'function' ? [itemPath.join('.')] : collectFunctionPaths({ value: item, path: itemPath, depth: depth + 1, seen: new Set([...seen, value]) })
    })
}

function report(message: ChildMessage): void {
    if (settled) {
        return
    }
    settled = true
    process.send?.(message, () => process.exit(0))
}

const MAX_FUNCTION_PATH_DEPTH = 6
let settled = false

type BoundMethod = {
    call: (...args: unknown[]) => Promise<unknown>
}

type CollectParams = {
    value: unknown
    path: string[]
    depth: number
    seen: Set<object>
}

import { spawn } from 'node:child_process'
import path from 'node:path'
import { isNil, tryCatchSync } from '@fema/core-utils'
import { ConnectorMemoryLimitError, EngineGenericError } from '@fema/shared'
import { connectorPath } from './connector-path'
import { ChildMessage, CollectedHooks, ConnectorDescription, connectorProtocol, ContextRequest, ParentMessage } from './connector-protocol'

export const connectorRunner = {
    describe: async (connector: ConnectorRef): Promise<ConnectorDescription> => {
        const cacheKey = `${connector.connectorName}@${connector.connectorVersion}`
        const cached = descriptions.get(cacheKey)
        if (!isNil(cached)) {
            return cached
        }
        const description = runInChildProcess({ connector, request: { type: 'describe' } }).then(({ result }) => toConnectorDescription(result))
        descriptions.set(cacheKey, description)
        description.catch(() => descriptions.delete(cacheKey))
        return description
    },

    call: async ({ connector, path: methodPath, args = [], context }: CallParams): Promise<CallResult> => {
        return runInChildProcess({ connector, request: { type: 'call', path: methodPath, args, context } })
    },
}

async function runInChildProcess({ connector, request }: RunInChildProcessParams): Promise<CallResult> {
    const entryPath = await connectorPath.resolve(connector)

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, childEntryPath()], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            serialization: 'advanced',
        })
        let settled = false
        let output = ''

        const settle = (apply: () => void): void => {
            if (settled) {
                return
            }
            settled = true
            child.kill()
            apply()
        }

        child.stdout?.on('data', (data: Buffer) => {
            output += data.toString()
            console.log(data.toString().trimEnd())
        })
        child.stderr?.on('data', (data: Buffer) => {
            output += data.toString()
            console.error(data.toString().trimEnd())
        })

        child.on('message', (message: ChildMessage) => {
            settle(() => message.success
                ? resolve({ result: message.result, hooks: message.hooks })
                : reject(connectorProtocol.deserializeError(message.error)))
        })

        child.on('close', (code, signal) => {
            settle(() => reject(toExitError({ code, signal, output })))
        })

        child.on('error', (error) => {
            settle(() => reject(new EngineGenericError('ConnectorProcessError', withOutput(error.message, output))))
        })

        const identity = { connectorPath: entryPath, connectorName: connector.connectorName, connectorVersion: connector.connectorVersion }
        const { error: sendError } = tryCatchSync(() => {
            const message: ParentMessage = request.type === 'describe'
                ? { ...identity, type: 'describe' }
                : { ...identity, type: 'call', path: request.path, args: request.args, context: request.context }
            child.send(message)
        })
        if (sendError) {
            settle(() => reject(new EngineGenericError('ConnectorArgumentsNotSerializableError', sendError.message)))
        }
    })
}

function toConnectorDescription(value: unknown): ConnectorDescription {
    const metadata = Reflect.get(Object(value), 'metadata')
    const functionPaths = Reflect.get(Object(value), 'functionPaths')
    if (isNil(metadata) || !Array.isArray(functionPaths)) {
        throw new EngineGenericError('ConnectorDescriptionInvalidError', 'Connector process returned an unexpected description')
    }
    return {
        metadata,
        functionPaths,
        hasPath: (path: string[]) => functionPaths.includes(path.join('.')),
    }
}

export function toExitError({ code, signal, output }: ExitParams): Error {
    if (isOutOfMemory({ code, signal, output })) {
        return new ConnectorMemoryLimitError(heapLimitMb(), output.trim())
    }
    return new EngineGenericError('ConnectorProcessExitedError', withOutput(`Connector process exited with code ${code} and signal ${signal}`, output))
}

// Mirrors the engine-side signatures in sandbox.ts: V8 saying it ran out of heap, or aborting,
// is unambiguous. A SIGKILL is ambiguous there because shutdown kills the engine the same way —
// here it is not, since the only kill we issue happens after the call has already settled.
function isOutOfMemory({ code, signal, output }: ExitParams): boolean {
    return output.includes('JavaScript heap out of memory')
        || code === 134
        || signal === 'SIGABRT'
        || signal === 'SIGKILL'
}

function heapLimitMb(): string | undefined {
    return process.execArgv.find((arg) => arg.startsWith('--max-old-space-size='))?.split('=')[1]
}

function withOutput(message: string, output: string): string {
    return output.trim().length === 0 ? message : `${message}\n${output.trim()}`
}

function childEntryPath(): string {
    return process.env.FEMA_CONNECTOR_CHILD_ENTRY ?? path.join(__dirname, 'connector-child.js')
}

const descriptions = new Map<string, Promise<ConnectorDescription>>()

type RunInChildProcessParams = {
    connector: ConnectorRef
    request: { type: 'describe' } | { type: 'call', path: string[], args: unknown[], context?: ContextRequest }
}

type ExitParams = {
    code: number | null
    signal: NodeJS.Signals | null
    output: string
}

export type ConnectorRef = {
    connectorName: string
    connectorVersion: string
    devConnectors: string[]
}

export type CallParams = {
    connector: ConnectorRef
    path: string[]
    args?: unknown[]
    context?: ContextRequest
}

export type CallResult = {
    result: unknown
    hooks?: CollectedHooks
}

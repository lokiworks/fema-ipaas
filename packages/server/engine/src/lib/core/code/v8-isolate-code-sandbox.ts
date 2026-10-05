/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises'
import { CodeSandbox } from '../../core/code/code-sandbox-common'
import { runLimits } from '../../helper/run-limits'

const ONE_HUNDRED_TWENTY_EIGHT_MEGABYTES = 128

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Check this https://github.com/laverdet/isolated-vm/issues/258#issuecomment-2134341086
let ivmCache: any
const getIvm = () => {
    if (!ivmCache) {
        ivmCache = require('isolated-vm')
    }
    return ivmCache as typeof import('isolated-vm')
}

/**
 * Runs code in a V8 Isolate sandbox
 */
export const v8IsolateCodeSandbox: CodeSandbox = {
    async runCodeModule({ codeFilePath, inputs }) {
        const ivm = getIvm()
        const isolate = new ivm.Isolate({ memoryLimit: ONE_HUNDRED_TWENTY_EIGHT_MEGABYTES })
        const timeoutMs = runLimits.stepTimeoutMs()

        try {
            const isolateContext = await initIsolateContext({
                isolate,
                codeContext: {
                    inputs,
                },
            })

            const source = await readFile(codeFilePath, 'utf8')

            return await executeIsolate({
                isolate,
                isolateContext,
                code: wrapCjsModule(source),
                timeoutMs,
            })
        }
        catch (error) {
            throw explainIsolateError({ error, isolate, timeoutMs })
        }
        finally {
            disposeIsolate({ isolate })
        }
    },

    async runScript({ script, scriptContext, functions }) {
        const session = await v8IsolateCodeSandbox.createScriptSession({ scriptContext, functions })
        try {
            return await session.run(script)
        }
        finally {
            session.dispose()
        }
    },

    async createScriptSession({ scriptContext, functions }) {
        const ivm = getIvm()
        const isolate = new ivm.Isolate({ memoryLimit: ONE_HUNDRED_TWENTY_EIGHT_MEGABYTES })

        try {
            // It is to avoid strucutedClone issue of proxy objects / functions, It will throw cannot be cloned error.
            const isolateContext = await initIsolateContext({
                isolate,
                codeContext: JSON.parse(JSON.stringify(scriptContext)),
            })
            const globalSets = new Map<string, Promise<void>>(
                [...Object.keys(scriptContext), ...Object.keys(functions)].map((key) => [key, Promise.resolve()]),
            )

            const serializedFunctions = Object.entries(functions).map(([key, value]) => `const ${key} = ${value.toString()};`).join('\n')
            if (serializedFunctions.length > 0) {
                const setupScript = await isolate.compileScript(serializedFunctions)
                await setupScript.run(isolateContext)
            }

            return {
                run: async (script: string) => executeIsolate({
                    isolate,
                    isolateContext,
                    code: script,
                }),
                setGlobal: async (key: string, value: unknown, noOverwrite = true) => {
                    const pendingSet = globalSets.get(key)
                    if (noOverwrite && pendingSet !== undefined) {
                        await pendingSet
                        return
                    }
                    const newSet = isolateContext.global.set(key, new ivm.ExternalCopy(JSON.parse(JSON.stringify(value))).copyInto())
                    globalSets.set(key, newSet)
                    await newSet
                },
                dispose: () => disposeIsolate({ isolate }),
            }
        }
        catch (error) {
            isolate.dispose()
            throw error
        }
    },
}

const initIsolateContext = async ({ isolate, codeContext }: InitContextParams): Promise<any> => {
    const isolateContext = await isolate.createContext()
    const ivm = getIvm()
    for (const [key, value] of Object.entries(codeContext)) {
        await isolateContext.global.set(key, new ivm.ExternalCopy(value).copyInto())
    }

    return isolateContext
}

const executeIsolate = async ({ isolate, isolateContext, code, timeoutMs }: ExecuteIsolateParams): Promise<unknown> => {
    const isolateScript = await isolate.compileScript(code)

    const outRef = await isolateScript.run(isolateContext, {
        reference: true,
        promise: true,
        ...(timeoutMs === null || timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    })

    return outRef.copy()
}

const disposeIsolate = ({ isolate }: { isolate: any }): void => {
    if (!isolate.isDisposed) {
        isolate.dispose()
    }
}

const messageOf = ({ error }: { error: unknown }): string => {
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message
    }
    return ''
}

const explainIsolateError = ({ error, isolate, timeoutMs }: ExplainIsolateErrorParams): unknown => {
    const message = messageOf({ error })
    if (isolate.isDisposed || /Isolate (was|is already) disposed/.test(message)) {
        return new Error(`The Code step used more than ${ONE_HUNDRED_TWENTY_EIGHT_MEGABYTES} MB of memory and was stopped`)
    }
    if (message.includes('timed out') && timeoutMs !== null && timeoutMs !== undefined) {
        return runLimits.stepTimeoutError(timeoutMs)
    }
    return error
}

// Wrap CJS source so `exports`/`module` are defined but `require` is NOT,
// blocking all Node.js built-in access inside the isolate.
// `inputs` is already injected as a global by initIsolateContext.
function wrapCjsModule(source: string): string {
    return `(function() {
  const exports = Object.create(null);
  const module = { exports };
  ${source}
  return module.exports.code(inputs);
})()`
}

type InitContextParams = {
    isolate: any
    codeContext: Record<string, unknown>
}

type ExecuteIsolateParams = {
    isolate: any
    isolateContext: unknown
    code: string
    timeoutMs?: number | null
}

type ExplainIsolateErrorParams = {
    error: unknown
    isolate: any
    timeoutMs: number | null
}

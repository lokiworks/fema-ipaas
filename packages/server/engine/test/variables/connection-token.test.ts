import { beforeEach, describe, expect, it, vi } from 'vitest'

const { obtain, evaluate } = vi.hoisted(() => ({ obtain: vi.fn(), evaluate: vi.fn() }))

vi.mock('../../src/lib/connector-context/connection-resolver', () => ({
    createConnectionResolver: () => ({ obtain }),
}))
vi.mock('../../src/lib/variables/script-evaluator', () => ({
    scriptEvaluator: { evaluate },
}))

import { connectionToken } from '../../src/lib/variables/connection-token'

describe('connectionToken.handle', () => {
    beforeEach(() => {
        obtain.mockReset()
        evaluate.mockReset()
        obtain.mockResolvedValue({ props: { token: 'secret' } })
        evaluate.mockResolvedValue('secret')
    })

    it('returns the whole connection when no path follows the name', async () => {
        const result = await connectionToken.handle(params({ variableName: "connections['mcp-x']" }))

        expect(result).toEqual({ props: { token: 'secret' } })
        expect(evaluate).not.toHaveBeenCalled()
    })

    it('reads a dotted path after a bracketed connection name', async () => {
        const result = await connectionToken.handle(params({ variableName: "connections['mcp-x'].props.token" }))

        expect(result).toBe('secret')
        expect(evaluate).toHaveBeenCalledWith({ script: 'connection.props.token', scriptContext: { connection: { props: { token: 'secret' } } } })
    })

    it('reads a bracketed path after a bracketed connection name', async () => {
        await connectionToken.handle(params({ variableName: "connections['mcp-x']['props']['token']" }))

        expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ script: "connection['props']['token']" }))
    })

    it('reads a dotted path after a dotted connection name', async () => {
        await connectionToken.handle(params({ variableName: 'connections.mcpx.props.token' }))

        expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ script: 'connection.props.token' }))
    })
})

function params({ variableName }: { variableName: string }) {
    return { variableName, engineToken: 't', projectId: 'p', apiUrl: 'http://api', censoredInput: false, contextVersion: undefined }
}

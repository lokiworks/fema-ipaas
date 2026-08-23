import { ExecutionError, ExecutionErrorType } from '@fema-ipaas/shared'
import { connectorProtocol } from '../../../src/lib/core/connector/connector-protocol'

describe('connector protocol', () => {
    it('keeps the execution error type across the boundary', () => {
        for (const type of [ExecutionErrorType.ENGINE, ExecutionErrorType.USER]) {
            const restored = connectorProtocol.deserializeError(connectorProtocol.serializeError(new ExecutionError('BoomError', 'boom', type)))

            expect(restored).toBeInstanceOf(ExecutionError)
            expect(restored).toMatchObject({ name: 'BoomError', message: 'boom', type })
        }
    })

    it('keeps http details and the constructor name of a plain connector error', () => {
        class HttpError extends Error {
            constructor(readonly status: number) {
                super('request failed')
            }
        }

        const restored = connectorProtocol.deserializeError(connectorProtocol.serializeError(new HttpError(404)))

        expect(restored).not.toBeInstanceOf(ExecutionError)
        expect(restored).toMatchObject({ name: 'HttpError', message: 'request failed', status: 404 })
    })

    it('falls back to a message for a thrown non-error', () => {
        expect(connectorProtocol.serializeError('just a string')).toEqual({ message: 'just a string' })
    })

    it('drops functions and promises from a result but keeps buffers and dates', () => {
        const date = new Date('2020-01-01T00:00:00.000Z')

        const transferable = connectorProtocol.toTransferable({
            keep: Buffer.from('bytes'),
            when: date,
            nested: { fn: () => undefined, pending: Promise.resolve(1), value: 2 },
            list: [1, () => undefined, 'three'],
        })

        expect(transferable).toEqual({
            keep: Buffer.from('bytes'),
            when: date,
            nested: { value: 2 },
            list: [1, undefined, 'three'],
        })
    })
})

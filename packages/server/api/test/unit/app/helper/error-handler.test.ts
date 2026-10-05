import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../../../../src/app/helper/error-handler'

type Captured = {
    statusCode: number | undefined
    body: unknown
    logged: unknown[]
}

async function handle({ error }: { error: FastifyError | ApplicationError }): Promise<Captured> {
    const captured: Captured = { statusCode: undefined, body: undefined, logged: [] }
    const reply = {
        status(code: number) {
            captured.statusCode = code
            return this
        },
        send(body: unknown) {
            captured.body = body
            return Promise.resolve()
        },
    }
    const request = { log: { error: vi.fn((...args: unknown[]) => captured.logged.push(args)) } }
    await errorHandler(error as FastifyError, request as unknown as FastifyRequest, reply as unknown as FastifyReply)
    return captured
}

function databaseError({ code, message }: { code: string, message: string }): FastifyError {
    return Object.assign(new Error(message), { code }) as FastifyError
}

describe('errorHandler', () => {
    it('does not send database error text to the client for an unexpected failure', async () => {
        const captured = await handle({ error: databaseError({ code: '42P01', message: 'relation "flow_run_secret" does not exist' }) })
        expect(captured.statusCode).toBe(500)
        expect(JSON.stringify(captured.body)).not.toContain('flow_run_secret')
        expect(JSON.stringify(captured.body)).not.toContain('42P01')
        expect(captured.body).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' })
        expect(captured.logged).toHaveLength(1)
    })

    it('answers 400 and hides the database text when a value does not fit its column type', async () => {
        const captured = await handle({ error: databaseError({ code: '22007', message: 'invalid input syntax for type timestamp with time zone: "notadate"' }) })
        expect(captured.statusCode).toBe(400)
        expect(JSON.stringify(captured.body)).not.toContain('timestamp')
        expect(captured.logged).toHaveLength(0)
    })

    it('keeps validation messages of client errors', async () => {
        const error = Object.assign(new Error('querystring/limit Too small: expected number to be >=1'), { statusCode: 400, code: 'FST_ERR_VALIDATION' }) as FastifyError
        const captured = await handle({ error })
        expect(captured.statusCode).toBe(400)
        expect(captured.body).toBe(error)
    })

    it('keeps the application error shape', async () => {
        const captured = await handle({ error: new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { message: 'x' } }) })
        expect(captured.statusCode).toBe(404)
        expect(captured.body).toEqual({ code: ErrorCode.ENTITY_NOT_FOUND, params: { message: 'x' } })
    })
})

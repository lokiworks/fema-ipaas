import { FastifyInstance } from 'fastify'
import { createTestContext, TestContext, TestContextParams } from './test-context'

export function describeWithAuth(
    name: string,
    getApp: () => FastifyInstance,
    fn: (setup: () => Promise<TestContext>) => void,
    params?: TestContextParams,
): void {
    describe(`${name} [USER]`, () => {
        fn(() => createTestContext(getApp(), params))
    })
}

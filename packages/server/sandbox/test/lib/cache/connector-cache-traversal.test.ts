import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApplicationError, ErrorCode } from '@fema/core-utils'
import { describe, expect, it, vi } from 'vitest'
import type { WorkerToApiContract } from '@fema/shared'
import type { ApLogger } from '@fema/server-utils'
import { connectorCache } from '../../../src/lib/cache/connectors/connector-cache'

const fakeLog = {
    level: 'silent',
    silent: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
} as unknown as ApLogger

const fakeGetSettings = () => ({
    EXECUTION_MODE: 'UNSANDBOXED',
    DEV_CONNECTORS: [] as string[],
    ENVIRONMENT: 'production',
    REUSE_SANDBOX: undefined,
    WORKFLOW_TIMEOUT_SECONDS: 600,
    MAX_FILE_SIZE_MB: 10,
    MAX_EXECUTION_LOG_SIZE_MB: 10,
    NETWORK_MODE: 'UNRESTRICTED' as never,
    SANDBOX_MEMORY_LIMIT: '1048576',
    SANDBOX_PROPAGATED_ENV_VARS: [] as string[],
    SSRF_ALLOW_LIST: [] as string[],
})

describe('connector-cache connectorName path traversal', () => {
    const getConnectorMock = vi.fn()
    const apiClient = { getConnector: getConnectorMock } as unknown as WorkerToApiContract
    const basePath = join(tmpdir(), `connector-cache-test-${randomUUID()}`)

    it.each([
        '../../common/node_modules/x',
        '../../../usr/local/lib',
        '..',
        '@fema/..',
    ])('rejects a traversal connectorName %j before any fetch', async (connectorName) => {
        getConnectorMock.mockReset()
        let thrown: unknown
        try {
            await connectorCache(fakeLog, apiClient, basePath, fakeGetSettings).getConnector({
                connectorName,
                connectorVersion: '1.0.0',
                tenantId: 'tenant-1',
            })
        }
        catch (error) {
            thrown = error
        }
        if (!(thrown instanceof ApplicationError)) {
            throw new Error(`expected an ApplicationError, got: ${String(thrown)}`)
        }
        expect(thrown.error.code).toBe(ErrorCode.VALIDATION)
        if (thrown.error.code === ErrorCode.VALIDATION) {
            expect(thrown.error.params.message).toContain('connectorName')
        }
        expect(getConnectorMock).not.toHaveBeenCalled()
    })
})

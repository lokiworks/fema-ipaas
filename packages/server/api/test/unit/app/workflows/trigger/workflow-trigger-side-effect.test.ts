import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { TriggerStrategy } from '@fema-ipaas/connector-sdk'
import { ApEnvironment, EngineResponseStatus, TriggerSourceScheduleType } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSubmitAndWaitForResponse = vi.fn()
const mockGetTenantId = vi.fn().mockResolvedValue('tenant-1')
const mockDeleteListeners = vi.fn()
const mockRemoveRepeatingJob = vi.fn()
const mockAddJob = vi.fn()

vi.mock('../../../../../src/app/helper/system/system', () => ({
    system: {
        getOrThrow: vi.fn().mockReturnValue(ApEnvironment.PRODUCTION),
        getNumber: vi.fn().mockReturnValue(5),
        getNumberOrThrow: vi.fn().mockReturnValue(5),
    },
}))

vi.mock('../../../../../src/app/workspace/workspace-service', () => ({
    workspaceService: vi.fn(() => ({
        getTenantId: mockGetTenantId,
    })),
}))

vi.mock('../../../../../src/app/workers/user-interaction-watcher', () => ({
    userInteractionWatcher: {
        submitAndWaitForResponse: (...args: unknown[]) => mockSubmitAndWaitForResponse(...args),
    },
}))

vi.mock('../../../../../src/app/workers/job-queue/job-queue', () => ({
    jobQueue: vi.fn(() => ({
        removeRepeatingJob: mockRemoveRepeatingJob,
        add: mockAddJob,
    })),
    JobType: { ONE_TIME: 'ONE_TIME', REPEATING: 'REPEATING' },
}))

vi.mock('../../../../../src/app/trigger/app-event-routing/app-event-routing.service', () => ({
    appEventRoutingService: {
        deleteListeners: (...args: unknown[]) => mockDeleteListeners(...args),
    },
}))

import { system } from '../../../../../src/app/helper/system/system'
import { workflowTriggerSideEffect } from '../../../../../src/app/trigger/trigger-source/workflow-trigger-side-effect'

const mockLog = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as any

const BASE_PARAMS = {
    workflowId: 'workflow-1',
    workflowVersionId: 'fv-1',
    connectorName: '@fema-ipaas/connector-test',
    workspaceId: 'proj-1',
    simulate: false,
}

function makePollingTrigger() {
    return {
        name: 'test_trigger',
        displayName: 'Test Trigger',
        description: 'Test',
        props: {},
        requireAuth: false,
        type: TriggerStrategy.POLLING,
        sampleData: {},
        testStrategy: 'TEST_FUNCTION',
    } as any
}

function makeManualTrigger() {
    return {
        ...makePollingTrigger(),
        type: TriggerStrategy.MANUAL,
    }
}

function okEngineResponse() {
    return {
        status: EngineResponseStatus.OK,
        response: {},
        error: undefined,
    }
}

function failedEngineResponse() {
    return {
        status: EngineResponseStatus.ERROR,
        response: undefined,
        error: 'Engine failed',
    }
}

describe('workflowTriggerSideEffect', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetTenantId.mockResolvedValue('tenant-1')
    })

    describe('enable', () => {
        it('should default polling schedule to a rolling interval', async () => {
            mockSubmitAndWaitForResponse.mockResolvedValue(okEngineResponse())
            const expectedSchedule = {
                type: TriggerSourceScheduleType.INTERVAL,
                intervalMs: 5 * 60_000,
            }

            const result = await workflowTriggerSideEffect(mockLog).enable({
                ...BASE_PARAMS,
                connectorTrigger: makePollingTrigger(),
            })

            expect(result.scheduleOptions).toEqual(expectedSchedule)
            expect(mockAddJob).toHaveBeenCalledWith(expect.objectContaining({
                scheduleOptions: expectedSchedule,
            }))
        })

        it('should honor poll interval overrides that do not divide 60', async () => {
            mockSubmitAndWaitForResponse.mockResolvedValue(okEngineResponse())
            vi.mocked(system.getNumberOrThrow).mockReturnValueOnce(45)

            const result = await workflowTriggerSideEffect(mockLog).enable({
                ...BASE_PARAMS,
                connectorTrigger: makePollingTrigger(),
            })

            expect(result.scheduleOptions).toEqual({
                type: TriggerSourceScheduleType.INTERVAL,
                intervalMs: 45 * 60_000,
            })
        })

        it('should keep engine-provided schedule options untouched', async () => {
            const engineSchedule = {
                type: TriggerSourceScheduleType.CRON_EXPRESSION,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            }
            mockSubmitAndWaitForResponse.mockResolvedValue({
                status: EngineResponseStatus.OK,
                response: { scheduleOptions: engineSchedule },
                error: undefined,
            })

            const result = await workflowTriggerSideEffect(mockLog).enable({
                ...BASE_PARAMS,
                connectorTrigger: makePollingTrigger(),
            })

            expect(result.scheduleOptions).toEqual(engineSchedule)
        })
    })

    describe('disable', () => {
        it('should complete successfully when engine responds OK', async () => {
            mockSubmitAndWaitForResponse.mockResolvedValue(okEngineResponse())

            await workflowTriggerSideEffect(mockLog).disable({
                ...BASE_PARAMS,
                connectorTrigger: makeManualTrigger(),
                ignoreError: false,
            })

            expect(mockSubmitAndWaitForResponse).toHaveBeenCalledOnce()
        })

        it('should throw when engine response is bad and ignoreError is false', async () => {
            mockSubmitAndWaitForResponse.mockResolvedValue(failedEngineResponse())

            await expect(
                workflowTriggerSideEffect(mockLog).disable({
                    ...BASE_PARAMS,
                    connectorTrigger: makeManualTrigger(),
                    ignoreError: false,
                }),
            ).rejects.toThrow(ApplicationError)
        })

        it('should not throw when engine response is bad and ignoreError is true', async () => {
            mockSubmitAndWaitForResponse.mockResolvedValue(failedEngineResponse())

            await workflowTriggerSideEffect(mockLog).disable({
                ...BASE_PARAMS,
                connectorTrigger: makeManualTrigger(),
                ignoreError: true,
            })
        })

        it('should throw when submitAndWaitForResponse throws and ignoreError is false', async () => {
            mockSubmitAndWaitForResponse.mockRejectedValue(
                new ApplicationError({
                    code: ErrorCode.ENGINE_OPERATION_FAILURE,
                    params: { message: 'Worker did not respond within the safety timeout' },
                }),
            )

            await expect(
                workflowTriggerSideEffect(mockLog).disable({
                    ...BASE_PARAMS,
                    connectorTrigger: makeManualTrigger(),
                    ignoreError: false,
                }),
            ).rejects.toThrow(ApplicationError)
        })

        it('should not throw when submitAndWaitForResponse throws and ignoreError is true', async () => {
            mockSubmitAndWaitForResponse.mockRejectedValue(
                new ApplicationError({
                    code: ErrorCode.ENGINE_OPERATION_FAILURE,
                    params: { message: 'Worker did not respond within the safety timeout' },
                }),
            )

            await workflowTriggerSideEffect(mockLog).disable({
                ...BASE_PARAMS,
                connectorTrigger: makeManualTrigger(),
                ignoreError: true,
            })

            expect(mockLog.warn).toHaveBeenCalledWith(
                expect.objectContaining({ workflow: { id: 'workflow-1' } }),
                expect.stringContaining('Ignored error'),
            )
        })

        it('should still remove repeating job for polling trigger when engine call fails and ignoreError is true', async () => {
            mockSubmitAndWaitForResponse.mockRejectedValue(new Error('timeout'))

            await workflowTriggerSideEffect(mockLog).disable({
                ...BASE_PARAMS,
                connectorTrigger: makePollingTrigger(),
                ignoreError: true,
            })

            expect(mockRemoveRepeatingJob).toHaveBeenCalledWith({
                workflowVersionId: 'fv-1',
            })
        })

        it('should still delete app event listeners when engine call fails and ignoreError is true', async () => {
            mockSubmitAndWaitForResponse.mockRejectedValue(new Error('timeout'))

            await workflowTriggerSideEffect(mockLog).disable({
                ...BASE_PARAMS,
                connectorTrigger: {
                    ...makePollingTrigger(),
                    type: TriggerStrategy.APP_WEBHOOK,
                },
                ignoreError: true,
            })

            expect(mockDeleteListeners).toHaveBeenCalledWith({
                workspaceId: 'proj-1',
                workflowId: 'workflow-1',
            })
        })
    })
})

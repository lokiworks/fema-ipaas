import { MachineInformation, WorkerGroupScope, WorkerMachineStatus, WorkerMachineType } from '@fema/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerMachine, workerMachineCache } from '../../../../../src/app/workers/machine/machine-cache'
import { machineService } from '../../../../../src/app/workers/machine/machine-service'

let inMemoryStore: Map<string, WorkerMachine>

vi.mock('../../../../../src/app/workers/machine/machine-cache', () => ({
    workerMachineCache: () => ({
        async find(): Promise<WorkerMachine[]> {
            return Array.from(inMemoryStore.values())
        },
        async delete(ids: string[]): Promise<void> {
            for (const id of ids) {
                inMemoryStore.delete(id)
            }
        },
        async upsert(worker: { id: string } & Partial<Omit<WorkerMachine, 'id'>>): Promise<void> {
            const now = new Date().toISOString()
            const existing = inMemoryStore.get(worker.id)
            if (existing) {
                inMemoryStore.set(worker.id, { ...existing, ...worker, updated: now })
            }
            else {
                inMemoryStore.set(worker.id, { ...worker, updated: now, created: now } as WorkerMachine)
            }
        },
    }),
}))

const mockGetWorkerGroupId = vi.fn()

vi.mock('../../../../../src/app/ee/tenant/tenant-plan/worker-group.service', () => ({
    workerGroupService: () => ({
        getWorkerGroupId: (...args: unknown[]) => mockGetWorkerGroupId(...args),
    }),
}))

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
} as never

function fakeMachineInfo(workerId: string): MachineInformation {
    return {
        workerId,
        cpuUsagePercentage: 0,
        ramUsagePercentage: 0,
        totalAvailableRamInBytes: 0,
        totalCpuCores: 1,
        ip: '127.0.0.1',
        diskInfo: { total: 100, free: 50, used: 50, percentage: 50 },
        workerProps: {},
    }
}

describe('machineService.list — tenant filtering', () => {
    beforeEach(() => {
        mockGetWorkerGroupId.mockReset()
        inMemoryStore = new Map()
    })

    it('should return shared workers for any tenant', async () => {
        mockGetWorkerGroupId.mockResolvedValue(null)
        await workerMachineCache().upsert({
            id: 'shared-1',
            information: fakeMachineInfo('shared-1'),
            type: 'SHARED',
        })

        const result = await machineService(mockLogger).list('tenant-A')

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('shared-1')
        expect(result[0].type).toBe(WorkerMachineType.SHARED)
        expect(result[0].status).toBe(WorkerMachineStatus.ONLINE)
    })

    it('should return dedicated workers only for the matching tenant', async () => {
        mockGetWorkerGroupId.mockImplementation(({ tenantId }: { tenantId: string }) => {
            if (tenantId === 'tenant-A') return Promise.resolve('group-A')
            if (tenantId === 'tenant-B') return Promise.resolve('group-B')
            return Promise.resolve(null)
        })

        await workerMachineCache().upsert({
            id: 'dedicated-A',
            information: fakeMachineInfo('dedicated-A'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-A',
        })

        await workerMachineCache().upsert({
            id: 'dedicated-B',
            information: fakeMachineInfo('dedicated-B'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-B',
        })

        const resultA = await machineService(mockLogger).list('tenant-A')
        expect(resultA).toHaveLength(1)
        expect(resultA[0].id).toBe('dedicated-A')
        expect(resultA[0].type).toBe(WorkerMachineType.DEDICATED)

        const resultB = await machineService(mockLogger).list('tenant-B')
        expect(resultB).toHaveLength(1)
        expect(resultB[0].id).toBe('dedicated-B')
    })

    it('should not return other tenants dedicated workers', async () => {
        mockGetWorkerGroupId.mockResolvedValue(null)
        await workerMachineCache().upsert({
            id: 'dedicated-other',
            information: fakeMachineInfo('dedicated-other'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-other',
        })

        const result = await machineService(mockLogger).list('tenant-mine')
        expect(result).toHaveLength(0)
    })

    it('should return only dedicated workers when tenant has a worker group', async () => {
        mockGetWorkerGroupId.mockImplementation(({ tenantId }: { tenantId: string }) => {
            if (tenantId === 'tenant-X') return Promise.resolve('group-X')
            return Promise.resolve(null)
        })

        await workerMachineCache().upsert({
            id: 'shared-1',
            information: fakeMachineInfo('shared-1'),
            type: 'SHARED',
        })

        await workerMachineCache().upsert({
            id: 'dedicated-mine',
            information: fakeMachineInfo('dedicated-mine'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-X',
        })

        await workerMachineCache().upsert({
            id: 'dedicated-other',
            information: fakeMachineInfo('dedicated-other'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-Y',
        })

        const result = await machineService(mockLogger).list('tenant-X')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('dedicated-mine')
        expect(result[0].type).toBe(WorkerMachineType.DEDICATED)
    })

    it('should return shared workers when tenant has no worker group', async () => {
        mockGetWorkerGroupId.mockResolvedValue(null)

        await workerMachineCache().upsert({
            id: 'shared-1',
            information: fakeMachineInfo('shared-1'),
            type: 'SHARED',
        })

        await workerMachineCache().upsert({
            id: 'dedicated-other',
            information: fakeMachineInfo('dedicated-other'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.TENANT,
            workerGroupId: 'group-Y',
        })

        const result = await machineService(mockLogger).list('tenant-no-group')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('shared-1')
        expect(result[0].type).toBe(WorkerMachineType.SHARED)
    })

    it('should return workspace-scope workers to any tenant', async () => {
        mockGetWorkerGroupId.mockResolvedValue(null)

        await workerMachineCache().upsert({
            id: 'workspace-worker',
            information: fakeMachineInfo('workspace-worker'),
            type: 'DEDICATED',
            workerGroupScope: WorkerGroupScope.WORKSPACE,
            workerGroupId: '1cpu_machine',
        })

        const result = await machineService(mockLogger).list('any-tenant');
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('workspace-worker')
        expect(result[0].workerGroupScope).toBe(WorkerGroupScope.WORKSPACE)
    })

    it('should include legacy workers with no type as shared', async () => {
        mockGetWorkerGroupId.mockResolvedValue(null)
        await workerMachineCache().upsert({
            id: 'legacy-worker',
            information: fakeMachineInfo('legacy-worker'),
        })

        const result = await machineService(mockLogger).list('any-tenant')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('legacy-worker')
        expect(result[0].type).toBe(WorkerMachineType.SHARED)
    })
})

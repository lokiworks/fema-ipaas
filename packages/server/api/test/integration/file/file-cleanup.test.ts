import { FileCompression, FileLocation, FileType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { In } from 'typeorm'
import { fileRepo, fileService } from '../../../../src/app/file/file.service'
import { db } from '../../../helpers/db'
import { createMockFile, createMockWorkspace, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    process.env.FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS = '5'
    app = await setupTestEnvironment()
})

afterAll(async () => {
    delete process.env.FEMA_PAUSED_WORKFLOW_TIMEOUT_DAYS
    await teardownTestEnvironment()
})

const daysAgo = (days: number): string => dayjs().subtract(days, 'days').toISOString()

const saveLogFile = async ({ workspaceId, tenantId, created }: { workspaceId: string | null, tenantId: string, created: string }): Promise<string> => {
    const file = createMockFile({
        workspaceId,
        tenantId,
        created,
        type: FileType.EXECUTION_LOG,
        location: FileLocation.DB,
        compression: FileCompression.NONE,
    })
    await db.save('file', file)
    return file.id
}

describe('fileService.deleteStaleBulk', () => {
    it('applies shorter per-workspace retention and treats the instance value as a ceiling', async () => {
        const { mockOwner, mockTenant, mockWorkspace: defaultWorkspace } = await mockAndSaveBasicSetup()

        const shortRetentionWorkspace = createMockWorkspace({
            ownerId: mockOwner.id,
            tenantId: mockTenant.id,
            executionDataRetentionDays: 7,
        })
        const aboveCeilingWorkspace = createMockWorkspace({
            ownerId: mockOwner.id,
            tenantId: mockTenant.id,
            executionDataRetentionDays: 60,
        })
        const belowFloorWorkspace = createMockWorkspace({
            ownerId: mockOwner.id,
            tenantId: mockTenant.id,
            executionDataRetentionDays: 3,
        })
        await db.save('workspace', [shortRetentionWorkspace, aboveCeilingWorkspace, belowFloorWorkspace])

        const defaultWorkspaceStale = await saveLogFile({ workspaceId: defaultWorkspace.id, tenantId: mockTenant.id, created: daysAgo(40) })
        const defaultWorkspaceFresh = await saveLogFile({ workspaceId: defaultWorkspace.id, tenantId: mockTenant.id, created: daysAgo(10) })
        const shortWorkspaceStale = await saveLogFile({ workspaceId: shortRetentionWorkspace.id, tenantId: mockTenant.id, created: daysAgo(10) })
        const shortWorkspaceFresh = await saveLogFile({ workspaceId: shortRetentionWorkspace.id, tenantId: mockTenant.id, created: daysAgo(3) })
        const aboveCeilingStale = await saveLogFile({ workspaceId: aboveCeilingWorkspace.id, tenantId: mockTenant.id, created: daysAgo(40) })
        const aboveCeilingFresh = await saveLogFile({ workspaceId: aboveCeilingWorkspace.id, tenantId: mockTenant.id, created: daysAgo(10) })
        const belowFloorStale = await saveLogFile({ workspaceId: belowFloorWorkspace.id, tenantId: mockTenant.id, created: daysAgo(10) })
        const belowFloorClamped = await saveLogFile({ workspaceId: belowFloorWorkspace.id, tenantId: mockTenant.id, created: daysAgo(4) })
        const orphanStale = await saveLogFile({ workspaceId: null, tenantId: mockTenant.id, created: daysAgo(40) })
        const orphanFresh = await saveLogFile({ workspaceId: null, tenantId: mockTenant.id, created: daysAgo(10) })

        await fileService(app!.log).deleteStaleBulk([FileType.EXECUTION_LOG])

        const allIds = [
            defaultWorkspaceStale,
            defaultWorkspaceFresh,
            shortWorkspaceStale,
            shortWorkspaceFresh,
            aboveCeilingStale,
            aboveCeilingFresh,
            belowFloorStale,
            belowFloorClamped,
            orphanStale,
            orphanFresh,
        ]
        const survivingFiles = await fileRepo().findBy({ id: In(allIds) })
        const survivingIds = survivingFiles.map(file => file.id).sort()

        expect(survivingIds).toEqual([
            defaultWorkspaceFresh,
            shortWorkspaceFresh,
            aboveCeilingFresh,
            belowFloorClamped,
            orphanFresh,
        ].sort())
    })
})

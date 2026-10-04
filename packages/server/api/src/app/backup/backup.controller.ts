import { BackupListItem, BackupOverview, BackupRecord, BackupSettings, BackupTrigger, CreateBackupRequestBody, PrincipalType, RestorePrecheck, UpdateBackupSettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { tenantUtils } from '../tenant/tenant.utils'
import { backupService } from './backup.service'
import { restorePrecheckService } from './restore-precheck.service'

export const backupController: FastifyPluginAsyncZod = async (app) => {
    app.get('/overview', OverviewRequest, async (request): Promise<BackupOverview> => {
        await tenantUtils.assertPrimaryTenant({ request })
        return backupService(request.log).getOverview({ tenantId: request.principal.tenant.id })
    })

    app.get('/', ListRequest, async (request): Promise<BackupListItem[]> => {
        await tenantUtils.assertPrimaryTenant({ request })
        return backupService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        await tenantUtils.assertPrimaryTenant({ request })
        const record = await backupService(request.log).start({
            tenantId: request.principal.tenant.id,
            trigger: BackupTrigger.MANUAL,
            createdBy: request.principal.id,
            note: request.body.note,
        })
        await reply.status(StatusCodes.CREATED).send(record)
    })

    app.get('/settings', GetSettingsRequest, async (request): Promise<BackupSettings> => {
        await tenantUtils.assertPrimaryTenant({ request })
        return backupService(request.log).getSettings({ tenantId: request.principal.tenant.id })
    })

    app.post('/settings', UpdateSettingsRequest, async (request): Promise<BackupSettings> => {
        await tenantUtils.assertPrimaryTenant({ request })
        return backupService(request.log).updateSettings({ tenantId: request.principal.tenant.id, request: request.body })
    })

    app.get('/:id/restore-precheck', PrecheckRequest, async (request): Promise<RestorePrecheck> => {
        await tenantUtils.assertPrimaryTenant({ request })
        return restorePrecheckService(request.log).run({ tenantId: request.principal.tenant.id, id: request.params.id })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await tenantUtils.assertPrimaryTenant({ request })
        await backupService(request.log).remove({ tenantId: request.principal.tenant.id, id: request.params.id })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const adminOnly = {
    security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
}

const IdParams = z.object({ id: z.string() })

const OverviewRequest = {
    config: adminOnly,
    schema: { tags: ['backups'], response: { [StatusCodes.OK]: BackupOverview } },
}

const ListRequest = {
    config: adminOnly,
    schema: { tags: ['backups'], response: { [StatusCodes.OK]: z.array(BackupListItem) } },
}

const CreateRequest = {
    config: adminOnly,
    schema: {
        tags: ['backups'],
        description: 'Starts a backup on this server and returns the record straight away; poll the list for the result',
        body: CreateBackupRequestBody,
        response: { [StatusCodes.CREATED]: BackupRecord },
    },
}

const GetSettingsRequest = {
    config: adminOnly,
    schema: { tags: ['backups'], response: { [StatusCodes.OK]: BackupSettings } },
}

const UpdateSettingsRequest = {
    config: adminOnly,
    schema: { tags: ['backups'], body: UpdateBackupSettingsRequestBody, response: { [StatusCodes.OK]: BackupSettings } },
}

const PrecheckRequest = {
    config: adminOnly,
    schema: {
        tags: ['backups'],
        description: 'Checks whether a backup can be restored. Never changes data; the restore itself is run by an administrator on the server',
        params: IdParams,
        response: { [StatusCodes.OK]: RestorePrecheck },
    },
}

const DeleteRequest = {
    config: adminOnly,
    schema: { tags: ['backups'], params: IdParams, response: { [StatusCodes.NO_CONTENT]: z.never() } },
}

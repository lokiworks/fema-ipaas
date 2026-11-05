import { BackupListItem, BackupOverview, BackupRecord, BackupSettings, BackupTrigger, CreateBackupRequestBody, PrincipalType, RestorePrecheck, UpdateBackupSettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { instanceOperator } from '../operator/instance-operator'
import { instanceScope } from '../operator/instance-scope'
import { backupService } from './backup.service'
import { restorePrecheckService } from './restore-precheck.service'

export const backupController: FastifyPluginAsyncZod = async (app) => {
    app.get('/overview', OverviewRequest, async (request): Promise<BackupOverview> => {
        await instanceOperator.assert({ request })
        return backupService(request.log).getOverview({ tenantId: await instanceScope.requireTenantId() })
    })

    app.get('/', ListRequest, async (request): Promise<BackupListItem[]> => {
        await instanceOperator.assert({ request })
        return backupService(request.log).list({ tenantId: await instanceScope.requireTenantId() })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        await instanceOperator.assert({ request })
        const record = await backupService(request.log).start({
            tenantId: await instanceScope.requireTenantId(),
            trigger: BackupTrigger.MANUAL,
            createdBy: request.principal.id,
            note: request.body.note,
        })
        await reply.status(StatusCodes.CREATED).send(record)
    })

    app.get('/settings', GetSettingsRequest, async (request): Promise<BackupSettings> => {
        await instanceOperator.assert({ request })
        return backupService(request.log).getSettings({ tenantId: await instanceScope.requireTenantId() })
    })

    app.post('/settings', UpdateSettingsRequest, async (request): Promise<BackupSettings> => {
        await instanceOperator.assert({ request })
        return backupService(request.log).updateSettings({ tenantId: await instanceScope.requireTenantId(), request: request.body })
    })

    app.get('/:id/restore-precheck', PrecheckRequest, async (request): Promise<RestorePrecheck> => {
        await instanceOperator.assert({ request })
        return restorePrecheckService(request.log).run({ tenantId: await instanceScope.requireTenantId(), id: request.params.id })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await instanceOperator.assert({ request })
        await backupService(request.log).remove({ tenantId: await instanceScope.requireTenantId(), id: request.params.id })
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

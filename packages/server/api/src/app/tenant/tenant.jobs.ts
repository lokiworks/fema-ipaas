import { FastifyBaseLogger } from 'fastify'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { tenantPurgeService } from './tenant-purge.service'

export const tenantBackgroundJobs = (log: FastifyBaseLogger) => ({

    hardDeleteTenantHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_TENANT>) => {
        const { tenantId } = data
        log.info({ tenant: { id: tenantId } }, '[hardDeleteTenantHandler] Purging tenant')
        await tenantPurgeService(log).purge({ tenantId })
    },

})

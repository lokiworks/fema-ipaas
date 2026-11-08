import { isNil } from '@fema-ipaas/core-utils'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { reconciliationSideEffects } from './reconciliation-side-effects'
import { reconciliationController } from './reconciliation.controller'
import { reconciliationRuleRepo, reconciliationService } from './reconciliation.service'

export const reconciliationModule: FastifyPluginAsyncZod = async (app) => {
    systemJobHandlers.registerJobHandler(SystemJobName.RECONCILE, async ({ ruleId, projectId, runId }) => {
        if (runId) {
            await reconciliationService(app.log).run({ runId, projectId })
        }
        else {
            const rule = await reconciliationRuleRepo().findOneBy({ id: ruleId, projectId })
            if (isNil(rule)) {
                app.log.info({ project: { id: projectId }, reconciliationRule: { id: ruleId } }, '[reconcile] Rule no longer exists, removing its schedule')
                await reconciliationSideEffects(app.log).removeSchedules({ ruleIds: [ruleId] })
                return
            }
            if (rule.enabled) await reconciliationService(app.log).start({ id: ruleId, projectId })
        }
    })
    const enabledRules = await reconciliationRuleRepo().find({ where: { enabled: true }, select: ['id', 'projectId'] })
    for (const ref of enabledRules) {
        const rule = await reconciliationService(app.log).getRule(ref)
        await reconciliationSideEffects(app.log).syncSchedule(rule)
    }
    await app.register(reconciliationController, { prefix: '/v1/reconciliation' })
}

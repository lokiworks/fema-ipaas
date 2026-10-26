import { IssueActivityType, IssueKind, ReconciliationRule } from '@fema-ipaas/shared'
import { isValidCron } from 'cron-validator'
import { FastifyBaseLogger } from 'fastify'
import { alertDispatcher } from '../alert/alert-dispatcher'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobsQueue, systemJobsSchedule } from '../helper/system-jobs/system-job'
import { issueRepo, issueService } from '../issue/issue.service'
import { projectService } from '../project/project-service'
import { reconciliationRuleRepo } from './reconciliation.service'

export const reconciliationSideEffects = (log: FastifyBaseLogger) => ({
    async syncSchedule(rule: ReconciliationRule): Promise<void> {
        const jobId = `recon-${rule.id}`
        if (!rule.enabled) {
            await systemJobsQueue.removeJobScheduler(jobId)
            return
        }
        if (!isValidCron(rule.cron)) throw new Error('reconciliation.invalidCron')
        await systemJobsSchedule(log).upsertJob({ job: { name: SystemJobName.RECONCILE, jobId, data: { ruleId: rule.id, projectId: rule.projectId } }, schedule: { type: 'repeated', cron: rule.cron } })
    },
    async onRuleDeleted(rule: ReconciliationRule): Promise<void> {
        await systemJobsQueue.removeJobScheduler(`recon-${rule.id}`)
        await issueService(log).recordReconciliation({ projectId: rule.projectId, ruleId: rule.id, workflowId: rule.workflowId, name: rule.name, openCount: 0 })
    },
    async onWorkflowDeleted({ workflowId, projectId }: { workflowId: string, projectId: string }): Promise<void> {
        const rules = await reconciliationRuleRepo().findBy({ workflowId, projectId })
        for (const rule of rules) {
            await systemJobsQueue.removeJobScheduler(`recon-${rule.id}`)
            await issueService(log).recordReconciliation({ projectId, ruleId: rule.id, workflowId, name: rule.name, openCount: 0 })
        }
    },
    async recordIgnored({ projectId, ruleIds, differenceIds, reason, actorId }: { projectId: string, ruleIds: string[], differenceIds: string[], reason: string, actorId: string | null }): Promise<void> {
        for (const ruleId of ruleIds) {
            const issue = await issueRepo().findOneBy({ projectId, kind: IssueKind.RECONCILIATION, message: `reconciliation:${ruleId}` })
            if (issue) await issueService(log).recordActivity({ issue, type: IssueActivityType.NOTE, actorId, data: { text: reason, action: 'RECONCILIATION_IGNORED', differenceIds } })
        }
    },
    async recordIssue({ rule, openCount }: { rule: ReconciliationRule, openCount: number }): Promise<void> {
        const outcome = await issueService(log).recordReconciliation({ projectId: rule.projectId, ruleId: rule.id, name: rule.name, workflowId: rule.workflowId, openCount })
        if (outcome?.counted) {
            await alertDispatcher(log).onIssueRecorded({ ...outcome, tenantId: await projectService(log).getTenantId(rule.projectId) })
        }
    },
})

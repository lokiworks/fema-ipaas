import { isNil, ProjectId, TenantId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { ConnectorTriggerSettings, Execution, ExecutionStatus, RunConcurrencyTicket, RunEnvironment, ScheduleOverlapPolicy, scheduleUtils, triggerRunSettingsUtils, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, MoreThan } from 'typeorm'
import { privacyService } from '../privacy/privacy.service'
import { executionRepo } from '../workflows/execution/execution-service'
import { dedupeService } from './dedupe-service'
import { dedupedEventService } from './deduped-event/deduped-event.service'
import { holidayCalendarService } from './holiday-calendar/holiday-calendar.service'
import { triggerRunPolicyUtils } from './trigger-run-policy-utils'

export const triggerRunPolicy = (log: FastifyBaseLogger) => ({
    async startRuns({ workflowVersion, projectId, tenantId, payloads, startRun }: StartRunsParams): Promise<Execution[]> {
        const settings = workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR ? workflowVersion.trigger.settings : undefined
        const workflowId = workflowVersion.workflowId
        if (payloads.length === 0) {
            return []
        }
        if (!isNil(settings)) {
            const skipReason = await scheduleSkipReason({ settings, workflowId, tenantId, log })
            if (!isNil(skipReason)) {
                log.info({ workflow: { id: workflowId }, reason: skipReason }, '[triggerRunPolicy#startRuns] Skipped scheduled run')
                return []
            }
        }
        const { accepted, duplicates } = await dedupeService.claimWorkflowDedupe({ workflowId, settings: settings?.dedupe, payloads })
        const enqueuedAt = Date.now()
        const started = await Promise.all(accepted.map(async ({ payload, claim }, index) => {
            const execution = await startRun({
                payload,
                concurrency: triggerRunPolicyUtils.ticketFor({ settings, payload, enqueuedAt: enqueuedAt + index }),
                businessKey: triggerRunPolicyUtils.businessKeyOf({ settings, payload }),
            })
            if (!isNil(claim)) {
                await dedupeService.bindFirstExecution({ claim, executionId: execution.id })
            }
            return { execution, claim }
        }))
        if (duplicates.length > 0 && !isNil(settings?.dedupe)) {
            const retention = await privacyService(log).get({ tenantId })
            await dedupedEventService(log).record({
                retentionDays: retention.logRetentionDays,
                events: duplicates.map((duplicate) => ({
                    projectId,
                    workflowId,
                    workflowVersionId: workflowVersion.id,
                    keyHash: duplicate.keyHash,
                    keyPreview: duplicate.keyPreview,
                    keyPath: settings.dedupe?.keyPath ?? '',
                    windowSeconds: settings.dedupe?.windowSeconds ?? 0,
                    firstExecutionId: triggerRunPolicyUtils.firstExecutionIdOf({ duplicate, started }),
                })),
            })
        }
        return started.map(({ execution }) => execution)
    },
})

async function scheduleSkipReason({ settings, workflowId, tenantId, log }: ScheduleSkipParams): Promise<string | null> {
    if (!scheduleUtils.isScheduleConnector(settings.connectorName)) {
        return null
    }
    if (settings.skipHolidays === true) {
        const timezone = typeof settings.input['timezone'] === 'string' ? settings.input['timezone'] : 'UTC'
        const today = scheduleUtils.localDateOf({ instant: new Date(), timezone })
        if (await holidayCalendarService(log).isHoliday({ tenantId, date: today })) {
            return 'HOLIDAY'
        }
    }
    if (triggerRunSettingsUtils.overlapPolicyOf(settings) === ScheduleOverlapPolicy.SKIP) {
        const running = await executionRepo().exists({
            where: {
                workflowId,
                environment: RunEnvironment.PRODUCTION,
                status: In(UNFINISHED_STATUSES),
                created: MoreThan(dayjsUtil().subtract(OVERLAP_LOOKBACK_HOURS, 'hour').toISOString()),
            },
        })
        if (running) {
            return 'PREVIOUS_RUN_UNFINISHED'
        }
    }
    return null
}

const UNFINISHED_STATUSES = [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, ExecutionStatus.PAUSED]
const OVERLAP_LOOKBACK_HOURS = 24

type StartRunsParams = {
    workflowVersion: WorkflowVersion
    projectId: ProjectId
    tenantId: TenantId
    payloads: unknown[]
    startRun: (params: { payload: unknown, concurrency: RunConcurrencyTicket | undefined, businessKey: string | null }) => Promise<Execution>
}

type ScheduleSkipParams = {
    settings: ConnectorTriggerSettings
    workflowId: string
    tenantId: TenantId
    log: FastifyBaseLogger
}

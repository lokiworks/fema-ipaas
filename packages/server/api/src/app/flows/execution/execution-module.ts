import { isNil } from '@fema/core-utils'
import { ExecutionStatus, TelemetryEventName } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyPluginAsync } from 'fastify'
import { Between, EntityManager } from 'typeorm'
import { entitiesMustBeOwnedByCurrentWorkspace } from '../../authentication/authorization'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { telemetry } from '../../helper/telemetry.utils'
import { engineResponseWatcher } from '../../workers/engine-response-watcher'
import { executionController } from './execution-controller'
import { ExecutionEntity } from './execution-entity'
import { executionRepo, executionService } from './execution-service'
import { resumeController } from './waitpoint/resume-controller'
import { resumeService } from './waitpoint/resume-service'
import { waitpointController } from './waitpoint/waitpoint-controller'

const RUN_TELEMETRY_STATEMENT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const executionModule: FastifyPluginAsync = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)
    await app.register(executionController, { prefix: '/v1/executions' })
    await app.register(resumeController, { prefix: '/v1/executions' })
    await app.register(waitpointController, { prefix: '/v1/waitpoints' })
    systemJobHandlers.registerJobHandler(SystemJobName.RUN_TELEMETRY, async (_job: SystemJobData<SystemJobName.RUN_TELEMETRY>) => {
        if (!telemetry(app.log).isEnabled()) {
            return
        }
        app.log.info({
            name: SystemJobName.RUN_TELEMETRY,
        }, 'Run telemetry started')
        const startOfDay = dayjs().startOf('day').toISOString()
        const endOfDay = dayjs().endOf('day').toISOString()
        const workspaceFlowCounts = await executionRepo().manager.transaction(async (entityManager: EntityManager) => {
            await entityManager.query(`SET LOCAL statement_timeout = ${RUN_TELEMETRY_STATEMENT_TIMEOUT_MS}`)
            return entityManager.createQueryBuilder(ExecutionEntity, 'execution')
                .select('"workspaceId", "flowId", "environment", COUNT(*) as count')
                .where({
                    created: Between(startOfDay, endOfDay),
                })
                .groupBy('"workspaceId", "flowId", "environment"')
                .getRawMany()
        })
        for (const { workspaceId, flowId, environment, count } of workspaceFlowCounts) {
            app.log.info({
                workspace: { id: workspaceId },
                flow: { id: flowId },
                environment,
                count: parseInt(count, 10),
            }, 'Tracking flow run created')
            rejectedPromiseHandler(
                telemetry(app.log).trackWorkspace(workspaceId, {
                    name: TelemetryEventName.EXECUTION_CREATED,
                    payload: {
                        workspaceId,
                        flowId,
                        environment,
                        count: parseInt(count, 10),
                    },
                }),
                app.log,
            )
        }
    })
    await systemJobsSchedule(app.log).upsertJob({
        job: {
            name: SystemJobName.RUN_TELEMETRY,
            data: {},
            jobId: SystemJobName.RUN_TELEMETRY,
        },
        schedule: {
            type: 'repeated',
            cron: '50 23 * * *',
        },
    })
    systemJobHandlers.registerJobHandler(SystemJobName.RESUME_DELAY_WAITPOINT, async (data: SystemJobData<SystemJobName.RESUME_DELAY_WAITPOINT>) => {
        const execution = await executionService(app.log).getOne({ id: data.executionId, workspaceId: data.workspaceId })
        if (isNil(execution)) {
            app.log.info({ execution: { id: data.executionId }, waitpoint: { id: data.waitpointId } },
                '[RESUME_DELAY_WAITPOINT] Flow run no longer exists (expired/deleted), skipping')
            return
        }
        if (execution.status !== ExecutionStatus.PAUSED) {
            app.log.info({ execution: { id: data.executionId }, waitpoint: { id: data.waitpointId }, status: execution.status },
                '[RESUME_DELAY_WAITPOINT] Flow not PAUSED, skipping')
            return
        }
        app.log.info({ execution: { id: data.executionId }, waitpoint: { id: data.waitpointId } },
            '[RESUME_DELAY_WAITPOINT] Resuming flow')
        await resumeService(app.log).resumeFromWaitpoint({
            executionId: data.executionId,
            waitpointId: data.waitpointId,
            resumePayload: null,
        })
    })
    await engineResponseWatcher(app.log).init()
}

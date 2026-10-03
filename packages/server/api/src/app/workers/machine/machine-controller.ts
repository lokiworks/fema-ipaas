import { isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, createRpcServer, PrincipalType, WebsocketServerEvent, WorkerFleet, WorkerMachineHealthcheckRequest, WorkerToApiContract } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { websocketService } from '../../core/websockets.service'
import { applicationEvents } from '../../helper/application-events'
import { tenantUtils } from '../../tenant/tenant.utils'
import { parseWorkerGroupValue, QueueName } from '../job'
import { jobBroker } from '../job-queue/job-broker'
import { jobQueue } from '../job-queue/job-queue'
import { createHandlers } from '../rpc/worker-rpc-service'
import { machineService } from './machine-service'
import { workerFleetService } from './worker-fleet.service'

export const workerMachineController: FastifyPluginAsyncZod = async (app) => {

    websocketService.addListener(PrincipalType.WORKER, WebsocketServerEvent.FETCH_WORKER_SETTINGS, (socket) => {
        return async (request: WorkerMachineHealthcheckRequest, _principal, _projectId, callback?: (data: unknown) => void) => {
            const rawWorkerGroupValue = socket.handshake.auth?.workerGroupId
            const projectWorker = socket.handshake.auth?.projectWorker === true
            const assignment = parseWorkerGroupValue({ value: typeof rawWorkerGroupValue === 'string' ? rawWorkerGroupValue : undefined, projectWorker })
            const response = await machineService(app.log).onConnection(request, assignment)
            callback?.(response)
            createRpcServer<WorkerToApiContract>(socket, createHandlers(app.log, assignment, socket.id), app.log)
        }
    })

    websocketService.addListener(PrincipalType.WORKER, WebsocketServerEvent.DISCONNECT, (socket) => {
        return async (_request: unknown, _principal) => {
            // Return jobs dispatched to THIS connection that it never reported done — they sit
            // orphaned in BullMQ `active` otherwise (graceful drain can't reach a job the worker never
            // received), which inflated active past concurrency during deploys. Scoped to socket.id,
            // not the stable workerId: a late disconnect for an old socket must not reclaim the jobs a
            // reconnected socket (same workerId) has already polled.
            await jobBroker(app.log).releaseConnectionJobs(socket.id)
            await machineService(app.log).onDisconnect({ workerId: socket.handshake.auth.workerId })
        }
    })

    app.get('/', ListWorkersParams, async (request) => {
        return machineService(app.log).list(request.principal.tenant.id)
    })

    app.get('/fleet', FleetParams, async () => {
        return workerFleetService(app.log).list()
    })

    app.post('/:id/drain', WorkerActionParams, async (request) => {
        await tenantUtils.assertPrimaryTenant({ request })
        await workerFleetService(request.log).drain({ workerId: request.params.id })
        auditWorkerChange({ request, workerId: request.params.id, detail: 'drained' })
        return workerFleetService(request.log).list()
    })

    app.post('/:id/resume', WorkerActionParams, async (request) => {
        await tenantUtils.assertPrimaryTenant({ request })
        await workerFleetService(request.log).resume({ workerId: request.params.id })
        auditWorkerChange({ request, workerId: request.params.id, detail: 'resumed' })
        return workerFleetService(request.log).list()
    })

    app.delete('/:id', WorkerActionParams, async (request, reply) => {
        await tenantUtils.assertPrimaryTenant({ request })
        await workerFleetService(request.log).remove({ workerId: request.params.id })
        auditWorkerChange({ request, workerId: request.params.id, detail: 'removed' })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/worker-groups', ListWorkersParams, async () => {
        return machineService(app.log).listProjectWorkerGroups()
    })

    app.get('/queue-metrics', QueueMetricsParams, async () => {
        const allQueues = jobQueue(app.log).getAllQueues()
        const counts = await Promise.all(
            allQueues.map(async (queue) => {
                const jobCounts = await queue.getJobCounts('waiting', 'active', 'prioritized')
                return { name: queue.name, waiting: jobCounts.waiting + jobCounts.prioritized, active: jobCounts.active }
            }),
        )
        return { queues: counts }
    })

    if (true) {
        app.get('/queue-metrics/prometheus/:queueName?', PrometheusQueueMetricsParams, async (request, reply) => {
            const queue = jobQueue(app.log).getAllQueues().find((q) => q.name === request.params.queueName)
            if (isNil(queue)) {
                return reply.status(StatusCodes.NOT_FOUND).send({ message: 'Queue not found' })
            }
            return reply.type('text/plain').send(await queue.exportPrometheusMetrics())
        })
    }
}


function auditWorkerChange({ request, workerId, detail }: { request: FastifyRequest, workerId: string, detail: string }): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action: ApplicationEventName.WORKER_STATE_CHANGED,
        data: { target: workerId, detail },
    })
}

const FleetParams = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['worker-machines'],
        response: {
            [StatusCodes.OK]: WorkerFleet,
        },
    },
}

const WorkerActionParams = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['worker-machines'],
        params: z.object({ id: z.string() }),
    },
}

const ListWorkersParams = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
}

const QueueMetricsParams = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['worker-machines'],
        response: {
            200: z.object({
                queues: z.array(z.object({
                    name: z.string(),
                    waiting: z.number(),
                    active: z.number(),
                })),
            }),
        },
    },
}

const PrometheusQueueMetricsParams = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        params: z.object({
            queueName: z.string().default(QueueName.WORKER_JOBS),
        }),
    },
}

import { reconciliationInputs } from './reconciliation-inputs'
import { ApplicationError, chunk, ErrorCode, generateId, isNil, isObject } from '@fema-ipaas/core-utils'
import { ExecutionStatus, ExecutionType, isExecutionStateTerminal, reconciliationDiff, RunEnvironment, StreamStepProgress } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull, Not } from 'typeorm'
import { actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { distributedLock } from '../database/redis-connections'
import { projectService } from '../project/project-service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { jobQueue } from '../workers/job-queue/job-queue'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { reconciliationDifferenceRepo, reconciliationService } from './reconciliation.service'

export const reconciliationRepair = (log: FastifyBaseLogger) => ({
    async cleanup({ ruleId, projectId, tenantId }: { ruleId: string, projectId: string, tenantId: string }): Promise<void> {
        const references = await reconciliationDifferenceRepo().find({ select: ['repairExecutionId'], where: { ruleId, projectId, repairExecutionId: Not(IsNull()) } })
        const ids = [...new Set(references.flatMap((row) => row.repairExecutionId ? [row.repairExecutionId] : []))]
        for (const batch of chunk(ids, 300)) {
            const executions = await executionRepo().find({ select: ['id', 'status'], where: { id: In(batch), projectId } })
            for (const execution of executions) {
                if (isExecutionStateTerminal({ status: execution.status, ignoreInternalError: false })) await jobQueue(log).removeCompletedExecutionJob({ executionId: execution.id, projectId, tenantId })
            }
        }
    },
    async start({ differenceId, projectId }: { differenceId: string, projectId: string }): Promise<string | null> {
        const initial = await reconciliationDifferenceRepo().findOneBy({ id: differenceId, projectId })
        if (isNil(initial)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'ReconciliationDifference', entityId: differenceId } })
        }
        return distributedLock(log).runExclusive({ key: `recon-repair:${projectId}:${initial.ruleId}:${initial.businessKey}`, timeoutInSeconds: 60, fn: async () => {
            const difference = await reconciliationDifferenceRepo().findOneBy({ id: differenceId, projectId, status: In(['OPEN', 'REPAIRING']) })
            if (isNil(difference)) return null
            if (difference.aspect === 'duplicate-key') throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'reconciliation.duplicateKeyNeedsReview' } })
            if (difference.businessKey.includes('{{')) throw new Error('reconciliation.sourceReadFailed')
            const rule = await reconciliationService(log).getRule({ id: difference.ruleId, projectId })
            const tenantId = await projectService(log).getTenantId(projectId)
            if (difference.repairExecutionId) {
                const previous = await executionRepo().findOneBy({ id: difference.repairExecutionId, projectId })
                if (previous && isExecutionStateTerminal({ status: previous.status, ignoreInternalError: false })) {
                    await jobQueue(log).removeCompletedExecutionJob({ executionId: previous.id, projectId, tenantId })
                    return previous.id
                }
                if (previous && previous.status !== ExecutionStatus.QUEUED || await jobQueue(log).hasExecutionJob({ executionId: difference.repairExecutionId, projectId, tenantId })) return difference.repairExecutionId
            }
            const metadata = await connectorMetadataService(log).getOrThrow({ name: rule.source.connectorName, version: undefined, projectId, tenantId })
            if (metadata.actions[rule.repair.readActionName]?.classification !== 'READ') throw new Error('reconciliation.readActionRequired')
            const current = await actionRunService(log).runConnectorAction({
                tenantId, projectId, connectorName: rule.source.connectorName, actionName: rule.repair.readActionName,
                input: { ...rule.source.input, auth: reconciliationInputs.authReference(rule.source.connectionExternalId), [rule.repair.keyInput]: difference.businessKey },
            })
            if (current.status !== ActionRunStatus.SUCCEEDED) throw new Error('reconciliation.sourceReadFailed')
            const samePerson = { projectId, ruleId: rule.id, businessKey: difference.businessKey, status: In(['OPEN', 'REPAIRING']) }
            if (isNil(current.output)) {
                await reconciliationDifferenceRepo().update(samePerson, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })
                return null
            }
            if (!isObject(current.output)) throw new Error('reconciliation.sourceReadFailed')
            const currentKey = rule.source.keyPath.split('.').reduce<unknown>((value, key) => isObject(value) ? value[key] : undefined, current.output)
            if (String(currentKey) !== difference.businessKey) throw new Error('reconciliation.sourceReadFailed')
            if (!reconciliationDiff.appliesTo({ record: current.output, rule })) {
                await reconciliationDifferenceRepo().update(samePerson, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })
                return null
            }
            const workflow = await workflowRepo().findOneBy({ id: rule.workflowId, projectId })
            if (isNil(workflow?.publishedVersionId)) throw new Error('reconciliation.publishedWorkflowRequired')
            const executionId = difference.repairExecutionId ?? generateId()
            await reconciliationDifferenceRepo().update(samePerson, { status: 'REPAIRING', repairExecutionId: executionId })
            const execution = await executionService(log).start({
                executionId, workflowId: rule.workflowId, workflowVersionId: workflow.publishedVersionId, projectId, tenantId,
                payload: current.output, executionType: ExecutionType.BEGIN, executeTrigger: false, environment: RunEnvironment.PRODUCTION,
                streamStepProgress: StreamStepProgress.NONE, workerHandlerId: undefined, httpRequestId: undefined, failParentOnFailure: undefined, businessKey: difference.businessKey,
            })
            await executionRepo().update({ id: execution.id, projectId }, { tags: [...execution.tags ?? [], 'reconciliation-repair'] })
            await reconciliationDifferenceRepo().update(samePerson, { status: 'REPAIRING', repairExecutionId: execution.id })
            return execution.id
        } })
    },
})

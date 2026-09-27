import { ApplicationError, ErrorCode, generateId, isNil, ProjectId, UserId } from '@fema-ipaas/core-utils'
import {
    AgentApproval,
    AgentApprovalDecision,
    AgentApprovalStatus,
    AgentApprovalWithWorkflow,
    CreateAgentApprovalRequestBody,
    DecideAgentApprovalRequestBody,
    ListAgentApprovalsRequestQuery,
    privacyMasking,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, LessThan } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { privacyService } from '../privacy/privacy.service'
import { projectService } from '../project/project-service'
import { findExecutionOrThrow } from '../workflows/execution/execution-service'
import { resumeService } from '../workflows/execution/waitpoint/resume-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { AgentApprovalEntity, AgentApprovalSchema } from './agent-approval.entity'

export const agentApprovalRepo = repoFactory(AgentApprovalEntity)

export const agentApprovalService = (log: FastifyBaseLogger) => ({
    async create({ projectId, request }: { projectId: ProjectId, request: CreateAgentApprovalRequestBody }): Promise<{ id: string }> {
        const execution = await findExecutionOrThrow(request.executionId)
        if (execution.projectId !== projectId) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Run belongs to another project' } })
        }
        const [project, workflow] = await Promise.all([
            projectService(log).getOneOrThrow(projectId),
            workflowRepo().findOneBy({ id: execution.workflowId, projectId }),
        ])
        const settings = await privacyService(log).get({ tenantId: project.tenantId })
        const masked = privacyMasking.maskDeep({ value: request.arguments, rules: settings.maskRules, maskAll: false })
        const id = generateId()
        const maskedArguments: Record<string, unknown> = typeof masked.value === 'object' && masked.value !== null && !Array.isArray(masked.value) ? { ...masked.value } : {}
        await agentApprovalRepo().save({
            id,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            projectId,
            workflowId: execution.workflowId,
            executionId: execution.id,
            stepName: request.stepName,
            waitpointId: request.waitpointId,
            tool: request.tool,
            arguments: maskedArguments,
            message: request.message,
            status: AgentApprovalStatus.PENDING,
            approverIds: [...new Set([workflow?.ownerId, project.ownerId].filter((userId): userId is string => !isNil(userId)))],
            decidedById: null,
            decidedAt: null,
            comment: null,
            expiresAt: dayjs().add(request.timeoutHours, 'hour').toISOString(),
        })
        log.info({ project: { id: projectId }, execution: { id: execution.id }, tool: { name: request.tool } }, '[agentApprovalService#create] Agent call waiting for approval')
        return { id }
    },

    async list({ query, userId }: { query: ListAgentApprovalsRequestQuery, userId: UserId }): Promise<AgentApprovalWithWorkflow[]> {
        const rows = await agentApprovalRepo().find({
            where: {
                projectId: query.projectId,
                ...(isNil(query.status) ? {} : { status: query.status }),
                ...(isNil(query.executionId) ? {} : { executionId: query.executionId }),
            },
            order: { created: 'DESC' },
            take: LIST_LIMIT,
        })
        const workflowIds = [...new Set(rows.map((row) => row.workflowId))]
        const versions = workflowIds.length === 0 ? new Map() : await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflowIds, query.projectId)
        return rows.map((row) => ({
            ...toModel(row),
            workflowDisplayName: versions.get(row.workflowId)?.displayName ?? row.workflowId,
            canDecide: row.status === AgentApprovalStatus.PENDING && row.approverIds.includes(userId),
        }))
    },

    async countPendingForUser({ projectId, userId }: { projectId: ProjectId, userId: UserId }): Promise<number> {
        return agentApprovalRepo().countBy({ projectId, status: AgentApprovalStatus.PENDING, approverIds: ArrayContains([userId]) })
    },

    async decide({ id, projectId, userId, request }: DecideParams): Promise<AgentApproval> {
        const approval = await findOrThrow({ id, projectId })
        if (approval.status !== AgentApprovalStatus.PENDING) {
            invalid('This request has already been handled')
        }
        if (!approval.approverIds.includes(userId)) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'You are not an approver of this request' } })
        }
        const status = request.approved ? AgentApprovalStatus.APPROVED : AgentApprovalStatus.REJECTED
        const decided = await settle({ approval, status, decidedById: userId, comment: request.comment ?? null })
        await resumeRun({ log, approval, decision: { approvalId: approval.id, approved: request.approved, expired: false, comment: request.comment ?? null } })
        return toModel(decided)
    },

    async expireOverdue(): Promise<number> {
        const overdue = await agentApprovalRepo().find({
            where: { status: AgentApprovalStatus.PENDING, expiresAt: LessThan(dayjs().toISOString()) },
            take: EXPIRE_BATCH,
        })
        await overdue.reduce<Promise<void>>(async (previous, approval) => {
            await previous
            await settle({ approval, status: AgentApprovalStatus.EXPIRED, decidedById: null, comment: null })
            await resumeRun({ log, approval, decision: { approvalId: approval.id, approved: false, expired: true, comment: null } })
        }, Promise.resolve())
        return overdue.length
    },
})

async function settle({ approval, status, decidedById, comment }: SettleParams): Promise<AgentApprovalSchema> {
    const result = await agentApprovalRepo().update(
        { id: approval.id, projectId: approval.projectId, status: AgentApprovalStatus.PENDING },
        { status, decidedById, decidedAt: dayjs().toISOString(), comment },
    )
    if ((result.affected ?? 0) === 0) {
        invalid('This request has already been handled')
    }
    return agentApprovalRepo().findOneByOrFail({ id: approval.id })
}

async function resumeRun({ log, approval, decision }: { log: FastifyBaseLogger, approval: AgentApprovalSchema, decision: AgentApprovalDecision }): Promise<void> {
    await resumeService(log).resumeFromWaitpoint({
        executionId: approval.executionId,
        waitpointId: approval.waitpointId,
        resumePayload: { body: decision, headers: {}, queryParams: {} },
    })
}

async function findOrThrow({ id, projectId }: { id: string, projectId: ProjectId }): Promise<AgentApprovalSchema> {
    const approval = await agentApprovalRepo().findOneBy({ id, projectId })
    if (isNil(approval)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'AgentApproval' } })
    }
    return approval
}

function toModel(approval: AgentApprovalSchema): AgentApproval {
    return {
        id: approval.id,
        created: approval.created,
        updated: approval.updated,
        projectId: approval.projectId,
        workflowId: approval.workflowId,
        executionId: approval.executionId,
        stepName: approval.stepName,
        tool: approval.tool,
        arguments: approval.arguments,
        message: approval.message,
        status: approval.status,
        approverIds: approval.approverIds,
        decidedById: approval.decidedById,
        decidedAt: approval.decidedAt,
        comment: approval.comment,
        expiresAt: approval.expiresAt,
    }
}

function invalid(message: string): never {
    throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

const LIST_LIMIT = 100
const EXPIRE_BATCH = 100

type DecideParams = {
    id: string
    projectId: ProjectId
    userId: UserId
    request: DecideAgentApprovalRequestBody
}

type SettleParams = {
    approval: AgentApprovalSchema
    status: AgentApprovalStatus
    decidedById: UserId | null
    comment: string | null
}

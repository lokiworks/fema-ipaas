import { ApplicationError, ErrorCode, generateId, isNil, ProjectId, SeekPage, TenantId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ApplicationEventName,
    ConnectionStatus,
    CreateWorkflowReleaseRequestBody,
    DefaultProjectRole,
    DeployToTestRequestBody,
    DeployToTestResponse,
    EnvironmentOverview,
    ExecutionStatus,
    ListWorkflowReleasesRequestQuery,
    Project,
    ReleaseCheck,
    ReleaseCheckCode,
    ReleaseCheckLevel,
    ReleaseEvidence,
    RollbackWorkflowRequestBody,
    RollbackWorkflowResponse,
    RunEnvironment,
    UpdateEnvironmentSettingsRequestBody,
    Workflow,
    WorkflowOperationType,
    WorkflowRelease,
    WorkflowReleaseDetail,
    WorkflowReleaseStatus,
    WorkflowReleaseWithWorkflow,
    WorkflowStatus,
    workflowStructureUtil,
    WorkflowVersion,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, In } from 'typeorm'
import { AuditEventRow } from '../audit/audit-event.entity'
import { auditEventService } from '../audit/audit-event.service'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { repoFactory } from '../core/db/repo-factory'
import { projectMemberRepo } from '../project/project-member.repo'
import { projectService } from '../project/project-service'
import { variableRepo } from '../variable/variable.service'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowExecutionCache } from '../workflows/workflow/workflow-execution-cache'
import { workflowPublishUtils } from '../workflows/workflow/workflow-publish-utils'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowService } from '../workflows/workflow/workflow.service'
import { workflowVersionRepo, workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { connectionReplacementRepo } from './connection-replacement.service'
import { releaseSideEffects } from './release-side-effects'
import { WorkflowReleaseEntity } from './release.entity'

export const workflowReleaseRepo = repoFactory(WorkflowReleaseEntity)

export const workflowReleaseService = (log: FastifyBaseLogger) => ({
    async list({ query, currentUserId }: ListParams): Promise<SeekPage<WorkflowReleaseWithWorkflow>> {
        const limit = query.limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(query.cursor)
        const rows = await workflowReleaseRepo().find({
            where: {
                projectId: query.projectId,
                ...(isNil(query.status) ? {} : { status: query.status }),
                ...(isNil(query.workflowId) ? {} : { workflowId: query.workflowId }),
                ...(query.mine === 'approver' ? { approverIds: ArrayContains([currentUserId]) } : {}),
            },
            order: { created: 'DESC' },
            skip: offset,
            take: limit + 1,
        })
        const page = rows.slice(0, limit)
        const names = await versionNames(page.map((release) => release.workflowVersionId))
        return {
            data: page.map((release) => ({ ...release, workflowDisplayName: names.get(release.workflowVersionId) ?? '' })),
            next: rows.length > limit ? String(offset + limit) : null,
            previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        }
    },

    async history({ projectId, cursor }: { projectId: ProjectId, cursor: string | null }): Promise<SeekPage<AuditEventRow>> {
        return auditEventService(log).list({
            tenantId: await projectService(log).getTenantId(projectId),
            projectId: [projectId],
            action: RELEASE_HISTORY_ACTIONS,
            cursor,
            limit: HISTORY_PAGE_SIZE,
        })
    },

    async countPendingForApprover({ projectId, userId }: { projectId: ProjectId, userId: UserId }): Promise<number> {
        return workflowReleaseRepo().count({
            where: { projectId, status: WorkflowReleaseStatus.PENDING, approverIds: ArrayContains([userId]) },
        })
    },

    async create({ request, requesterId, tenantId }: CreateParams): Promise<WorkflowRelease> {
        const project = await projectService(log).getOneOrThrow(request.projectId)
        const workflow = await workflowRepo().findOneBy({ id: request.workflowId, projectId: request.projectId })
        if (isNil(workflow)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: request.workflowId, entityType: 'Workflow' } })
        }
        const pending = await workflowReleaseRepo().existsBy({ workflowId: workflow.id, status: WorkflowReleaseStatus.PENDING })
        if (pending) {
            invalid('This workflow already has a pending release')
        }
        const version = project.releasesEnabled
            ? await testVersionOrThrow({ workflow, log })
            : await lockVersion({
                workflowId: workflow.id,
                versionId: request.versionId,
                projectId: request.projectId,
                tenantId,
                userId: requesterId,
                log,
            })
        if (workflow.publishedVersionId === version.id) {
            invalid('This version is already published')
        }
        const autoApprove = !project.releasesEnabled || approversOf(project).length === 0
        if (autoApprove) {
            const preChecks = await checksFor({
                release: { projectId: request.projectId, workflowId: workflow.id, workflowVersionId: version.id, status: WorkflowReleaseStatus.PENDING },
                log,
            })
            const failing = preChecks.filter((item) => item.level === ReleaseCheckLevel.ERROR)
            if (failing.length > 0) {
                invalid(`Fix the failing release checks before promoting: ${failing.map((item) => `${item.code}${isNil(item.subject) ? '' : ` ${item.subject}`}`).join(', ')}`)
            }
        }
        const id = generateId()
        await workflowReleaseRepo().insert({
            id,
            projectId: request.projectId,
            workflowId: workflow.id,
            workflowVersionId: version.id,
            previousVersionId: workflow.publishedVersionId ?? null,
            status: WorkflowReleaseStatus.PENDING,
            note: request.note,
            requestedById: requesterId,
            approverIds: approversOf(project),
            decidedById: null,
            decidedAt: null,
            comment: null,
        })
        log.info({ project: { id: request.projectId }, workflow: { id: workflow.id }, workflowVersion: { id: version.id } }, '[workflowReleaseService#create] Release requested')
        await releaseSideEffects(log).recordChange({
            projectId: request.projectId,
            userId: requesterId,
            action: ApplicationEventName.RELEASE_REQUESTED,
            workflowId: workflow.id,
            versionId: version.id,
            details: { releaseId: id, previousVersionId: workflow.publishedVersionId ?? null, note: request.note, approverIds: approversOf(project) },
        })
        if (autoApprove) {
            return this.approve({ id, projectId: request.projectId, userId: requesterId, tenantId, comment: undefined, skipApproverCheck: true })
        }
        const created = await workflowReleaseRepo().findOneByOrFail({ id })
        await releaseSideEffects(log).onRequested({ release: created })
        return created
    },

    async getDetail({ id, projectId, currentUserId }: DetailParams): Promise<WorkflowReleaseDetail> {
        const release = await getOneOrThrow({ id, projectId })
        const [names, checks, evidence] = await Promise.all([
            versionNames([release.workflowVersionId]),
            checksFor({ release, log }),
            evidenceFor(release.workflowVersionId),
        ])
        return {
            ...release,
            workflowDisplayName: names.get(release.workflowVersionId) ?? '',
            checks,
            evidence,
            canApprove: release.status === WorkflowReleaseStatus.PENDING && canDecide({ release, userId: currentUserId }) && !checks.some((check) => check.level === ReleaseCheckLevel.ERROR),
        }
    },

    async approve({ id, projectId, userId, tenantId, comment, skipApproverCheck }: ApproveParams): Promise<WorkflowRelease> {
        const release = await getOneOrThrow({ id, projectId })
        assertPending(release)
        if (!skipApproverCheck && !canDecide({ release, userId })) {
            denied('You are not an approver of this release')
        }
        const checks = await checksFor({ release, log })
        if (checks.some((check) => check.level === ReleaseCheckLevel.ERROR)) {
            invalid('Fix the failing release checks before approving')
        }
        await workflowService(log).update({
            id: release.workflowId,
            projectId,
            tenantId,
            userId,
            operation: {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: { status: WorkflowStatus.ENABLED, versionId: release.workflowVersionId },
            },
        })
        await workflowReleaseRepo().update({ id, projectId }, {
            status: WorkflowReleaseStatus.DEPLOYED,
            decidedById: userId,
            decidedAt: dayjsUtil().toISOString(),
            comment: comment ?? null,
        })
        log.info({ project: { id: projectId }, workflow: { id: release.workflowId } }, '[workflowReleaseService#approve] Release deployed')
        const deployed = await workflowReleaseRepo().findOneByOrFail({ id })
        await releaseSideEffects(log).onDecided({ release: deployed })
        await releaseSideEffects(log).recordChange({
            projectId,
            userId,
            action: ApplicationEventName.RELEASE_APPROVED,
            workflowId: release.workflowId,
            versionId: release.workflowVersionId,
            details: { releaseId: id, previousVersionId: release.previousVersionId, comment: comment ?? null },
        })
        return deployed
    },

    async reject({ id, projectId, userId, comment }: RejectParams): Promise<WorkflowRelease> {
        const release = await getOneOrThrow({ id, projectId })
        assertPending(release)
        if (!canDecide({ release, userId })) {
            denied('You are not an approver of this release')
        }
        await workflowReleaseRepo().update({ id, projectId }, {
            status: WorkflowReleaseStatus.REJECTED,
            decidedById: userId,
            decidedAt: dayjsUtil().toISOString(),
            comment,
        })
        const rejected = await workflowReleaseRepo().findOneByOrFail({ id })
        await releaseSideEffects(log).onDecided({ release: rejected })
        await releaseSideEffects(log).recordChange({
            projectId,
            userId,
            action: ApplicationEventName.RELEASE_REJECTED,
            workflowId: release.workflowId,
            versionId: release.workflowVersionId,
            details: { releaseId: id, comment },
        })
        return rejected
    },

    async withdraw({ id, projectId, userId }: WithdrawParams): Promise<WorkflowRelease> {
        const release = await getOneOrThrow({ id, projectId })
        assertPending(release)
        if (release.requestedById !== userId) {
            denied('Only the requester can withdraw a release')
        }
        await workflowReleaseRepo().update({ id, projectId }, {
            status: WorkflowReleaseStatus.WITHDRAWN,
            decidedById: userId,
            decidedAt: dayjsUtil().toISOString(),
        })
        await releaseSideEffects(log).recordChange({
            projectId,
            userId,
            action: ApplicationEventName.RELEASE_WITHDRAWN,
            workflowId: release.workflowId,
            versionId: release.workflowVersionId,
            details: { releaseId: id },
        })
        return workflowReleaseRepo().findOneByOrFail({ id })
    },

    async assertCanPublishDirectly({ projectId }: { projectId: ProjectId }): Promise<void> {
        const project = await projectService(log).getOneOrThrow(projectId)
        if (project.releasesEnabled) {
            denied('This project has test and production environments. Deploy to test, then promote to production.')
        }
    },

    async deployToTest({ request, userId, tenantId }: { request: DeployToTestRequestBody, userId: UserId, tenantId: TenantId }): Promise<DeployToTestResponse> {
        const project = await projectService(log).getOneOrThrow(request.projectId)
        if (!project.releasesEnabled) {
            invalid('Turn on test and production environments for this project first')
        }
        const workflow = await workflowOrThrow({ id: request.workflowId, projectId: request.projectId })
        const version = await lockVersion({ workflowId: workflow.id, versionId: undefined, projectId: request.projectId, tenantId, userId, log })
        if (!version.valid) {
            invalid('Fix the validation errors before deploying')
        }
        const deployedAt = dayjsUtil().toISOString()
        await workflowRepo().update({ id: workflow.id, projectId: request.projectId }, { testVersionId: version.id, testDeployedAt: deployedAt })
        await workflowExecutionCache(log).invalidate(workflow.id)
        log.info({ project: { id: request.projectId }, workflow: { id: workflow.id }, workflowVersion: { id: version.id } }, '[workflowReleaseService#deployToTest] Deployed to test')
        await releaseSideEffects(log).recordChange({
            projectId: request.projectId,
            userId,
            action: ApplicationEventName.RELEASE_DEPLOYED_TO_TEST,
            workflowId: workflow.id,
            versionId: version.id,
            details: { previousVersionId: workflow.testVersionId ?? null },
        })
        return { workflowId: workflow.id, versionId: version.id, deployedAt }
    },

    async rollback({ request, userId, tenantId }: { request: RollbackWorkflowRequestBody, userId: UserId, tenantId: TenantId }): Promise<RollbackWorkflowResponse> {
        const workflow = await workflowOrThrow({ id: request.workflowId, projectId: request.projectId })
        const target = await workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId: workflow.id, versionId: request.versionId })
        if (target.state !== WorkflowVersionState.LOCKED) {
            invalid('Only published versions can be rolled back to')
        }
        await workflowService(log).update({
            id: workflow.id,
            projectId: request.projectId,
            tenantId,
            userId,
            operation: { type: WorkflowOperationType.USE_AS_DRAFT, request: { versionId: target.id } },
        })
        const updated = await workflowService(log).update({
            id: workflow.id,
            projectId: request.projectId,
            tenantId,
            userId,
            operation: { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: workflow.status } },
        })
        const pending = await workflowReleaseRepo().findBy({ workflowId: workflow.id, projectId: request.projectId, status: WorkflowReleaseStatus.PENDING })
        await Promise.all(pending.map((release) => workflowReleaseRepo().update({ id: release.id, projectId: request.projectId }, {
            status: WorkflowReleaseStatus.WITHDRAWN,
            decidedById: userId,
            decidedAt: dayjsUtil().toISOString(),
            comment: ROLLBACK_WITHDRAW_COMMENT,
        })))
        log.info({ project: { id: request.projectId }, workflow: { id: workflow.id }, workflowVersion: { id: target.id } }, '[workflowReleaseService#rollback] Rolled back')
        await releaseSideEffects(log).recordChange({
            projectId: request.projectId,
            userId,
            action: ApplicationEventName.RELEASE_ROLLED_BACK,
            workflowId: workflow.id,
            versionId: target.id,
            details: { previousVersionId: workflow.publishedVersionId ?? null },
        })
        const rolledBackProject = await projectService(log).getOneOrThrow(request.projectId)
        await releaseSideEffects(log).onRolledBack({ projectId: request.projectId, workflowId: workflow.id, versionId: target.id, approverIds: approversOf(rolledBackProject), actorId: userId })
        return { workflowId: workflow.id, publishedVersionId: updated.publishedVersionId ?? updated.version.id, withdrawnReleases: pending.length }
    },

    async updateEnvironmentSettings({ request, userId }: { request: UpdateEnvironmentSettingsRequestBody, userId: UserId }): Promise<EnvironmentOverview> {
        const project = await projectService(log).getOneOrThrow(request.projectId)
        const approverIds = [...new Set(request.approverIds)]
        await assertApproversEligible({ project, approverIds })
        if (project.releasesEnabled && !request.enabled) {
            const pending = await workflowReleaseRepo().existsBy({ projectId: project.id, status: WorkflowReleaseStatus.PENDING })
            if (pending) {
                invalid('Handle the pending release requests before turning environments off')
            }
            await workflowRepo().update({ projectId: project.id }, { testVersionId: null, testDeployedAt: null })
            await connectionReplacementRepo().delete({ projectId: project.id })
        }
        await projectService(log).update(project.id, { type: project.type, releasesEnabled: request.enabled, releaseApproverIds: approverIds })
        await releaseSideEffects(log).recordChange({
            projectId: project.id,
            userId,
            action: ApplicationEventName.ENVIRONMENTS_UPDATED,
            details: { environmentsEnabled: request.enabled, approverIds },
        })
        return this.overview({ projectId: project.id })
    },

    async overview({ projectId }: { projectId: ProjectId }): Promise<EnvironmentOverview> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const workflows = await workflowRepo().find({ where: { projectId }, select: ['id', 'status', 'publishedVersionId', 'testVersionId', 'testDeployedAt'] })
        const deployedIds = workflows.flatMap((workflow) => [workflow.publishedVersionId, workflow.testVersionId]).filter((id): id is string => !isNil(id))
        const [latest, deployedVersions, pending, replacements] = await Promise.all([
            workflows.length === 0 ? Promise.resolve(new Map<string, WorkflowVersion>()) : workflowVersionService(log).getLatestVersionsByWorkflowIds(workflows.map((workflow) => workflow.id), projectId),
            deployedIds.length === 0 ? Promise.resolve([]) : workflowVersionRepo().find({ where: { id: In(deployedIds) }, select: ['id', 'created'] }),
            workflowReleaseRepo().find({ where: { projectId, status: WorkflowReleaseStatus.PENDING }, select: ['id', 'workflowId'] }),
            connectionReplacementRepo().countBy({ projectId }),
        ])
        const createdAt = new Map(deployedVersions.map((version) => [version.id, dayjsUtil(version.created)]))
        const rows = workflows.map((workflow) => {
            const testCreated = isNil(workflow.testVersionId) ? undefined : createdAt.get(workflow.testVersionId)
            const productionCreated = isNil(workflow.publishedVersionId) ? undefined : createdAt.get(workflow.publishedVersionId)
            return {
                workflowId: workflow.id,
                displayName: latest.get(workflow.id)?.displayName ?? workflow.id,
                enabled: workflow.status === WorkflowStatus.ENABLED,
                testVersionId: workflow.testVersionId ?? null,
                testDeployedAt: workflow.testDeployedAt ?? null,
                productionVersionId: workflow.publishedVersionId ?? null,
                testIsNewer: !isNil(testCreated) && workflow.testVersionId !== workflow.publishedVersionId && (isNil(productionCreated) || testCreated.isAfter(productionCreated)),
                pendingReleaseId: pending.find((release) => release.workflowId === workflow.id)?.id ?? null,
            }
        })
        return {
            enabled: project.releasesEnabled,
            approverIds: approversOf(project),
            test: {
                deployed: rows.filter((row) => !isNil(row.testVersionId)).length,
                newerThanProduction: rows.filter((row) => row.testIsNewer).length,
                replacements,
            },
            production: {
                deployed: rows.filter((row) => !isNil(row.productionVersionId)).length,
                running: rows.filter((row) => row.enabled).length,
                pendingApproval: pending.length,
            },
            workflows: rows.sort((a, b) => a.displayName.localeCompare(b.displayName)),
        }
    },
})

async function lockVersion({ workflowId, versionId, projectId, tenantId, userId, log }: LockVersionParams): Promise<WorkflowVersion> {
    const version = await workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId, versionId })
    if (version.state === WorkflowVersionState.LOCKED) {
        return version
    }
    workflowPublishUtils.assertNoPendingReview({ version })
    return workflowVersionService(log).applyOperation({
        userId,
        projectId,
        tenantId,
        workflowVersion: version,
        userOperation: { type: WorkflowOperationType.LOCK_WORKFLOW, request: {} },
    })
}

async function checksFor({ release, log }: { release: ChecksSubject, log: FastifyBaseLogger }): Promise<ReleaseCheck[]> {
    const version = await workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId: release.workflowId, versionId: release.workflowVersionId })
    const workflow = await workflowRepo().findOneBy({ id: release.workflowId, projectId: release.projectId })
    const project = await projectService(log).getOneOrThrow(release.projectId)
    const alreadyPublished = !isNil(workflow) && workflow.publishedVersionId === release.workflowVersionId && release.status === WorkflowReleaseStatus.PENDING
    const connectionChecks = await checkConnections({ version, projectId: release.projectId, environmentsEnabled: project.releasesEnabled })
    const variableChecks = await checkVariables({ version, projectId: release.projectId, environmentsEnabled: project.releasesEnabled })
    const evidence = await evidenceFor(release.workflowVersionId)
    return [
        version.valid
            ? check({ level: ReleaseCheckLevel.OK, code: ReleaseCheckCode.VERSION_VALID })
            : check({ level: ReleaseCheckLevel.ERROR, code: ReleaseCheckCode.VERSION_INVALID }),
        ...(alreadyPublished ? [check({ level: ReleaseCheckLevel.ERROR, code: ReleaseCheckCode.ALREADY_PUBLISHED })] : []),
        ...(project.releasesEnabled && evidence.testRuns === 0 ? [check({ level: ReleaseCheckLevel.WARNING, code: ReleaseCheckCode.NO_TEST_RUNS })] : []),
        ...connectionChecks,
        ...variableChecks,
    ]
}

async function checkConnections({ version, projectId, environmentsEnabled }: { version: WorkflowVersion, projectId: ProjectId, environmentsEnabled: boolean }): Promise<ReleaseCheck[]> {
    const externalIds = [...new Set(workflowStructureUtil.extractConnectionIds(version))]
    if (externalIds.length === 0) {
        return []
    }
    const [connections, replacements] = await Promise.all([
        connectionsRepo().find({
            where: { externalId: In(externalIds), projectIds: ArrayContains([projectId]) },
            select: ['id', 'externalId', 'displayName', 'status'],
        }),
        connectionReplacementRepo().find({ where: { projectId }, select: ['id', 'sourceConnectionId', 'targetConnectionId'] }),
    ])
    const testOnlyIds = new Set(replacements.map((replacement) => replacement.targetConnectionId))
    const replacedIds = new Set(replacements.map((replacement) => replacement.sourceConnectionId))
    const problems = externalIds.flatMap((externalId): ReleaseCheck[] => {
        const connection = connections.find((candidate) => candidate.externalId === externalId)
        if (isNil(connection)) {
            return [check({ level: ReleaseCheckLevel.ERROR, code: ReleaseCheckCode.CONNECTION_MISSING, subject: externalId })]
        }
        if (environmentsEnabled && testOnlyIds.has(connection.id)) {
            return [check({ level: ReleaseCheckLevel.ERROR, code: ReleaseCheckCode.CONNECTION_IS_TEST_ONLY, subject: connection.displayName })]
        }
        const unhealthy = connection.status !== ConnectionStatus.ACTIVE
            ? [check({ level: ReleaseCheckLevel.WARNING, code: ReleaseCheckCode.CONNECTION_UNHEALTHY, subject: connection.displayName })]
            : []
        const notReplaced = environmentsEnabled && !replacedIds.has(connection.id)
            ? [check({ level: ReleaseCheckLevel.WARNING, code: ReleaseCheckCode.CONNECTION_NOT_REPLACED, subject: connection.displayName })]
            : []
        return [...unhealthy, ...notReplaced]
    })
    const blocking = problems.filter((problem) => problem.level === ReleaseCheckLevel.ERROR)
    const ok = blocking.length === 0 && problems.every((problem) => problem.code === ReleaseCheckCode.CONNECTION_NOT_REPLACED)
        ? [check({ level: ReleaseCheckLevel.OK, code: ReleaseCheckCode.CONNECTIONS_OK, subject: String(externalIds.length) })]
        : []
    return [...problems, ...ok]
}

async function checkVariables({ version, projectId, environmentsEnabled }: { version: WorkflowVersion, projectId: ProjectId, environmentsEnabled: boolean }): Promise<ReleaseCheck[]> {
    const serialized = JSON.stringify(version.trigger)
    const names = [...new Set([...serialized.matchAll(VARIABLE_REFERENCE_PATTERN)].map((match) => match[1] ?? match[2]).filter((name): name is string => !isNil(name)))]
    if (names.length === 0) {
        return []
    }
    const existing = await variableRepo().find({ where: { projectId, name: In(names) }, select: ['id', 'name', 'testValue'] })
    const missing = names.filter((name) => !existing.some((variable) => variable.name === name))
    if (missing.length > 0) {
        return missing.map((name) => check({ level: ReleaseCheckLevel.ERROR, code: ReleaseCheckCode.VARIABLE_MISSING, subject: name }))
    }
    const withoutTestValue = environmentsEnabled ? existing.filter((variable) => isNil(variable.testValue)) : []
    return [
        check({ level: ReleaseCheckLevel.OK, code: ReleaseCheckCode.VARIABLES_OK, subject: String(names.length) }),
        ...withoutTestValue.map((variable) => check({ level: ReleaseCheckLevel.WARNING, code: ReleaseCheckCode.VARIABLE_NO_TEST_VALUE, subject: variable.name })),
    ]
}

async function evidenceFor(workflowVersionId: string): Promise<ReleaseEvidence> {
    const runs = await executionRepo().find({
        where: { workflowVersionId, environment: RunEnvironment.TESTING },
        select: ['id', 'status', 'created'],
        order: { created: 'DESC' },
        take: MAX_EVIDENCE_RUNS,
    })
    return {
        testRuns: runs.length,
        succeeded: runs.filter((run) => run.status === ExecutionStatus.SUCCEEDED).length,
        failed: runs.filter((run) => run.status !== ExecutionStatus.SUCCEEDED).length,
        recent: runs.slice(0, RECENT_EVIDENCE_RUNS).map((run) => ({ id: run.id, status: run.status, created: String(run.created) })),
    }
}

async function versionNames(versionIds: string[]): Promise<Map<string, string>> {
    if (versionIds.length === 0) {
        return new Map()
    }
    const rows = await workflowVersionRepo().find({ where: { id: In(versionIds) }, select: ['id', 'displayName'] })
    return new Map(rows.map((row) => [row.id, row.displayName]))
}

function approversOf(project: Project): string[] {
    return project.releaseApproverIds
}

async function testVersionOrThrow({ workflow, log }: { workflow: Workflow, log: FastifyBaseLogger }): Promise<WorkflowVersion> {
    if (isNil(workflow.testVersionId)) {
        invalid('Deploy this workflow to test before promoting it')
    }
    return workflowVersionService(log).getWorkflowVersionOrThrow({ workflowId: workflow.id, versionId: workflow.testVersionId })
}

async function workflowOrThrow({ id, projectId }: { id: string, projectId: ProjectId }): Promise<Workflow> {
    const workflow = await workflowRepo().findOneBy({ id, projectId })
    if (isNil(workflow)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'Workflow' } })
    }
    return workflow
}

async function assertApproversEligible({ project, approverIds }: { project: Project, approverIds: string[] }): Promise<void> {
    const others = approverIds.filter((approverId) => approverId !== project.ownerId)
    if (others.length === 0) {
        return
    }
    const members = await projectMemberRepo().find({ where: { projectId: project.id, userId: In(others) }, select: ['userId', 'role'] })
    const eligible = others.every((approverId) => members.some((member) => member.userId === approverId && APPROVER_ROLES.includes(member.role)))
    if (!eligible) {
        invalid('Approvers must be the project owner or members who can edit')
    }
}

function canDecide({ release, userId }: { release: WorkflowRelease, userId: UserId }): boolean {
    if (!release.approverIds.includes(userId)) {
        return false
    }
    const otherApprovers = release.approverIds.filter((approver) => approver !== release.requestedById)
    return release.requestedById !== userId || otherApprovers.length === 0
}

function assertPending(release: WorkflowRelease): void {
    if (release.status !== WorkflowReleaseStatus.PENDING) {
        invalid('This release is no longer pending')
    }
}

async function getOneOrThrow({ id, projectId }: { id: string, projectId: ProjectId }): Promise<WorkflowRelease> {
    const release = await workflowReleaseRepo().findOneBy({ id, projectId })
    if (isNil(release)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'WorkflowRelease' } })
    }
    return release
}

function check({ level, code, subject }: { level: ReleaseCheckLevel, code: ReleaseCheckCode, subject?: string }): ReleaseCheck {
    return { level, code, subject: subject ?? null }
}

function invalid(message: string): never {
    throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

function denied(message: string): never {
    throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message } })
}

function decodeOffset(cursor: string | undefined): number {
    const parsed = Number(cursor)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

const DEFAULT_PAGE_SIZE = 20
const HISTORY_PAGE_SIZE = 50
const RELEASE_HISTORY_ACTIONS: string[] = [
    ApplicationEventName.RELEASE_DEPLOYED_TO_TEST,
    ApplicationEventName.RELEASE_REQUESTED,
    ApplicationEventName.RELEASE_APPROVED,
    ApplicationEventName.RELEASE_REJECTED,
    ApplicationEventName.RELEASE_WITHDRAWN,
    ApplicationEventName.RELEASE_ROLLED_BACK,
    ApplicationEventName.ENVIRONMENTS_UPDATED,
]
const ROLLBACK_WITHDRAW_COMMENT = 'Withdrawn automatically by a rollback'
const APPROVER_ROLES: string[] = [DefaultProjectRole.ADMIN, DefaultProjectRole.DEVELOPER]
const MAX_EVIDENCE_RUNS = 200
const RECENT_EVIDENCE_RUNS = 5
const VARIABLE_REFERENCE_PATTERN = /variables\[\s*['"]([^'"]+)['"]\s*\]|variables\.([A-Za-z0-9_]+)/g

type ListParams = {
    query: ListWorkflowReleasesRequestQuery
    currentUserId: UserId
}

type CreateParams = {
    request: CreateWorkflowReleaseRequestBody
    requesterId: UserId
    tenantId: TenantId
}

type DetailParams = {
    id: string
    projectId: ProjectId
    currentUserId: UserId
}

type ApproveParams = {
    id: string
    projectId: ProjectId
    userId: UserId
    tenantId: TenantId
    comment: string | undefined
    skipApproverCheck?: boolean
}

type RejectParams = {
    id: string
    projectId: ProjectId
    userId: UserId
    comment: string
}

type WithdrawParams = {
    id: string
    projectId: ProjectId
    userId: UserId
}

type ChecksSubject = Pick<WorkflowRelease, 'projectId' | 'workflowId' | 'workflowVersionId' | 'status'>

type LockVersionParams = {
    workflowId: string
    versionId: string | undefined
    projectId: ProjectId
    tenantId: TenantId
    userId: UserId
    log: FastifyBaseLogger
}

import { ApplicationError, ErrorCode, generateId, isNil, Permission } from '@fema-ipaas/core-utils'
import {
    DEFAULT_PROJECT_ACCESS_ROLE,
    DefaultProjectRole,
    Project,
    ProjectAccessRequest,
    ProjectAccessRequestStatus,
    ProjectAccessRequestToReview,
    ProjectAccessRequestWithUser,
    ProjectMember,
    ProjectType,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { userRepo } from '../user/user-service'
import { projectAccess } from './project-access'
import { ProjectAccessRequestEntity } from './project-access-request.entity'
import { projectMemberRepo } from './project-member.repo'
import { projectMemberService } from './project-member.service'
import { projectRepo } from './project-repo'

const projectAccessRequestRepo = repoFactory(ProjectAccessRequestEntity)

export const projectAccessRequestService = (log: FastifyBaseLogger) => ({
    async create({ tenantId, userId, projectId, reason }: CreateParams): Promise<CreateResult> {
        const project = await findTeamProject({ tenantId, projectId })
        const role = await projectAccess(log).resolveRole({ userId, projectId: project.id })
        if (!isNil(role)) {
            throw validation({ message: 'You are already a member of this project', messageKey: 'projectAccessAlreadyMember' })
        }
        const existing = await projectAccessRequestRepo().findOneBy({ tenantId, projectId: project.id, userId, status: ProjectAccessRequestStatus.PENDING })
        if (!isNil(existing)) {
            return { request: existing, project, created: false }
        }
        const now = dayjs().toISOString()
        const trimmed = reason?.trim() ?? ''
        const request = await projectAccessRequestRepo().save({
            id: generateId(),
            created: now,
            updated: now,
            tenantId,
            projectId: project.id,
            userId,
            reason: trimmed.length > 0 ? trimmed : null,
            status: ProjectAccessRequestStatus.PENDING,
            decidedBy: null,
            decidedAt: null,
            grantedRole: null,
        })
        return { request, project, created: true }
    },

    async listMyPending({ tenantId, userId }: UserParams): Promise<ProjectAccessRequest[]> {
        return projectAccessRequestRepo().find({
            where: { tenantId, userId, status: ProjectAccessRequestStatus.PENDING },
            order: { created: 'DESC' },
            take: LIST_CAP,
        })
    },

    async listPending({ tenantId, projectId }: ProjectParams): Promise<ProjectAccessRequestWithUser[]> {
        const requests = await projectAccessRequestRepo().find({
            where: { tenantId, projectId, status: ProjectAccessRequestStatus.PENDING },
            order: { created: 'DESC' },
            take: LIST_CAP,
        })
        return withUsers({ tenantId, requests })
    },

    async listPendingForApprover({ tenantId, userId }: UserParams): Promise<ProjectAccessRequestToReview[]> {
        const projects = await projectAccess(log).projectsWithPermission({ userId, tenantId, permission: Permission.WRITE_PROJECT_MEMBER })
        if (projects.length === 0) {
            return []
        }
        const requests = await projectAccessRequestRepo().find({
            where: { tenantId, projectId: In(projects.map((project) => project.id)), status: ProjectAccessRequestStatus.PENDING },
            order: { created: 'DESC' },
            take: LIST_CAP,
        })
        const names = new Map(projects.map((project) => [project.id, project.displayName]))
        const enriched = await withUsers({ tenantId, requests })
        return enriched.map((request) => ({ ...request, projectDisplayName: names.get(request.projectId) ?? request.projectId }))
    },

    async withdraw({ tenantId, userId, requestId }: WithdrawParams): Promise<ProjectAccessRequest> {
        const request = await projectAccessRequestRepo().findOneBy({ id: requestId, tenantId, userId })
        if (isNil(request)) {
            throw notFound(requestId)
        }
        if (request.status !== ProjectAccessRequestStatus.PENDING) {
            throw validation({ message: 'This request has already been decided', messageKey: 'projectAccessAlreadyDecided' })
        }
        const withdrawn: ProjectAccessRequest = {
            ...request,
            status: ProjectAccessRequestStatus.WITHDRAWN,
            decidedBy: userId,
            decidedAt: dayjs().toISOString(),
        }
        await projectAccessRequestRepo().update({ id: request.id, tenantId, userId, status: ProjectAccessRequestStatus.PENDING }, {
            status: withdrawn.status,
            decidedBy: withdrawn.decidedBy,
            decidedAt: withdrawn.decidedAt,
        })
        return withdrawn
    },

    async decide({ tenantId, requestId, actorId, approve, role }: DecideParams): Promise<DecideResult> {
        const request = await projectAccessRequestRepo().findOneBy({ id: requestId, tenantId })
        if (isNil(request)) {
            throw notFound(requestId)
        }
        const project = await findTeamProject({ tenantId, projectId: request.projectId })
        const actorRole = await projectAccess(log).resolveRole({ userId: actorId, projectId: project.id })
        if (isNil(actorRole) || !actorRole.permissions.includes(Permission.WRITE_PROJECT_MEMBER)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Only the project owner or a project admin can review access requests' },
            })
        }
        if (request.status !== ProjectAccessRequestStatus.PENDING) {
            throw validation({ message: 'This request has already been decided', messageKey: 'projectAccessAlreadyDecided' })
        }
        const requester = await userRepo().findOne({ where: { id: request.userId, tenantId }, relations: { identity: true } })
        if (isNil(requester)) {
            throw validation({ message: 'The requester is no longer a user of this tenant', messageKey: 'projectAccessRequesterGone' })
        }
        const grantedRole = approve ? role ?? DEFAULT_PROJECT_ACCESS_ROLE : null
        const membership = isNil(grantedRole) ? null : await grantMembership({ log, projectId: project.id, userId: requester.id, role: grantedRole })
        const decided: ProjectAccessRequest = {
            ...request,
            status: approve ? ProjectAccessRequestStatus.APPROVED : ProjectAccessRequestStatus.REJECTED,
            decidedBy: actorId,
            decidedAt: dayjs().toISOString(),
            grantedRole: membership?.member.role ?? grantedRole,
        }
        await projectAccessRequestRepo().update({ id: request.id, tenantId }, {
            status: decided.status,
            decidedBy: decided.decidedBy,
            decidedAt: decided.decidedAt,
            grantedRole: decided.grantedRole,
        })
        return {
            request: decided,
            project,
            requesterEmail: requester.identity?.email ?? null,
            member: membership?.member ?? null,
            alreadyMember: membership?.alreadyMember ?? false,
        }
    },
})

async function findTeamProject({ tenantId, projectId }: ProjectParams): Promise<Project> {
    const project = await projectRepo().findOneBy({ id: projectId, tenantId, deleted: IsNull() })
    if (isNil(project) || project.type !== ProjectType.TEAM) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'project', entityId: projectId },
        })
    }
    return project
}

async function grantMembership({ log, projectId, userId, role }: GrantParams): Promise<{ member: ProjectMember, alreadyMember: boolean }> {
    const existing = await projectMemberRepo().findOneBy({ projectId, userId })
    if (!isNil(existing)) {
        return { member: existing, alreadyMember: true }
    }
    const member = await projectMemberService(log).upsert({ projectId, userId, role })
    return { member, alreadyMember: false }
}

async function withUsers({ tenantId, requests }: WithUsersParams): Promise<ProjectAccessRequestWithUser[]> {
    const userIds = [...new Set(requests.map((request) => request.userId))]
    const users = userIds.length === 0 ? [] : await userRepo().find({ where: { id: In(userIds), tenantId }, relations: { identity: true } })
    const byId = new Map(users.map((user) => [user.id, user]))
    return requests.map((request) => {
        const identity = byId.get(request.userId)?.identity
        return {
            ...request,
            userEmail: identity?.email ?? null,
            userFirstName: identity?.firstName ?? null,
            userLastName: identity?.lastName ?? null,
        }
    })
}

function validation({ message, messageKey }: { message: string, messageKey: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message, messageKey },
    })
}

function notFound(requestId: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: { entityType: 'project_access_request', entityId: requestId },
    })
}

const LIST_CAP = 200

type ProjectParams = {
    tenantId: string
    projectId: string
}

type UserParams = {
    tenantId: string
    userId: string
}

type CreateParams = UserParams & {
    projectId: string
    reason?: string
}

type CreateResult = {
    request: ProjectAccessRequest
    project: Project
    created: boolean
}

type WithdrawParams = UserParams & {
    requestId: string
}

type DecideParams = {
    tenantId: string
    requestId: string
    actorId: string
    approve: boolean
    role?: DefaultProjectRole
}

type DecideResult = {
    request: ProjectAccessRequest
    project: Project
    requesterEmail: string | null
    member: ProjectMember | null
    alreadyMember: boolean
}

type GrantParams = {
    log: FastifyBaseLogger
    projectId: string
    userId: string
    role: DefaultProjectRole
}

type WithUsersParams = {
    tenantId: string
    requests: ProjectAccessRequest[]
}

export type PendingForApprover = ProjectAccessRequestToReview

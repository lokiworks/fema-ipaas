import { isNil, TenantId } from '@fema-ipaas/core-utils'
import {
    FileType,
    PayloadLevel,
    PrivacyOverview,
    PrivacyPurgeEstimate,
    PrivacyRawViewer,
    PrivacySensitiveWorkflow,
    PrivacySettings,
    RawViewRole,
    UserStatus,
    workflowStructureUtil,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { userIdentityRepository } from '../authentication/user-identity/user-identity-service'
import { fileRepo, getEffectiveExecutionDataRetentionDays } from '../file/file.service'
import { projectRepo } from '../project/project-repo'
import { tenantService } from '../tenant/tenant.service'
import { userRepo } from '../user/user-service'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { privacyService, rawViewRoleUtils } from './privacy.service'

export const privacyOverviewService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: { tenantId: TenantId }): Promise<PrivacyOverview> {
        const settings = await privacyService(log).get({ tenantId })
        const projects = await projectRepo().find({ where: { tenantId }, select: ['id', 'displayName', 'executionDataRetentionDays'] })
        const [sensitiveWorkflows, rawViewers, purge] = await Promise.all([
            sensitiveWorkflowsOf({ projects }),
            rawViewersOf({ log, tenantId, settings }),
            purgeEstimateOf({ tenantId, settings, projects }),
        ])
        return { sensitiveWorkflows, rawViewersRecorded: settings.payloadLevel === PayloadLevel.FULL, rawViewers, purge }
    },
})

async function sensitiveWorkflowsOf({ projects }: { projects: ProjectRow[] }): Promise<PrivacySensitiveWorkflow[]> {
    if (projects.length === 0) {
        return []
    }
    const nameOfProject = new Map(projects.map((project) => [project.id, project.displayName]))
    const versions = await workflowVersionRepo()
        .createQueryBuilder('version')
        .innerJoin('workflow', 'workflow', 'workflow.id = version."workflowId"')
        .addSelect('workflow."projectId"', 'projectId')
        .where('workflow."projectId" IN (:...projectIds)', { projectIds: projects.map((project) => project.id) })
        .andWhere('version.id = (SELECT latest.id FROM workflow_version latest WHERE latest."workflowId" = version."workflowId" ORDER BY latest.created DESC LIMIT 1)')
        .andWhere('jsonb_path_exists(version.trigger, \'$.**.sensitiveOutput ? (@ == true)\')')
        .getRawAndEntities()
    const projectOfWorkflow = new Map(versions.raw.map((row) => [String(row['version_workflowId']), String(row['projectId'])]))
    return versions.entities
        .flatMap((version) => {
            const projectId = projectOfWorkflow.get(version.workflowId)
            if (isNil(projectId) || isNil(version.trigger)) {
                return []
            }
            const sensitiveNames = new Set(workflowStructureUtil.getSensitiveStepNames(version.trigger))
            const steps = workflowStructureUtil.getAllSteps(version.trigger)
                .filter((step) => sensitiveNames.has(step.name))
                .map((step) => ({ name: step.name, displayName: step.displayName }))
            return steps.length === 0
                ? []
                : [{ workflowId: version.workflowId, displayName: version.displayName, projectId, projectDisplayName: nameOfProject.get(projectId) ?? projectId, steps }]
        })
        .sort((a, b) => a.projectDisplayName.localeCompare(b.projectDisplayName) || a.displayName.localeCompare(b.displayName))
}

async function rawViewersOf({ log, tenantId, settings }: { log: FastifyBaseLogger, tenantId: TenantId, settings: PrivacySettings }): Promise<PrivacyRawViewer[]> {
    if (settings.payloadLevel !== PayloadLevel.FULL) {
        return []
    }
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    const users = await userRepo().find({ where: { tenantId, status: UserStatus.ACTIVE } })
    const withRole = users
        .map((user) => ({ user, role: rawViewRoleUtils.roleOf({ ownerId: tenant.ownerId, user }) }))
        .filter(({ role }) => settings.rawViewRoles.includes(role))
    const identities = withRole.length === 0 ? [] : await userIdentityRepository().find({ where: { id: In(withRole.map(({ user }) => user.identityId)) } })
    const identityById = new Map(identities.map((identity) => [identity.id, identity]))
    return withRole
        .flatMap(({ user, role }) => {
            const identity = identityById.get(user.identityId)
            return isNil(identity) ? [] : [{ userId: user.id, name: `${identity.firstName} ${identity.lastName}`.trim(), email: identity.email, role }]
        })
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
}

async function purgeEstimateOf({ tenantId, settings, projects }: { tenantId: TenantId, settings: PrivacySettings, projects: ProjectRow[] }): Promise<PrivacyPurgeEstimate> {
    const now = dayjs()
    const rawCutoff = now.subtract(settings.rawPayloadRetentionDays, 'day')
    const logCutoff = now.subtract(getEffectiveExecutionDataRetentionDays(settings.logRetentionDays), 'day')
    const projectIds = projects.map((project) => project.id)
    const byLogRetention = groupByLogRetention({ projects, tenantDays: settings.logRetentionDays, now })
    const [rawStates, webhookPayloads, identifiers, logFiles] = projectIds.length === 0
        ? [0, 0, 0, 0]
        : await Promise.all([
            countRawStates({ projectIds, cutoff: rawCutoff.toISOString() }),
            countWebhookPayloads({ tenantId, projectIds, cutoff: rawCutoff.toISOString() }),
            sumOver({ groups: byLogRetention, count: countRunIdentifiers }),
            sumOver({ groups: byLogRetention, count: countLogFiles }),
        ])
    return {
        nextRunAt: nextPurgeAt({ now }).toISOString(),
        rawStateCutoff: rawCutoff.toISOString(),
        logCutoff: logCutoff.toISOString(),
        rawStates,
        webhookPayloads,
        runIdentifiers: identifiers,
        logFiles,
    }
}

async function countRawStates({ projectIds, cutoff }: { projectIds: string[], cutoff: string }): Promise<number> {
    return executionRepo()
        .createQueryBuilder('execution')
        .where('execution."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('execution."displayLogsFileId" IS NOT NULL')
        .andWhere('execution."logsFileId" IS NOT NULL')
        .andWhere('execution."finishTime" < :cutoff', { cutoff })
        .getCount()
}

async function countWebhookPayloads({ tenantId, projectIds, cutoff }: { tenantId: TenantId, projectIds: string[], cutoff: string }): Promise<number> {
    return fileRepo()
        .createQueryBuilder('file')
        .where('file."tenantId" = :tenantId', { tenantId })
        .andWhere('file."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('file.type = :type', { type: FileType.WEBHOOK_PAYLOAD })
        .andWhere('file.created < :cutoff', { cutoff })
        .getCount()
}

async function countRunIdentifiers({ projectIds, cutoff }: RetentionGroup): Promise<number> {
    return executionRepo()
        .createQueryBuilder('execution')
        .where('execution."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('execution.created < :cutoff', { cutoff })
        .andWhere('(execution."businessKey" IS NOT NULL OR COALESCE(execution."failedStep"->>\'message\', \'\') <> \'\')')
        .getCount()
}

async function countLogFiles({ projectIds, cutoff }: RetentionGroup): Promise<number> {
    return fileRepo()
        .createQueryBuilder('file')
        .where('file."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('file.type IN (:...types)', { types: [FileType.EXECUTION_LOG, FileType.EXECUTION_LOG_SLICE] })
        .andWhere('file.created < :cutoff', { cutoff })
        .getCount()
}

async function sumOver({ groups, count }: { groups: RetentionGroup[], count: (group: RetentionGroup) => Promise<number> }): Promise<number> {
    const counts = await Promise.all(groups.map(count))
    return counts.reduce((sum, value) => sum + value, 0)
}

function groupByLogRetention({ projects, tenantDays, now }: { projects: ProjectRow[], tenantDays: number, now: dayjs.Dayjs }): RetentionGroup[] {
    const byDays = projects.reduce<Map<number, string[]>>((acc, project) => {
        const days = getEffectiveExecutionDataRetentionDays(Math.min(tenantDays, project.executionDataRetentionDays ?? Number.MAX_SAFE_INTEGER))
        return new Map(acc).set(days, [...(acc.get(days) ?? []), project.id])
    }, new Map())
    return [...byDays.entries()].map(([days, projectIds]) => ({ projectIds, cutoff: now.subtract(days, 'day').toISOString() }))
}

function nextPurgeAt({ now }: { now: dayjs.Dayjs }): dayjs.Dayjs {
    const thisHour = now.startOf('hour').add(PURGE_MINUTE, 'minute')
    return thisHour.isAfter(now) ? thisHour : thisHour.add(1, 'hour')
}

const PURGE_MINUTE = 17

const ROLE_ORDER: Record<RawViewRole, number> = {
    [RawViewRole.OWNER]: 0,
    [RawViewRole.ADMIN]: 1,
    [RawViewRole.MEMBER]: 2,
}

type ProjectRow = {
    id: string
    displayName: string
    executionDataRetentionDays?: number | null
}

type RetentionGroup = {
    projectIds: string[]
    cutoff: string
}

import { ApplicationError, ErrorCode, isNil, ProjectId } from '@fema-ipaas/core-utils'
import { WORKFLOW_NAME_MAX_LENGTH } from '@fema-ipaas/shared'
import { EntityManager } from 'typeorm'
import { instanceLimits } from '../../limits/instance-limits'
import { projectRepo } from '../../project/project-repo'
import { workflowRepo } from './workflow.repo'

export const workflowNaming = {
    async listNames({ projectId, excludeWorkflowId, entityManager }: ListNamesParams): Promise<string[]> {
        const rows: { displayName: string, workflowId: string }[] = await workflowRepo(entityManager).query(
            `SELECT DISTINCT ON (wv."workflowId") wv."workflowId" AS "workflowId", wv."displayName" AS "displayName"
             FROM workflow_version wv
             INNER JOIN workflow w ON w.id = wv."workflowId"
             WHERE w."projectId" = $1
             ORDER BY wv."workflowId", wv.created DESC`,
            [projectId],
        )
        return rows.filter((row) => row.workflowId !== excludeWorkflowId).map((row) => row.displayName)
    },

    async uniqueName({ projectId, displayName, entityManager }: UniqueNameParams): Promise<string> {
        const taken = await this.listNames({ projectId, entityManager })
        return workflowNameUtils.withSuffix({ base: displayName, taken })
    },

    async assertNameAvailable({ projectId, displayName, excludeWorkflowId }: AssertNameAvailableParams): Promise<void> {
        const taken = await this.listNames({ projectId, excludeWorkflowId })
        if (workflowNameUtils.isTaken({ name: displayName, taken })) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'workflowNameTaken' },
            })
        }
    },

    async assertCanAddWorkflows({ projectId, count }: AssertCanAddParams): Promise<void> {
        const project = await projectRepo().findOne({ where: { id: projectId }, select: ['id', 'workflowsLimit'] })
        if (isNil(project)) {
            return
        }
        const limit = project.workflowsLimit ?? instanceLimits.projectWorkflows()
        const existing = await workflowRepo().countBy({ projectId })
        if (existing + count > limit) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'projectWorkflowLimitReached' },
            })
        }
    },
}

function normalize(name: string): string {
    return name.trim().toLowerCase()
}

export const workflowNameUtils = {
    isTaken({ name, taken }: { name: string, taken: string[] }): boolean {
        const target = normalize(name)
        return taken.some((existing) => normalize(existing) === target)
    },
    withSuffix({ base, taken }: { base: string, taken: string[] }): string {
        const trimmed = base.trim().slice(0, WORKFLOW_NAME_MAX_LENGTH)
        if (!workflowNameUtils.isTaken({ name: trimmed, taken })) {
            return trimmed
        }
        const stem = trimmed.slice(0, WORKFLOW_NAME_MAX_LENGTH - 6)
        const next = Array.from({ length: taken.length + 1 }, (_, index) => `${stem} (${index + 2})`)
            .find((candidate) => !workflowNameUtils.isTaken({ name: candidate, taken }))
        return next ?? `${stem} (${taken.length + 2})`
    },
}

type ListNamesParams = {
    projectId: ProjectId
    excludeWorkflowId?: string
    entityManager?: EntityManager
}

type UniqueNameParams = {
    projectId: ProjectId
    displayName: string
    entityManager?: EntityManager
}

type AssertNameAvailableParams = {
    projectId: ProjectId
    displayName: string
    excludeWorkflowId?: string
}

type AssertCanAddParams = {
    projectId: ProjectId
    count: number
}

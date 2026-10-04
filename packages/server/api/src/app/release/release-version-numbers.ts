import { WorkflowVersionState } from '@fema-ipaas/shared'
import { In } from 'typeorm'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'

export const releaseVersionNumbers = {
    async forWorkflows({ workflowIds }: { workflowIds: string[] }): Promise<Map<string, number>> {
        if (workflowIds.length === 0) {
            return new Map()
        }
        const locked = await workflowVersionRepo().find({
            where: { workflowId: In(workflowIds), state: WorkflowVersionState.LOCKED },
            select: ['id', 'workflowId', 'created'],
        })
        const ordered = [...locked].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime() || a.id.localeCompare(b.id))
        const counters = new Map<string, number>()
        return new Map(ordered.map((version): [string, number] => {
            const next = (counters.get(version.workflowId) ?? 0) + 1
            counters.set(version.workflowId, next)
            return [version.id, next]
        }))
    },
}

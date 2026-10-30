import { PropertyExecutionType, SolutionCheckKind, SolutionPackage, WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_SOLUTIONS } from '../../src/app/solution/official-solutions'

const OBJECT_INPUTS: Record<string, string[]> = {
    create_bitable_record: ['fields'],
    update_bitable_record: ['fields'],
}

function solutionById(id: string): SolutionPackage {
    const solution = OFFICIAL_SOLUTIONS.find((item) => item.id === id)
    if (solution === undefined) {
        throw new Error(`official solution ${id} missing`)
    }
    return SolutionPackage.parse(solution.package)
}

describe('official solutions install contract', () => {
    it('marks every object input that is filled by an expression as dynamic, so the editor does not split the expression into characters', () => {
        const offenders = OFFICIAL_SOLUTIONS.flatMap((solution) => SolutionPackage.parse(solution.package).workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).flatMap((step) => {
            if (step.type !== WorkflowActionType.CONNECTOR) {
                return []
            }
            const keys = OBJECT_INPUTS[step.settings.actionName ?? ''] ?? []
            return keys
                .filter((key) => typeof step.settings.input[key] === 'string')
                .filter((key) => step.settings.propertySettings[key]?.type !== PropertyExecutionType.DYNAMIC)
                .map((key) => `${solution.id}/${workflow.key}/${step.name}.${key}`)
        })))
        expect(offenders).toEqual([])
    })

    it('covers both Bitable writes that take their fields from an earlier step', () => {
        const dynamicFields = OFFICIAL_SOLUTIONS.flatMap((solution) => SolutionPackage.parse(solution.package).workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).filter((step) => step.type === WorkflowActionType.CONNECTOR && step.settings.propertySettings['fields']?.type === PropertyExecutionType.DYNAMIC).map(() => solution.id)))
        expect(new Set(dynamicFields)).toEqual(new Set(['official-beisen-bitable-roster', 'official-feishu-approval-ledger']))
    })

    it('lets people sync pick the organization sub-flow from an installed organization solution instead of typing its id', () => {
        const pkg = solutionById('official-beisen-feishu')
        const orgWorkflow = pkg.config.find((item) => item.key === 'orgWorkflow')
        expect(orgWorkflow?.required).toBe(false)
        expect(orgWorkflow?.workflowFrom).toEqual({ solutionId: 'official-beisen-feishu-org', workflowKey: 'converge' })
        const dependency = pkg.checks.find((check) => check.kind === SolutionCheckKind.SOLUTION)
        expect(dependency).toMatchObject({ solutionId: 'official-beisen-feishu-org', blocking: false })
    })

    it('points the WeCom and DingTalk people sync at their own organization solution', () => {
        for (const target of ['wecom', 'dingtalk']) {
            const pkg = solutionById(`official-beisen-${target}`)
            expect(pkg.config.find((item) => item.key === 'orgWorkflow')?.workflowFrom?.solutionId).toBe(`official-beisen-${target}-org`)
            expect(pkg.checks.find((check) => check.kind === SolutionCheckKind.SOLUTION)?.solutionId).toBe(`official-beisen-${target}-org`)
        }
    })

    it('moves filling the mapping table after installing, because the table only exists once installed', () => {
        for (const id of ['official-beisen-feishu', 'official-beisen-bitable-roster']) {
            const afterInstall = solutionById(id).checks.filter((check) => check.afterInstall === true)
            expect(afterInstall).toHaveLength(1)
            expect(afterInstall[0].label).toContain('映射表')
            expect(afterInstall[0].blocking).toBe(false)
        }
    })
})

import { SolutionPackage, WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared'
import { OFFICIAL_SOLUTIONS } from '../../src/app/solution/official-solutions'

for (const target of ['wecom', 'dingtalk']) {
    it(`builds ${target} people and organization packages with target-specific identities and notices`, () => {
        const solution = OFFICIAL_SOLUTIONS.find((item) => item.id === `official-beisen-${target}`)
        if (!solution) throw new Error('Missing directory solution')
        const pkg = SolutionPackage.parse(solution.package)
        expect(pkg.workflows.map((workflow) => workflow.key)).toEqual(['onboard', 'transfer', 'leave', 'repair'])
        const steps = pkg.workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger))
        const mutations = steps.filter((step) => step.type === WorkflowActionType.CONNECTOR && step.settings.connectorName === `@fema-ipaas/connector-${target}`)
        expect(mutations.some((step) => step.settings.actionName === 'provision_user' && typeof step.settings.input['userid'] === 'string')).toBe(true)
        expect(JSON.stringify(pkg)).not.toContain('connector-feishu')
        expect(JSON.stringify(pkg)).toContain(`${target}:leave-notified:`)
        if (target === 'dingtalk') {
            expect(pkg.config.some((item) => item.key === 'pendingDepartmentId')).toBe(true)
            expect(pkg.reconciliationRules[0].expectations.find((item) => item.aspect === 'suspension')?.expect).toEqual({ kind: 'FLAG', targetPath: 'pending_resignation', value: true })
        }
        const org = OFFICIAL_SOLUTIONS.find((item) => item.id === `official-beisen-${target}-org`)
        expect(org?.package.mappingTables[0].name).toBe(pkg.mappingTables[0].name)
        expect(JSON.stringify(org?.package)).toContain('{{upsert.output.id}}')
    })
}

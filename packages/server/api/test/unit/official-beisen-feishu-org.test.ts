import { SolutionPackage, solutionUtils, workflowStructureUtil } from '@fema-ipaas/shared'
import { OFFICIAL_SOLUTIONS } from '../../src/app/solution/official-solutions'
import { solutionPackageUtils } from '../../src/app/solution/solution-package-utils'

it('shares one callable convergence workflow between scheduled and change wakeups', () => {
    const solution = OFFICIAL_SOLUTIONS.find((item) => item.id === 'official-beisen-feishu-org')
    if (!solution) throw new Error('Missing organization solution')
    const pkg = SolutionPackage.parse(solution.package)
    expect(pkg.workflows.map((workflow) => workflow.key)).toEqual(['converge', 'scheduled', 'changed'])
    const core = pkg.workflows[0]
    expect(core.trigger.settings.concurrency).toEqual({ maxConcurrentRuns: 1 })
    const calls = pkg.workflows.slice(1).flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).filter((step) => step.settings?.actionName === 'callWorkflow'))
    expect(calls.map((step) => step.settings?.input?.workflowId)).toEqual(['workflow:converge', 'workflow:converge'])
    for (const workflow of pkg.workflows.slice(1)) {
        const linked = solutionPackageUtils.linkWorkflows({ trigger: workflow.trigger, externalIdByKey: new Map([['converge', 'published-converge']]) })
        expect(JSON.stringify(linked)).not.toContain('workflow:')
        expect(JSON.stringify(linked)).toContain('published-converge')
    }
    expect(pkg.checks.find((check) => check.kind === 'MANUAL')?.blocking).toBe(true)
    const config = solutionUtils.resolveConfig({ items: pkg.config, provided: { rootOrganizationId: '1', itChatId: 'oc_it' } })
    expect(config.errors).toEqual([])
})

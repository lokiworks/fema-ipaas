import { SolutionPackage, workflowStructureUtil } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_SOLUTIONS } from '../../src/app/solution/official-solutions'
import { solutionPackageUtils } from '../../src/app/solution/solution-package-utils'

const official = OFFICIAL_SOLUTIONS.find((solution) => solution.id === 'official-beisen-feishu')

function pkg(): SolutionPackage {
    if (official === undefined) {
        throw new Error('official solution missing')
    }
    return official.package
}

describe('official Beisen to Feishu solution', () => {
    it('is a valid package with employee event workflows and a current-state repair workflow and one mapping table', () => {
        const parsed = SolutionPackage.parse(pkg())
        expect(parsed.workflows.map((workflow) => workflow.key)).toEqual(['onboard', 'transfer', 'leave', 'repair'])
        expect(parsed.mappingTables).toHaveLength(1)
        expect(parsed.mappingTables[0].rows).toEqual([])
    })

    it('needs a Beisen and a Feishu connection and gates installation on both', () => {
        const connections = pkg().connections.map((slot) => slot.connectorName).sort()
        expect(connections).toEqual(['@fema-ipaas/connector-beisen', '@fema-ipaas/connector-feishu'])
        const blocking = pkg().checks.filter((check) => check.blocking).map((check) => check.connectorName).sort()
        expect(blocking).toEqual(connections)
    })

    it('asks for both group ids and has no default so nothing is posted to a wrong chat', () => {
        const items = pkg().config
        expect(items.map((item) => item.key)).toEqual(['hrChatId', 'itChatId', 'rootOrganizationId', 'orgWorkflow'])
        expect(items.every((item) => item.defaultValue === '')).toBe(true)
    })

    it('keeps the workflows reading the documented v5 fields and the effective-leaving scope', () => {
        const text = JSON.stringify(pkg().workflows)
        expect(text).toContain('[\'recordInfo\'][\'oIdDepartment\']')
        expect(text).toContain('[\'employeeInfo\'][\'mobilePhone\']')
        expect(text).toContain('"statusScope":"LEFT"')
        expect(text).toContain('"filterColumn":"recordInfo.changeTypeOID"')
    })

    it('runs one employee at a time on onboarding and transfer, and counts a return to an earlier department as a new event', () => {
        const triggerOf = (key: string) => {
            const workflow = pkg().workflows.find((candidate) => candidate.key === key)
            const settings = workflow?.trigger.settings
            return settings !== undefined && 'dedupe' in settings ? settings : undefined
        }
        expect(triggerOf('onboard')?.concurrency).toEqual({ maxConcurrentRuns: 0, orderKeyPath: '{{trigger.recordInfo.jobNumber}}' })
        expect(triggerOf('transfer')?.concurrency).toEqual({ maxConcurrentRuns: 0, orderKeyPath: '{{trigger.recordInfo.jobNumber}}' })
        expect(triggerOf('leave')?.concurrency).toEqual({ maxConcurrentRuns: 1 })
        expect(triggerOf('transfer')?.dedupe?.keyPath).toContain('{{trigger.recordInfo.startDate}}')
    })

    it('records that a notice was sent right after sending it and checks the record first, so a run that was cut off and started again neither skips nor repeats the notice', () => {
        const stepsOf = (key: string) => {
            const workflow = pkg().workflows.find((candidate) => candidate.key === key)
            return workflow === undefined ? [] : workflowStructureUtil.getAllSteps(workflow.trigger).map((step) => step.name)
        }
        const onboard = stepsOf('onboard')
        const leave = stepsOf('leave')
        expect(onboard.indexOf('check_notified')).toBeLessThan(onboard.indexOf('notify_hr'))
        expect(onboard.indexOf('notify_hr')).toBeLessThan(onboard.indexOf('mark_notified'))
        expect(leave.indexOf('check_notified')).toBeLessThan(leave.indexOf('notify_it'))
        expect(leave.indexOf('notify_it')).toBeLessThan(leave.indexOf('mark_notified'))
        expect(onboard).not.toContain('only_when_created')
    })

    it('gives both notices a dedupe key so Feishu itself drops a repeat sent within the hour', () => {
        const text = JSON.stringify(pkg().workflows)
        expect(text).toContain('"dedupeKey":"onboard-notified:')
        expect(text).toContain('"dedupeKey":"leave-notified:')
    })

    it('uses only store scopes the Store connector accepts, a wrong value only fails when the first employee arrives', () => {
        const scopes = pkg().workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).flatMap((step) => {
            const input = step.settings?.input
            return step.settings?.connectorName === '@fema-ipaas/connector-store' && input !== undefined ? [input.store_scope] : []
        }))
        expect(scopes.length).toBeGreaterThan(0)
        scopes.forEach((scope) => expect(['COLLECTION', 'WORKFLOW', 'RUN']).toContain(scope))
    })

    it('fills connections, chat ids and the mapping table when installed', () => {
        const items = pkg().config
        const tableIdByKey = new Map([['department', 'tbl_real']])
        const connections = { '@fema-ipaas/connector-beisen': 'beisen-real', '@fema-ipaas/connector-feishu': 'feishu-real' }
        const config = { hrChatId: 'oc_hr', itChatId: 'oc_it' }

        const instantiated = pkg().workflows.map((workflow) => solutionPackageUtils.instantiate({ workflow, items, config, connections, tableIdByKey }))
        const text = JSON.stringify(instantiated)

        expect(text).not.toContain('table:')
        expect(text).toContain('tbl_real')
        expect(text).toContain('{{connections[\'beisen-real\']}}')
        expect(text).toContain('{{connections[\'feishu-real\']}}')
        const chatIds = instantiated.flatMap((trigger) => workflowStructureUtil.getAllSteps(trigger).map((step) => step.settings?.input?.chatId)).filter((value) => value !== undefined)
        expect([...new Set(chatIds)].sort()).toEqual(['oc_hr', 'oc_it'])
    })
    it('recovers missing department bindings before mapping and repairs according to the latest source status', () => {
        const onboarding = pkg().workflows.find((workflow) => workflow.key === 'onboard')
        if (!onboarding) throw new Error('Missing onboard workflow')
        const steps = workflowStructureUtil.getAllSteps(onboarding.trigger).map((step) => step.name)
        expect(steps.indexOf('recover_department')).toBeLessThan(steps.indexOf('map_department'))
        expect(steps.indexOf('ensure_department')).toBeGreaterThan(steps.indexOf('provision'))
        const repair = pkg().workflows.find((workflow) => workflow.key === 'repair')
        if (!repair) throw new Error('Missing repair workflow')
        const repairSteps = workflowStructureUtil.getAllSteps(repair.trigger).map((step) => step.name)
        expect(new Set(repairSteps).size).toBe(repairSteps.length)
        expect(repairSteps).toContain('active_ensure_department')
        expect(repairSteps).toContain('left_suspend')
        expect(pkg().reconciliationRules[0]).toMatchObject({ workflowKey: 'repair', source: { keyPath: 'recordInfo.jobNumber' }, target: { keyPath: 'employee_no' }, repair: { readActionName: 'get_employee_record', keyInput: 'employeeNo' } })
        expect(pkg().reconciliationRules[0].expectations.map((check) => check.expect.kind)).toEqual(['EXISTS', 'CONTAINS', 'FLAG'])
    })

})

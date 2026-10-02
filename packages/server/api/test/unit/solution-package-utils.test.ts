import { SolutionConfigType, SolutionWorkflow, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { solutionPackageUtils } from '../../src/app/solution/solution-package-utils'

const NOW = '2026-10-02T00:00:00.000Z'

function trigger(): WorkflowTrigger {
    return WorkflowTrigger.parse({
        name: 'trigger',
        valid: true,
        displayName: 'Employee changed',
        type: 'CONNECTOR_TRIGGER',
        lastUpdatedDate: NOW,
        settings: {
            propertySettings: {},
            connectorName: '@fema-ipaas/connector-beisen',
            connectorVersion: '0.2.0',
            triggerName: 'employee_changed',
            input: { auth: '{{connections[\'beisen-prod\']}}', timezone: 'Asia/Shanghai' },
            sampleData: { sampleDataFileId: 'f1', lastTestDate: NOW },
        },
        nextAction: {
            name: 'step_1',
            valid: true,
            displayName: 'Provision account',
            type: 'CONNECTOR',
            lastUpdatedDate: NOW,
            settings: {
                propertySettings: {},
                connectorName: '@fema-ipaas/connector-feishu',
                connectorVersion: '0.3.0',
                actionName: 'provision_user',
                input: {
                    auth: '{{connections[\'feishu-prod\']}}',
                    departmentId: { transforms: [{ type: 'LOOKUP', arg: 'mt_dept' }] },
                    chat: 'HR group',
                },
                errorHandlingOptions: {},
            },
        },
    })
}

function workflow(): SolutionWorkflow {
    return { key: 'onboard', name: 'Onboard', description: 'Open the account', trigger: trigger(), schemaVersion: null }
}

const table = { id: 'mt_dept', key: 'dept', name: 'Departments', description: '', keyLabel: 'Beisen dept', valueLabel: 'Feishu dept', missingBehavior: 'ERROR' as never, defaultValue: null, rows: [{ k: 'R&D', v: 'od-1' }] }

describe('solutionPackageUtils.buildPackage', () => {
    it('takes the connection out, keeps a slot per connector and replaces table ids with placeholders', () => {
        const pkg = solutionPackageUtils.buildPackage({ workflows: [workflow()], tables: [table, { ...table, id: 'mt_other', key: 'other' }], manualChecks: [{ label: 'The Feishu app can see all departments' }] })

        expect(pkg.connections).toEqual([
            { connectorName: '@fema-ipaas/connector-beisen', usedBy: ['onboard'] },
            { connectorName: '@fema-ipaas/connector-feishu', usedBy: ['onboard'] },
        ])
        const steps = workflowStructureUtil.getAllSteps(pkg.workflows[0].trigger)
        expect(steps.every((step) => step.settings?.input?.auth === undefined)).toBe(true)
        expect(JSON.stringify(pkg.workflows[0].trigger)).toContain('table:dept')
        expect(JSON.stringify(pkg.workflows[0].trigger)).not.toContain('mt_dept')
        expect(pkg.mappingTables.map((item) => item.key)).toEqual(['dept'])
        expect(pkg.mappingTables[0]).not.toHaveProperty('id')
    })

    it('drops sample data and checks every connection plus the manual ones', () => {
        const pkg = solutionPackageUtils.buildPackage({ workflows: [workflow()], tables: [table], manualChecks: [{ label: 'Check scope', who: 'Feishu admin' }] })

        expect(JSON.stringify(pkg.workflows[0].trigger)).not.toContain('f1')
        expect(pkg.checks.map((check) => `${check.kind}:${check.blocking}`)).toEqual(['CONNECTION:true', 'CONNECTION:true', 'MANUAL:false'])
        expect(pkg.checks[2]).toMatchObject({ label: 'Check scope', who: 'Feishu admin' })
    })
})

describe('solutionPackageUtils.instantiate', () => {
    const pkg = solutionPackageUtils.buildPackage({ workflows: [workflow()], tables: [table], manualChecks: [] })
    const items = [{
        key: 'hrChat',
        label: 'HR chat',
        type: SolutionConfigType.TEXT,
        options: [],
        defaultValue: 'HR group',
        affectsWorkflows: ['onboard'],
        patches: [{ workflowKey: 'onboard', stepName: 'step_1', inputKey: 'chat' }],
    }]

    it('binds the chosen connections, the new table ids and the configuration', () => {
        const result = solutionPackageUtils.instantiate({
            workflow: pkg.workflows[0],
            items,
            config: { hrChat: 'IT desk' },
            connections: { '@fema-ipaas/connector-beisen': 'beisen-test', '@fema-ipaas/connector-feishu': 'feishu-test' },
            tableIdByKey: new Map([['dept', 'mt_new']]),
        })

        const [first, second] = workflowStructureUtil.getAllSteps(result)
        expect(first.settings?.input?.auth).toBe('{{connections[\'beisen-test\']}}')
        expect(second.settings?.input?.auth).toBe('{{connections[\'feishu-test\']}}')
        expect(second.settings?.input?.chat).toBe('IT desk')
        expect(JSON.stringify(result)).toContain('mt_new')
        expect(JSON.stringify(result)).not.toContain('table:dept')
    })

    it('uses the default value when the configuration omits the item', () => {
        const result = solutionPackageUtils.instantiate({
            workflow: pkg.workflows[0],
            items,
            config: {},
            connections: {},
            tableIdByKey: new Map([['dept', 'mt_new']]),
        })

        expect(workflowStructureUtil.getAllSteps(result)[1].settings?.input?.chat).toBe('HR group')
    })
})

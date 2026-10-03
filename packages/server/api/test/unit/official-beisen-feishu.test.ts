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
    it('is a valid package with the three workflows and one mapping table', () => {
        const parsed = SolutionPackage.parse(pkg())
        expect(parsed.workflows.map((workflow) => workflow.key)).toEqual(['onboard', 'transfer', 'leave'])
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
        expect(items.map((item) => item.key)).toEqual(['hrChatId', 'itChatId'])
        expect(items.every((item) => item.defaultValue === '')).toBe(true)
    })

    it('keeps the workflows reading the documented v5 fields and the effective-leaving scope', () => {
        const text = JSON.stringify(pkg().workflows)
        expect(text).toContain('[\'recordInfo\'][\'oIdDepartment\']')
        expect(text).toContain('[\'employeeInfo\'][\'mobilePhone\']')
        expect(text).toContain('"statusScope":"LEFT"')
        expect(text).toContain('"filterColumn":"recordInfo.changeTypeOID"')
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
        expect(chatIds.sort()).toEqual(['oc_hr', 'oc_it'])
    })
})

import { describe, expect, it } from 'vitest'
import { beisenDirectorySolutions } from '../../../../src/app/solution/official/beisen-directory'

describe('beisenDirectorySolutions', () => {
    it.each(['wecom', 'dingtalk'] as const)('keeps the connection slots and checks for %s', (target) => {
        for (const solution of [beisenDirectorySolutions.people({ target }), beisenDirectorySolutions.organization({ target })]) {
            const connectorNames = solution.package.connections.map((slot) => slot.connectorName)
            expect(connectorNames).toContain(`@fema-ipaas/connector-${target}`)
            expect(connectorNames).not.toContain('@fema-ipaas/connector-feishu')
            const connectionChecks = solution.package.checks.filter((check) => check.kind === 'CONNECTION')
            expect(connectionChecks.map((check) => check.connectorName)).toEqual(connectorNames)
        }
    })

    it('words the dingtalk leave step without dangling the account suffix', () => {
        const text = JSON.stringify(beisenDirectorySolutions.people({ target: 'dingtalk' }).package)
        expect(text).toContain('员工离职移动到待离职部门，账号不暂停')
        expect(text).not.toContain('（不暂停）账号')
    })

    it('words the wecom leave step as disabling the account', () => {
        const text = JSON.stringify(beisenDirectorySolutions.people({ target: 'wecom' }).package)
        expect(text).toContain('员工离职停用企业微信账号')
    })
    it('keeps the dingtalk repair workflow free of suspend wording and honest about reading beisen', () => {
        const repair = beisenDirectorySolutions.people({ target: 'dingtalk' }).package.workflows.find((workflow) => workflow.key === 'repair')
        expect(repair?.description).not.toContain('暂停')
        expect(repair?.description).toContain('本流程自身不再读取北森')
        expect(JSON.stringify(repair)).not.toContain('离职暂停')
    })
})

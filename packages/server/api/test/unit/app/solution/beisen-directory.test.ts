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
})

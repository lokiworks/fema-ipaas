import { SolutionPackage } from '@fema-ipaas/shared'
import { beisenBitableRosterSolution } from './official/beisen-bitable-roster'
import { beisenDirectorySolutions } from './official/beisen-directory'
import { beisenFeishuSolution } from './official/beisen-feishu'
import { beisenFeishuOrgSolution } from './official/beisen-feishu-org'
import { feishuApprovalLedgerSolution } from './official/feishu-approval-ledger'

export const OFFICIAL_SOLUTIONS: OfficialSolution[] = [beisenFeishuSolution(), beisenBitableRosterSolution(), feishuApprovalLedgerSolution(), beisenFeishuOrgSolution(), beisenDirectorySolutions.people({ target: 'wecom' }), beisenDirectorySolutions.organization({ target: 'wecom' }), beisenDirectorySolutions.people({ target: 'dingtalk' }), beisenDirectorySolutions.organization({ target: 'dingtalk' })]

export type OfficialSolution = {
    id: string
    name: string
    summary: string
    category: string
    version: string
    notes: string
    publishedAt: string
    package: SolutionPackage
}

import { SolutionPackage } from '@fema-ipaas/shared'
import { beisenFeishuSolution } from './official/beisen-feishu'

export const OFFICIAL_SOLUTIONS: OfficialSolution[] = [beisenFeishuSolution()]

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

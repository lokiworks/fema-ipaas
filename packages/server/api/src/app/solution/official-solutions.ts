import { SolutionPackage } from '@fema-ipaas/shared'

export const OFFICIAL_SOLUTIONS: OfficialSolution[] = []

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

function compose({ runs, failedRuns, openIssues, newIssues, projectCount }: DigestCounts): DigestMessage {
    const title = `Weekly summary: ${runs} ${plural({ count: runs, word: 'run' })}, ${failedRuns} failed`
    const lines = [
        `Across your ${projectCount} ${plural({ count: projectCount, word: 'project' })} in the last 7 days:`,
        `• ${runs} production ${plural({ count: runs, word: 'run' })}, ${failedRuns} failed or timed out`,
        `• ${newIssues} new ${plural({ count: newIssues, word: 'issue' })}, ${openIssues} still open`,
    ]
    return { title, body: lines.join('\n') }
}

function isWorthSending(counts: DigestCounts): boolean {
    return counts.projectCount > 0
}

function plural({ count, word }: { count: number, word: string }): string {
    return count === 1 ? word : `${word}s`
}

export const weeklyDigestUtils = {
    compose,
    isWorthSending,
}

export type DigestCounts = {
    runs: number
    failedRuns: number
    openIssues: number
    newIssues: number
    projectCount: number
}

type DigestMessage = {
    title: string
    body: string
}

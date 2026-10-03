function compose({ runs, failedRuns, openIssues, newIssues, projectCount }: DigestCounts): DigestMessage {
    const title = `每周摘要：${runs} 次运行，${failedRuns} 次失败`
    const lines = [
        `过去 7 天，你参与的 ${projectCount} 个项目：`,
        `• 生产环境运行 ${runs} 次，其中 ${failedRuns} 次失败或超时`,
        `• 新增问题 ${newIssues} 个，仍未解决 ${openIssues} 个`,
    ]
    return { title, body: lines.join('\n') }
}

function isWorthSending(counts: DigestCounts): boolean {
    return counts.projectCount > 0
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

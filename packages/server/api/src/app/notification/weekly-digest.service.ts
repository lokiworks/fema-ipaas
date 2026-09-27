import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { FAILED_STATES, IssueStatus, RunEnvironment, UserStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, MoreThanOrEqual } from 'typeorm'
import { connectionAccessService } from '../connection/connection-access.service'
import { domainHelper } from '../helper/domain-helper'
import { emailService } from '../helper/email/email-service'
import { issueRepo } from '../issue/issue.service'
import { userRepo } from '../user/user-service'
import { executionRepo } from '../workflows/execution/execution-service'
import { DigestCounts, weeklyDigestUtils } from './weekly-digest-utils'

export const weeklyDigestService = (log: FastifyBaseLogger) => ({
    async sendAll(): Promise<number> {
        if (!emailService(log).isConfigured()) {
            return 0
        }
        const subscribers = await userRepo()
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.identity', 'identity')
            .where('user.status = :status', { status: UserStatus.ACTIVE })
            .andWhere('user."tenantId" IS NOT NULL')
            .andWhere('user."notificationPreferences" -> \'weeklyDigest\' ->> \'email\' = \'true\'')
            .getMany()
        const since = dayjs().subtract(DIGEST_WINDOW_DAYS, 'day').toDate()
        const link = await domainHelper.getPublicUrl({ path: '' })
        const sent = await subscribers.reduce<Promise<number>>(async (previous, user) => {
            const count = await previous
            if (isNil(user.tenantId) || isNil(user.identity)) {
                return count
            }
            const tenantId = user.tenantId
            const email = user.identity.email
            const { error } = await tryCatch(async () => {
                const counts = await countsFor({ userId: user.id, tenantId, since, log })
                if (!weeklyDigestUtils.isWorthSending(counts)) {
                    return
                }
                const message = weeklyDigestUtils.compose(counts)
                await emailService(log).sendAlert({ tenantId, to: email, title: message.title, body: message.body, link })
            })
            if (!isNil(error)) {
                log.error({ error, user: { id: user.id } }, '[weeklyDigestService#sendAll] Failed to send weekly digest')
                return count
            }
            return count + 1
        }, Promise.resolve(0))
        log.info({ sentCount: sent }, '[weeklyDigestService#sendAll] Weekly digests sent')
        return sent
    },
})

async function countsFor({ userId, tenantId, since, log }: CountsForParams): Promise<DigestCounts> {
    const projectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
    if (projectIds.length === 0) {
        return { runs: 0, failedRuns: 0, openIssues: 0, newIssues: 0, projectCount: 0 }
    }
    const runScope = { projectId: In(projectIds), environment: RunEnvironment.PRODUCTION, created: MoreThanOrEqual(since.toISOString()) }
    const [runs, failedRuns, openIssues, newIssues] = await Promise.all([
        executionRepo().countBy(runScope),
        executionRepo().countBy({ ...runScope, status: In(FAILED_STATES) }),
        issueRepo().countBy({ projectId: In(projectIds), status: In([IssueStatus.OPEN, IssueStatus.INVESTIGATING]) }),
        issueRepo().countBy({ projectId: In(projectIds), firstSeenAt: MoreThanOrEqual(since.toISOString()) }),
    ])
    return { runs, failedRuns, openIssues, newIssues, projectCount: projectIds.length }
}

const DIGEST_WINDOW_DAYS = 7

type CountsForParams = {
    userId: string
    tenantId: string
    since: Date
    log: FastifyBaseLogger
}

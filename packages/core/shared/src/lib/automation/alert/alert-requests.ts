import { z } from 'zod'
import { CAPACITY_ALERT_THRESHOLDS } from '../../governance/instance-limits'
import {
    AlertEscalation,
    AlertRecordKind,
    AlertTriggerEvent,
    FailureRateCondition,
    NotificationChannelType,
    QuietHours,
} from './alert'

export const UpsertNotificationChannelRequestBody = z.object({
    name: z.string().trim().min(1, 'formErrors.required').max(30, 'channelNameTooLong'),
    type: z.enum(NotificationChannelType),
    url: z.string().trim().optional(),
    secret: z.string().optional(),
    recipients: z.array(z.string().trim()).optional(),
}).superRefine((body, ctx) => {
    const problem = channelProblem(body)
    if (problem !== null) {
        ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message })
    }
})
export type UpsertNotificationChannelRequestBody = z.infer<typeof UpsertNotificationChannelRequestBody>

export const UpsertAlertPolicyRequestBody = z.object({
    name: z.string().trim().min(1, 'formErrors.required').max(30, 'alertPolicyNameTooLong'),
    enabled: z.boolean(),
    projectIds: z.array(z.string()),
    workflowIds: z.array(z.string()),
    events: z.array(z.enum(AlertTriggerEvent)).min(1, 'alertPolicyEventsRequired'),
    failureRate: FailureRateCondition.nullable(),
    capacityThresholdPercent: z.number().int().refine(isCapacityThreshold, 'invalidCapacityThreshold').nullable().optional(),
    groupWindowMinutes: z.number().int('alertGroupWindowOutOfRange').min(1, 'alertGroupWindowOutOfRange').max(1440, 'alertGroupWindowOutOfRange'),
    quietHours: QuietHours.default({ enabled: false, from: '22:00', to: '08:00', timezone: 'UTC' }),
    escalation: AlertEscalation,
    channelIds: z.array(z.string()).min(1, 'alertPolicyChannelsRequired'),
})
export type UpsertAlertPolicyRequestBody = z.infer<typeof UpsertAlertPolicyRequestBody>
export type UpsertAlertPolicyRequestInput = z.input<typeof UpsertAlertPolicyRequestBody>

export const ListAlertRecordsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    policyId: z.string().optional(),
    kind: z.enum(AlertRecordKind).optional(),
})
export type ListAlertRecordsRequestQuery = z.infer<typeof ListAlertRecordsRequestQuery>

export const TestNotificationChannelResponse = z.object({
    success: z.boolean(),
    error: z.string().nullable(),
})
export type TestNotificationChannelResponse = z.infer<typeof TestNotificationChannelResponse>

export const AlertRecordStats = z.object({
    alertsLast7Days: z.number(),
    mergedFailuresLast7Days: z.number(),
    issuesLast7Days: z.number(),
})
export type AlertRecordStats = z.infer<typeof AlertRecordStats>

function isCapacityThreshold(value: number): boolean {
    return CAPACITY_ALERT_THRESHOLDS.includes(value)
}

function channelProblem(body: ChannelDraft): ChannelProblem | null {
    if (body.type === NotificationChannelType.EMAIL) {
        const recipients = body.recipients ?? []
        const valid = recipients.length > 0 && recipients.length <= MAX_EMAIL_RECIPIENTS && recipients.every((r) => EMAIL_PATTERN.test(r))
        return valid ? null : { path: 'recipients', message: 'invalidEmailRecipients' }
    }
    const url = body.url ?? ''
    if (url.length > 0 && !URL_PREFIX_BY_TYPE[body.type].some((prefix) => url.startsWith(prefix))) {
        return { path: 'url', message: 'invalidChannelUrl' }
    }
    if (body.type === NotificationChannelType.DINGTALK && body.secret !== undefined && body.secret.length > 0 && !body.secret.startsWith('SEC')) {
        return { path: 'secret', message: 'invalidDingtalkSecret' }
    }
    return null
}

const MAX_EMAIL_RECIPIENTS = 20
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const URL_PREFIX_BY_TYPE: Record<Exclude<NotificationChannelType, NotificationChannelType.EMAIL>, string[]> = {
    [NotificationChannelType.FEISHU]: ['https://open.feishu.cn/open-apis/bot/v2/hook/', 'https://open.larksuite.com/open-apis/bot/v2/hook/'],
    [NotificationChannelType.WECOM]: ['https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key='],
    [NotificationChannelType.DINGTALK]: ['https://oapi.dingtalk.com/robot/send?access_token='],
    [NotificationChannelType.SLACK]: ['https://hooks.slack.com/services/'],
    [NotificationChannelType.WEBHOOK]: ['https://', 'http://'],
}

type ChannelDraft = {
    type: NotificationChannelType
    url?: string
    secret?: string
    recipients?: string[]
}

type ChannelProblem = {
    path: string
    message: string
}

import { isNil } from '../utils'
import { BlueprintStatusConfig, BlueprintStatusUnmatched } from './blueprint-definition'
import { blueprintTemplate } from './blueprint-template'

export const blueprintStatus = {
    defaults(): BlueprintStatusConfig {
        return {
            codePath: 'body.code',
            messagePath: 'body.message',
            unmatched: BlueprintStatusUnmatched.FAIL,
            rules: [
                { code: '0', success: true, retry: false, tip: '' },
                { code: '401', success: false, retry: false, tip: '认证失败，检查连接是否过期' },
                { code: '429', success: false, retry: true, tip: '触发限流，稍后自动重试' },
                { code: '500', success: false, retry: true, tip: '服务端异常，稍后重试或联系服务方' },
            ],
        }
    },
    evaluate({ config, httpStatus, headers, body }: EvaluateParams): StatusOutcome {
        const context = { body, headers, status: httpStatus }
        const appCode = config.codePath.trim().length === 0 ? undefined : blueprintTemplate.readPath({ source: context, path: config.codePath })
        const appCodeText = isNil(appCode) || typeof appCode === 'object' ? undefined : String(appCode)
        const candidates = [appCodeText, String(httpStatus)].filter((code): code is string => !isNil(code))
        const matched = candidates
            .map((code) => ({ code, rule: config.rules.find((rule) => rule.code.trim() === code) }))
            .find((candidate) => !isNil(candidate.rule))
        const message = readMessage({ config, context })
        if (!isNil(matched) && !isNil(matched.rule)) {
            return {
                success: matched.rule.success,
                retry: !matched.rule.success && matched.rule.retry,
                code: matched.code,
                message: matched.rule.success ? null : message ?? (matched.rule.tip.length > 0 ? matched.rule.tip : `HTTP ${httpStatus}`),
                tip: matched.rule.tip,
            }
        }
        const httpOk = httpStatus >= 200 && httpStatus < 400
        if (httpOk && isNil(appCodeText)) {
            return { success: true, retry: false, code: String(httpStatus), message: null, tip: '' }
        }
        const success = httpOk && config.unmatched === BlueprintStatusUnmatched.SUCCESS
        return {
            success,
            retry: false,
            code: appCodeText ?? String(httpStatus),
            message: success ? null : message ?? `HTTP ${httpStatus}`,
            tip: '',
        }
    },
}

function readMessage({ config, context }: { config: BlueprintStatusConfig, context: Record<string, unknown> }): string | null {
    if (config.messagePath.trim().length === 0) {
        return null
    }
    const value = blueprintTemplate.readPath({ source: context, path: config.messagePath })
    const text = blueprintTemplate.stringify(value)
    return text.length > 0 ? text : null
}

type EvaluateParams = {
    config: BlueprintStatusConfig
    httpStatus: number
    headers: Record<string, string>
    body: unknown
}

export type StatusOutcome = {
    success: boolean
    retry: boolean
    code: string
    message: string | null
    tip: string
}

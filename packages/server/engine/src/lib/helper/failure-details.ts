import { errorHandlingUtils } from '@fema-ipaas/shared'

export const failureDetails = {
    build,
}

function build({ errorMessage, now }: { errorMessage: string | undefined, now: Date }): FailureDetails {
    const classified = errorHandlingUtils.classifyErrorMessage({ message: errorMessage })
    const category = categoryText({ errorCode: classified.errorCode, httpStatus: classified.httpStatus })
    const readable = classified.readableMessage ?? (classified.plainMessage.length > 0 ? `${category}：${classified.plainMessage}` : category)
    return {
        errorCode: classified.externalCode ?? classified.errorCode,
        errorCategory: classified.errorCode,
        errorMessage: readable,
        rawMessage: classified.plainMessage,
        errorTime: beijingTime(now),
        errorTimeIso: now.toISOString(),
    }
}

function categoryText({ errorCode, httpStatus }: { errorCode: string, httpStatus: number | null }): string {
    const fixed = CATEGORY_TEXT[errorCode]
    if (fixed !== undefined) {
        return fixed
    }
    return httpStatus === null ? STEP_FAILED_TEXT : `目标系统返回 HTTP ${httpStatus}`
}

function beijingTime(now: Date): string {
    return new Date(now.getTime() + BEIJING_UTC_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const STEP_FAILED_TEXT = '步骤执行失败'
const CATEGORY_TEXT: Record<string, string> = {
    STEP_TIMEOUT: '步骤执行超时',
    STEP_FAILED: STEP_FAILED_TEXT,
    CONNECTION_EXPIRED: '连接已过期，请重新授权连接',
    CONNECTION_NOT_FOUND: '找不到步骤使用的连接，请重新选择连接',
    CONNECTION_LOADING_FAILED: '加载连接失败',
}

export type FailureDetails = {
    errorCode: string
    errorCategory: string
    errorMessage: string
    rawMessage: string
    errorTime: string
    errorTimeIso: string
}

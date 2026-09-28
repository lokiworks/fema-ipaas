import { isNil, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const errorHandlingUtils = {
    classifyErrorMessage,
    resolveStrategy,
    ruleMatches,
    usesBranches,
    effectiveStrategy,
    outcomeOf,
    retryPolicyOf,
    normalizeCode,
    isRetryMode,
    withRetry,
    withoutRetry,
}

function classifyErrorMessage({ message, timedOut }: ClassifyErrorMessageParams): StepErrorClassification {
    const readable = readableMessage(message)
    const connection = matchConnectionFailure(readable)
    if (!isNil(connection)) {
        return { errorCode: connection.errorCode, connectionExternalId: connection.externalId, httpStatus: null, message: readable }
    }
    const httpStatus = friendlyHttpStatus(message) ?? extractHttpStatus(readable)
    const errorCode = timedOut === true
        ? STEP_TIMEOUT_CODE
        : isNil(httpStatus) ? STEP_FAILED_CODE : `HTTP_${httpStatus}`
    return { errorCode, connectionExternalId: null, httpStatus, message: readable }
}

function resolveStrategy({ options, errorCode }: ResolveStrategyParams): ResolvedErrorStrategy | null {
    if (isNil(options) || isNil(options.strategy)) {
        return null
    }
    const matched = (options.rules ?? []).find((rule) => ruleMatches({ rule, errorCode }))
    const strategy = matched?.strategy ?? options.strategy
    return {
        mode: strategy.mode,
        outcome: outcomeOf(strategy.mode),
        retry: retryPolicyOf(strategy),
        ruleId: matched?.id ?? null,
    }
}

function ruleMatches({ rule, errorCode }: { rule: Pick<ErrorHandlingRule, 'operator' | 'codes'>, errorCode: string }): boolean {
    const codes = rule.codes.map((code) => normalizeCode(code)).filter((code) => code.length > 0)
    if (codes.length === 0) {
        return false
    }
    const actual = errorCode.trim().toUpperCase()
    switch (rule.operator) {
        case ErrorCodeOperator.EQUALS_ANY:
            return codes.some((code) => actual === code)
        case ErrorCodeOperator.NOT_EQUALS_ANY:
            return codes.every((code) => actual !== code)
        case ErrorCodeOperator.STARTS_WITH_ANY:
            return codes.some((code) => actual.startsWith(code))
        case ErrorCodeOperator.NOT_STARTS_WITH_ANY:
            return codes.every((code) => !actual.startsWith(code))
    }
}

function usesBranches(options: ErrorHandlingOptionsShape | undefined): boolean {
    if (isNil(options)) {
        return false
    }
    if (isNil(options.strategy)) {
        return options.continueOnFailure?.value ?? false
    }
    const modes = [options.strategy.mode, ...(options.rules ?? []).map((rule) => rule.strategy.mode)]
    return modes.some((mode) => outcomeOf(mode) === ErrorOutcome.BRANCH)
}

function effectiveStrategy({ options, fallback }: { options: ErrorHandlingOptionsShape | undefined, fallback: ErrorStrategy }): ErrorStrategy {
    if (!isNil(options?.strategy)) {
        return options.strategy
    }
    const continueOnFailure = options?.continueOnFailure?.value ?? false
    const retry = options?.retryOnFailure?.value ?? false
    if (!continueOnFailure && !retry) {
        return fallback
    }
    const base = continueOnFailure ? ErrorStrategyMode.BRANCH : ErrorStrategyMode.STOP
    return retry ? withRetry({ mode: base }) : { mode: base }
}

function outcomeOf(mode: ErrorStrategyMode): ErrorOutcome {
    switch (mode) {
        case ErrorStrategyMode.STOP:
        case ErrorStrategyMode.RETRY_THEN_STOP:
            return ErrorOutcome.STOP
        case ErrorStrategyMode.IGNORE:
        case ErrorStrategyMode.RETRY_THEN_IGNORE:
            return ErrorOutcome.IGNORE
        case ErrorStrategyMode.BRANCH:
        case ErrorStrategyMode.RETRY_THEN_BRANCH:
            return ErrorOutcome.BRANCH
    }
}

function isRetryMode(mode: ErrorStrategyMode): boolean {
    return mode === ErrorStrategyMode.RETRY_THEN_STOP || mode === ErrorStrategyMode.RETRY_THEN_IGNORE || mode === ErrorStrategyMode.RETRY_THEN_BRANCH
}

function retryPolicyOf(strategy: ErrorStrategy): ErrorRetryPolicy | null {
    if (!isRetryMode(strategy.mode)) {
        return null
    }
    return {
        attempts: strategy.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
        intervalSeconds: strategy.retryIntervalSeconds ?? DEFAULT_RETRY_INTERVAL_SECONDS,
    }
}

function withRetry(strategy: ErrorStrategy): ErrorStrategy {
    const mode = RETRY_MODE_OF[outcomeOf(strategy.mode)]
    return {
        mode,
        retryAttempts: strategy.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
        retryIntervalSeconds: strategy.retryIntervalSeconds ?? DEFAULT_RETRY_INTERVAL_SECONDS,
    }
}

function withoutRetry(strategy: ErrorStrategy): ErrorStrategy {
    return { mode: PLAIN_MODE_OF[outcomeOf(strategy.mode)] }
}

function normalizeCode(code: string): string {
    const trimmed = code.trim().toUpperCase()
    return /^\d+$/.test(trimmed) ? `HTTP_${trimmed}` : trimmed
}

function readableMessage(raw: string | undefined): string {
    if (isNil(raw) || raw.trim().length === 0) {
        return ''
    }
    const parsed = safeParseJson(raw)
    const withMessage = MessageShape.safeParse(parsed)
    if (withMessage.success) {
        const nested = withMessage.data.message
        return isNil(safeParseJson(nested)) ? nested : readableMessage(nested)
    }
    const httpError = HttpErrorShape.safeParse(parsed)
    if (!httpError.success) {
        return raw
    }
    const { status, body } = httpError.data.response
    const detail = bodyMessage(body)
    return isNil(detail) ? `HTTP ${status}` : `HTTP ${status}: ${detail}`
}

function bodyMessage(body: unknown): string | null {
    if (typeof body === 'string') {
        const text = body.trim()
        return text.length === 0 || text.length > MAX_BODY_MESSAGE_LENGTH ? null : text
    }
    const fields = BodyMessageShape.safeParse(body)
    if (!fields.success) {
        return null
    }
    const { message, error_description, error, msg } = fields.data
    return [message, error_description, error, msg].find((value) => !isNil(value) && value.trim().length > 0) ?? null
}

function friendlyHttpStatus(raw: string | undefined): number | null {
    const friendly = tryParseFriendlyConnectorError(raw)
    const status = friendly?.status
    if (isNil(status) || !Number.isInteger(status) || status < 400 || status > 599) {
        return null
    }
    return status
}

function matchConnectionFailure(message: string): ConnectionFailure | null {
    const expired = CONNECTION_EXPIRED_PATTERN.exec(message)
    if (!isNil(expired)) {
        return { externalId: expired[1], errorCode: 'CONNECTION_EXPIRED' }
    }
    const notFound = CONNECTION_NOT_FOUND_PATTERN.exec(message)
    if (!isNil(notFound)) {
        return { externalId: notFound[1], errorCode: 'CONNECTION_NOT_FOUND' }
    }
    const loading = CONNECTION_LOADING_PATTERN.exec(message)
    if (!isNil(loading)) {
        return { externalId: loading[1], errorCode: 'CONNECTION_LOADING_FAILED' }
    }
    return null
}

function extractHttpStatus(message: string): number | null {
    const match = HTTP_STATUS_PATTERN.exec(message)
    return isNil(match) ? null : Number(match[1])
}

function safeParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw)
    }
    catch {
        return null
    }
}

export enum ErrorStrategyMode {
    STOP = 'STOP',
    IGNORE = 'IGNORE',
    BRANCH = 'BRANCH',
    RETRY_THEN_STOP = 'RETRY_THEN_STOP',
    RETRY_THEN_IGNORE = 'RETRY_THEN_IGNORE',
    RETRY_THEN_BRANCH = 'RETRY_THEN_BRANCH',
}

export enum ErrorOutcome {
    STOP = 'STOP',
    IGNORE = 'IGNORE',
    BRANCH = 'BRANCH',
}

export enum ErrorCodeOperator {
    EQUALS_ANY = 'EQUALS_ANY',
    NOT_EQUALS_ANY = 'NOT_EQUALS_ANY',
    STARTS_WITH_ANY = 'STARTS_WITH_ANY',
    NOT_STARTS_WITH_ANY = 'NOT_STARTS_WITH_ANY',
}

export const ErrorStrategy = z.object({
    mode: z.enum(ErrorStrategyMode),
    retryAttempts: z.number().int().min(1).max(5).optional(),
    retryIntervalSeconds: z.number().int().min(1).max(60).optional(),
})
export type ErrorStrategy = z.infer<typeof ErrorStrategy>

export const ErrorHandlingRule = z.object({
    id: z.string(),
    name: z.string(),
    operator: z.enum(ErrorCodeOperator),
    codes: z.array(z.string()),
    strategy: ErrorStrategy,
})
export type ErrorHandlingRule = z.infer<typeof ErrorHandlingRule>

const STEP_TIMEOUT_CODE = 'STEP_TIMEOUT'
const STEP_FAILED_CODE = 'STEP_FAILED'
const DEFAULT_RETRY_ATTEMPTS = 3
const DEFAULT_RETRY_INTERVAL_SECONDS = 10
const CONNECTION_EXPIRED_PATTERN = /connection \(([^)]+)\) expired/
const CONNECTION_NOT_FOUND_PATTERN = /connection \(([^)]+)\) not found/
const CONNECTION_LOADING_PATTERN = /Failed to load connection \(([^)]+)\)/
const HTTP_STATUS_PATTERN = /\b([45]\d\d)\b/
const MAX_BODY_MESSAGE_LENGTH = 200
const MessageShape = z.object({ message: z.string() })
const HttpErrorShape = z.object({ response: z.object({ status: z.number(), body: z.unknown().optional() }) })
const BodyMessageShape = z.object({
    message: z.string().optional().catch(undefined),
    error_description: z.string().optional().catch(undefined),
    error: z.string().optional().catch(undefined),
    msg: z.string().optional().catch(undefined),
})
const RETRY_MODE_OF: Record<ErrorOutcome, ErrorStrategyMode> = {
    [ErrorOutcome.STOP]: ErrorStrategyMode.RETRY_THEN_STOP,
    [ErrorOutcome.IGNORE]: ErrorStrategyMode.RETRY_THEN_IGNORE,
    [ErrorOutcome.BRANCH]: ErrorStrategyMode.RETRY_THEN_BRANCH,
}
const PLAIN_MODE_OF: Record<ErrorOutcome, ErrorStrategyMode> = {
    [ErrorOutcome.STOP]: ErrorStrategyMode.STOP,
    [ErrorOutcome.IGNORE]: ErrorStrategyMode.IGNORE,
    [ErrorOutcome.BRANCH]: ErrorStrategyMode.BRANCH,
}

type ClassifyErrorMessageParams = {
    message: string | undefined
    timedOut?: boolean
}

type ConnectionFailure = {
    externalId: string
    errorCode: string
}

type ResolveStrategyParams = {
    options: ErrorHandlingOptionsShape | undefined
    errorCode: string
}

export type ErrorHandlingOptionsShape = {
    continueOnFailure?: { value?: boolean }
    retryOnFailure?: { value?: boolean }
    strategy?: ErrorStrategy
    rules?: ErrorHandlingRule[]
}

export type ErrorRetryPolicy = {
    attempts: number
    intervalSeconds: number
}

export type ResolvedErrorStrategy = {
    mode: ErrorStrategyMode
    outcome: ErrorOutcome
    retry: ErrorRetryPolicy | null
    ruleId: string | null
}

export type StepErrorClassification = {
    errorCode: string
    connectionExternalId: string | null
    httpStatus: number | null
    message: string
}

export const ERROR_STRATEGY_RETRY_ATTEMPT_OPTIONS = [1, 2, 3, 5]
export const ERROR_STRATEGY_RETRY_INTERVAL_OPTIONS = [5, 10, 30, 60]
export const ERROR_CODES = {
    STEP_TIMEOUT: STEP_TIMEOUT_CODE,
    STEP_FAILED: STEP_FAILED_CODE,
}

import { ErrorCodeOperator, ErrorOutcome, errorHandlingUtils, ErrorStrategyMode } from '../../src'

describe('errorHandlingUtils.classifyErrorMessage', () => {
    it('reads the HTTP status from a friendly connector error', () => {
        const message = JSON.stringify({ __apErrorVersion: 1, message: 'Too many requests', status: 429 })
        expect(errorHandlingUtils.classifyErrorMessage({ message }).errorCode).toBe('HTTP_429')
    })

    it('falls back to a status found in the readable message', () => {
        expect(errorHandlingUtils.classifyErrorMessage({ message: 'Request failed with status code 503' }).errorCode).toBe('HTTP_503')
    })

    it('classifies connection failures before HTTP statuses', () => {
        const result = errorHandlingUtils.classifyErrorMessage({ message: 'connection (crm-main) expired, status 401' })
        expect(result.errorCode).toBe('CONNECTION_EXPIRED')
        expect(result.connectionExternalId).toBe('crm-main')
    })

    it('uses STEP_TIMEOUT for timed out runs and STEP_FAILED otherwise', () => {
        expect(errorHandlingUtils.classifyErrorMessage({ message: 'boom', timedOut: true }).errorCode).toBe('STEP_TIMEOUT')
        expect(errorHandlingUtils.classifyErrorMessage({ message: 'boom' }).errorCode).toBe('STEP_FAILED')
    })
})

describe('errorHandlingUtils.ruleMatches', () => {
    it('treats bare numbers as HTTP codes', () => {
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.EQUALS_ANY, codes: ['429'] }, errorCode: 'HTTP_429' })).toBe(true)
    })

    it('supports every operator', () => {
        const codes = ['HTTP_4']
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.STARTS_WITH_ANY, codes }, errorCode: 'HTTP_404' })).toBe(true)
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.NOT_STARTS_WITH_ANY, codes }, errorCode: 'HTTP_500' })).toBe(true)
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.NOT_EQUALS_ANY, codes: ['HTTP_400', 'HTTP_401'] }, errorCode: 'HTTP_401' })).toBe(false)
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.EQUALS_ANY, codes: ['step_failed'] }, errorCode: 'STEP_FAILED' })).toBe(true)
    })

    it('never matches a rule without codes', () => {
        expect(errorHandlingUtils.ruleMatches({ rule: { operator: ErrorCodeOperator.NOT_EQUALS_ANY, codes: [' '] }, errorCode: 'HTTP_500' })).toBe(false)
    })
})

describe('errorHandlingUtils.resolveStrategy', () => {
    const options = {
        strategy: { mode: ErrorStrategyMode.STOP },
        rules: [
            { id: 'r1', name: 'rate limit', operator: ErrorCodeOperator.EQUALS_ANY, codes: ['429'], strategy: { mode: ErrorStrategyMode.RETRY_THEN_BRANCH, retryAttempts: 2, retryIntervalSeconds: 5 } },
            { id: 'r2', name: 'client errors', operator: ErrorCodeOperator.STARTS_WITH_ANY, codes: ['HTTP_4'], strategy: { mode: ErrorStrategyMode.IGNORE } },
        ],
    }

    it('returns null for legacy options so the engine keeps the old behaviour', () => {
        expect(errorHandlingUtils.resolveStrategy({ options: { continueOnFailure: { value: true } }, errorCode: 'HTTP_500' })).toBeNull()
    })

    it('uses the first matching rule from the top', () => {
        const resolved = errorHandlingUtils.resolveStrategy({ options, errorCode: 'HTTP_429' })
        expect(resolved).toEqual({ mode: ErrorStrategyMode.RETRY_THEN_BRANCH, outcome: ErrorOutcome.BRANCH, retry: { attempts: 2, intervalSeconds: 5 }, ruleId: 'r1' })
        expect(errorHandlingUtils.resolveStrategy({ options, errorCode: 'HTTP_404' })?.ruleId).toBe('r2')
    })

    it('falls back to the default strategy with default retry values', () => {
        expect(errorHandlingUtils.resolveStrategy({ options, errorCode: 'HTTP_500' })?.outcome).toBe(ErrorOutcome.STOP)
        const retry = errorHandlingUtils.resolveStrategy({ options: { strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP } }, errorCode: 'X' })?.retry
        expect(retry).toEqual({ attempts: 3, intervalSeconds: 10 })
    })
})

describe('errorHandlingUtils.usesBranches', () => {
    it('follows the legacy flag when no strategy is set', () => {
        expect(errorHandlingUtils.usesBranches({ continueOnFailure: { value: true } })).toBe(true)
        expect(errorHandlingUtils.usesBranches(undefined)).toBe(false)
    })

    it('is true when the default or any rule adds a branch', () => {
        expect(errorHandlingUtils.usesBranches({ continueOnFailure: { value: true }, strategy: { mode: ErrorStrategyMode.STOP } })).toBe(false)
        expect(errorHandlingUtils.usesBranches({
            strategy: { mode: ErrorStrategyMode.STOP },
            rules: [{ id: 'r', name: 'r', operator: ErrorCodeOperator.EQUALS_ANY, codes: ['500'], strategy: { mode: ErrorStrategyMode.RETRY_THEN_BRANCH } }],
        })).toBe(true)
    })

    it('maps legacy flags to an effective strategy for display', () => {
        const fallback = { mode: ErrorStrategyMode.STOP }
        expect(errorHandlingUtils.effectiveStrategy({ options: undefined, fallback })).toEqual(fallback)
        expect(errorHandlingUtils.effectiveStrategy({ options: { continueOnFailure: { value: true }, retryOnFailure: { value: true } }, fallback }).mode).toBe(ErrorStrategyMode.RETRY_THEN_BRANCH)
    })
})

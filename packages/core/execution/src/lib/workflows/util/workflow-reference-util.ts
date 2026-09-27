import { extractMustacheTokens, isNil } from '@fema-ipaas/core-utils'
import { WorkflowAction } from '../actions/action'
import { WorkflowTriggerType } from '../triggers/trigger'
import { Step, workflowStructureUtil } from './workflow-structure-util'

function parseExpression(inner: string): ParsedReference[] {
    const withoutStrings = maskStringLiterals(inner)
    const matches = [...withoutStrings.matchAll(REFERENCE_PATTERN)]
    return matches
        .filter((match) => {
            const start = match.index ?? 0
            const previous = start > 0 ? withoutStrings[start - 1] : ''
            return !IDENTIFIER_CONTINUATION.test(previous)
        })
        .map((match) => {
            const start = match.index ?? 0
            const original = inner.slice(start, start + match[0].length)
            return { root: match[1], path: parsePath(original.slice(match[1].length)) }
        })
}

function extractFromValue(value: unknown): Reference[] {
    if (typeof value === 'string') {
        return extractMustacheTokens(value).flatMap((token) =>
            parseExpression(token.inner).map((reference) => ({ ...reference, token: token.token })),
        )
    }
    if (Array.isArray(value)) {
        return value.flatMap(extractFromValue)
    }
    if (typeof value === 'object' && !isNil(value)) {
        return Object.values(value).flatMap(extractFromValue)
    }
    return []
}

function extractFromStep(step: Step): Reference[] {
    const { sampleData: _sampleData, sourceCode: _sourceCode, displayNumber: _displayNumber, customLogoUrl: _customLogoUrl, ...rest } = readSettings(step)
    return extractFromValue(rest)
}

function stepOutputPath(path: string[]): string[] {
    return path[0] === 'output' ? path.slice(1) : path
}

function connectionIdsOf(step: Step): string[] {
    const auth = readSettings(step)['input']
    if (typeof auth !== 'object' || isNil(auth) || !('auth' in auth) || typeof auth.auth !== 'string') {
        return []
    }
    return [...auth.auth.matchAll(CONNECTION_PATTERN)].map((match) => match[1])
}

function stripUnavailableConnections({ actions, isAvailable }: { actions: WorkflowAction[], isAvailable: (externalId: string) => boolean }): StripResult {
    const cleared: string[] = []
    const cleaned = actions.map((action) => workflowStructureUtil.transferStep<Step>(JSON.parse(JSON.stringify(action)), (step) => {
        const ids = connectionIdsOf(step)
        if (ids.length === 0 || ids.every(isAvailable) || !('input' in step.settings)) {
            return step
        }
        cleared.push(step.name)
        delete step.settings.input['auth']
        step.valid = false
        return step
    }))
    const actionsOnly = cleaned.flatMap((step) => (step.type === WorkflowTriggerType.EMPTY || step.type === WorkflowTriggerType.CONNECTOR ? [] : [step]))
    return { actions: actionsOnly, clearedStepNames: cleared }
}

function readSettings(step: Step): Record<string, unknown> {
    const settings: unknown = step.settings
    if (typeof settings !== 'object' || isNil(settings)) {
        return {}
    }
    return Object.fromEntries(Object.entries(settings))
}

function parsePath(rest: string): string[] {
    return [...rest.matchAll(PATH_SEGMENT_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')
}

function maskStringLiterals(expression: string): string {
    return expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (literal, offset: number) => {
        const before = expression.slice(0, offset).trimEnd()
        return before.endsWith('[') ? literal : ' '.repeat(literal.length)
    })
}

export const workflowReferenceUtil = {
    parseExpression,
    extractFromValue,
    extractFromStep,
    stepOutputPath,
    connectionIdsOf,
    stripUnavailableConnections,
}

const IDENTIFIER_CONTINUATION = /[A-Za-z0-9_$.\]'"]/
const REFERENCE_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)((?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\d+)\s*\])*)/g
const PATH_SEGMENT_PATTERN = /\.\s*([A-Za-z_$][\w$]*)|\[\s*'((?:[^'\\]|\\.)*)'\s*\]|\[\s*"((?:[^"\\]|\\.)*)"\s*\]|\[\s*(\d+)\s*\]/g
const CONNECTION_PATTERN = /connections\['([^']+)'\]/g

export type ParsedReference = {
    root: string
    path: string[]
}

export type Reference = ParsedReference & {
    token: string
}

export type StripResult = {
    actions: WorkflowAction[]
    clearedStepNames: string[]
}

import { dataMapping, isManualConnectorTrigger, isNil } from '@fema-ipaas/core-utils'
import { scheduleUtils } from './schedule-util'
import { ConnectorTriggerSettings, ScheduleOverlapPolicy } from './trigger'

export const triggerRunSettingsUtils = {
    supportsDedupe,
    supportsScheduleSettings,
    validateKeyPath,
    readKey,
    maxConcurrentRuns,
    orderKeyPathOf,
    overlapPolicyOf,
    keyCandidates,
}

function supportsDedupe({ connectorName, triggerName }: TriggerIdentity): boolean {
    if (scheduleUtils.isScheduleConnector(connectorName)) {
        return false
    }
    if (connectorName === SUBFLOWS_CONNECTOR_NAME) {
        return false
    }
    return !isManualConnectorTrigger({ connectorName, triggerName: triggerName ?? '' })
}

function supportsScheduleSettings({ connectorName }: Pick<TriggerIdentity, 'connectorName'>): boolean {
    return scheduleUtils.isScheduleConnector(connectorName)
}

function validateKeyPath(keyPath: string): KeyPathError | null {
    const trimmed = keyPath.trim()
    if (trimmed.length === 0) {
        return KeyPathError.EMPTY
    }
    if (!trimmed.includes('{{')) {
        return PLAIN_PATH_PATTERN.test(trimmed) ? null : KeyPathError.INVALID
    }
    const references = [...trimmed.matchAll(TEMPLATE_PATTERN)].map((match) => match[1].trim())
    if (references.length === 0) {
        return KeyPathError.INVALID
    }
    return references.every((reference) => TRIGGER_REFERENCE_PATTERN.test(reference)) ? null : KeyPathError.NOT_TRIGGER_OUTPUT
}

function readKey({ payload, keyPath }: { payload: unknown, keyPath: string }): string | null {
    if (!isNil(validateKeyPath(keyPath))) {
        return null
    }
    const trimmed = keyPath.trim()
    if (!trimmed.includes('{{')) {
        return stringify(dataMapping.readPath({ root: payload, path: trimmed }))
    }
    const parts = [...trimmed.matchAll(TEMPLATE_PATTERN)].map((match) => stringify(dataMapping.readPath({ root: payload, path: stripTriggerHead(match[1].trim()) })))
    if (parts.some((part) => isNil(part))) {
        return null
    }
    return trimmed.replace(TEMPLATE_PATTERN, () => parts.shift() ?? '')
}

function maxConcurrentRuns(settings: Pick<ConnectorTriggerSettings, 'concurrency' | 'scheduleOverlap' | 'connectorName'>): number {
    if (overlapPolicyOf(settings) === ScheduleOverlapPolicy.QUEUE) {
        return 1
    }
    return settings.concurrency?.maxConcurrentRuns ?? 0
}

function orderKeyPathOf(settings: Pick<ConnectorTriggerSettings, 'concurrency' | 'scheduleOverlap' | 'connectorName'>): string | null {
    if (maxConcurrentRuns(settings) === 1) {
        return null
    }
    const path = settings.concurrency?.orderKeyPath?.trim() ?? ''
    return path.length === 0 ? null : path
}

function overlapPolicyOf(settings: Pick<ConnectorTriggerSettings, 'scheduleOverlap' | 'connectorName'>): ScheduleOverlapPolicy {
    if (!scheduleUtils.isScheduleConnector(settings.connectorName)) {
        return ScheduleOverlapPolicy.PARALLEL
    }
    return settings.scheduleOverlap ?? ScheduleOverlapPolicy.PARALLEL
}

function keyCandidates(sample: unknown): KeyCandidate[] {
    return collectLeaves({ value: sample, path: '', depth: 0 })
        .filter((leaf) => KEY_NAME_PATTERN.test(leaf.path.split('.').pop() ?? ''))
        .slice(0, MAX_KEY_CANDIDATES)
}

function collectLeaves({ value, path, depth }: { value: unknown, path: string, depth: number }): KeyCandidate[] {
    if (typeof value === 'string' || typeof value === 'number') {
        return path.length === 0 ? [] : [{ path, sample: String(value) }]
    }
    if (!isPlainRecord(value) || depth >= MAX_CANDIDATE_DEPTH) {
        return []
    }
    return Object.entries(value).flatMap(([key, child]) => collectLeaves({ value: child, path: path.length === 0 ? key : `${path}.${key}`, depth: depth + 1 }))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripTriggerHead(reference: string): string {
    return reference.replace(/^trigger(\.|(?=\[))/, '')
}

function stringify(value: unknown): string | null {
    if (isNil(value) || value === '') {
        return null
    }
    if (typeof value === 'object') {
        return JSON.stringify(value)
    }
    return String(value)
}

const SUBFLOWS_CONNECTOR_NAME = '@fema-ipaas/connector-subflows'
const PLAIN_PATH_PATTERN = /^[A-Za-z0-9_$\-[\].]+$/
const TEMPLATE_PATTERN = /\{\{([^}]*)\}\}/g
const TRIGGER_REFERENCE_PATTERN = /^trigger(\.[A-Za-z0-9_$-]+|\[\d+\])+$/
const KEY_NAME_PATTERN = /(^id$|_id$|Id$|userid$|_code$|_no$|number$)/i
const MAX_KEY_CANDIDATES = 8
const MAX_CANDIDATE_DEPTH = 4

type TriggerIdentity = {
    connectorName: string
    triggerName: string | undefined
}

export enum KeyPathError {
    EMPTY = 'EMPTY',
    INVALID = 'INVALID',
    NOT_TRIGGER_OUTPUT = 'NOT_TRIGGER_OUTPUT',
}

export type KeyCandidate = {
    path: string
    sample: string
}

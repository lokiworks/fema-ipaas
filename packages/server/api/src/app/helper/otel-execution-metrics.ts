import os from 'os'
import { tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { otelQueueMetrics } from './otel-queue-metrics'
import { system } from './system/system'
import { AppSystemProp } from './system/system-props'

const DURATION_BUCKETS_MS = [100, 500, 1_000, 5_000, 15_000, 60_000, 300_000]

const counters = new Map<string, number>()
const durations = { count: 0, sumMs: 0, buckets: new Array<number>(DURATION_BUCKETS_MS.length + 1).fill(0) }
let startTimeUnixNano: string | null = null

function recordExecution({ status, durationMs }: RecordExecutionParams): void {
    increment('workflow_execution_total', { status })
    if (isFailure(status)) {
        increment('workflow_execution_failed_total', { status })
    }
    if (durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0) {
        durations.count += 1
        durations.sumMs += durationMs
        durations.buckets[bucketIndexOf(durationMs)] += 1
    }
}

function recordConnectorAction({ connectorName, failed }: RecordConnectorActionParams): void {
    increment('connector_action_total', { connector: connectorName })
    if (failed) {
        increment('connector_action_failed_total', { connector: connectorName })
    }
}

async function push(log: FastifyBaseLogger): Promise<void> {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    if (!system.getBoolean(AppSystemProp.OTEL_QUEUE_METRICS_ENABLED) || !endpoint || counters.size === 0) {
        return
    }
    const timeUnixNano = String(BigInt(Date.now()) * 1_000_000n)
    startTimeUnixNano ??= timeUnixNano
    const payload = buildPayload({ timeUnixNano, startTimeUnixNano, hostName: os.hostname() })
    const url = `${endpoint.replace(/\/$/, '')}/v1/metrics`
    const { error } = await tryCatch(() => safeHttp.axios.post(url, payload, {
        headers: otelQueueMetrics.parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
        timeout: 5000,
    }))
    if (error) {
        log.warn({ error: error.message }, '[otelExecutionMetrics#push] failed to export execution metrics')
    }
}

function buildPayload({ timeUnixNano, startTimeUnixNano, hostName }: BuildPayloadParams): OtlpMetricsPayload {
    const byName = new Map<string, OtlpNumberDataPoint[]>()
    for (const [key, value] of counters) {
        const { name, attributes } = decodeKey(key)
        const points = byName.get(name) ?? []
        points.push({ startTimeUnixNano, timeUnixNano, asInt: String(value), attributes })
        byName.set(name, points)
    }
    const sums = [...byName.entries()].map(([name, dataPoints]) => ({
        name,
        description: DESCRIPTIONS[name] ?? name,
        unit: '1',
        sum: { dataPoints, aggregationTemporality: 2, isMonotonic: true },
    }))
    return {
        resourceMetrics: [{
            resource: {
                attributes: [
                    { key: 'service.name', value: { stringValue: 'fema-api' } },
                    { key: 'host.name', value: { stringValue: hostName } },
                ],
            },
            scopeMetrics: [{
                scope: { name: 'fema.execution-metrics' },
                metrics: [...sums, buildDurationHistogram({ timeUnixNano, startTimeUnixNano })],
            }],
        }],
    }
}

function buildDurationHistogram({ timeUnixNano, startTimeUnixNano }: { timeUnixNano: string, startTimeUnixNano: string }) {
    return {
        name: 'workflow_execution_duration',
        description: 'Workflow execution wall-clock duration',
        unit: 'ms',
        histogram: {
            aggregationTemporality: 2,
            dataPoints: [{
                startTimeUnixNano,
                timeUnixNano,
                count: String(durations.count),
                sum: durations.sumMs,
                bucketCounts: durations.buckets.map(String),
                explicitBounds: DURATION_BUCKETS_MS,
                attributes: [],
            }],
        },
    }
}

function increment(name: string, attributes: Record<string, string>): void {
    const key = encodeKey(name, attributes)
    counters.set(key, (counters.get(key) ?? 0) + 1)
}

function encodeKey(name: string, attributes: Record<string, string>): string {
    return JSON.stringify([name, Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))])
}

function decodeKey(key: string): { name: string, attributes: OtlpAttribute[] } {
    const [name, entries]: [string, [string, string][]] = JSON.parse(key)
    return {
        name,
        attributes: entries.map(([attributeKey, value]) => ({ key: attributeKey, value: { stringValue: value } })),
    }
}

function bucketIndexOf(durationMs: number): number {
    const index = DURATION_BUCKETS_MS.findIndex((bound) => durationMs <= bound)
    return index === -1 ? DURATION_BUCKETS_MS.length : index
}

function isFailure(status: string): boolean {
    return status !== 'SUCCEEDED' && status !== 'RUNNING' && status !== 'PAUSED'
}

function reset(): void {
    counters.clear()
    durations.count = 0
    durations.sumMs = 0
    durations.buckets.fill(0)
    startTimeUnixNano = null
}

const DESCRIPTIONS: Record<string, string> = {
    workflow_execution_total: 'Workflow executions by terminal status',
    workflow_execution_failed_total: 'Workflow executions that did not succeed',
    connector_action_total: 'Connector actions executed',
    connector_action_failed_total: 'Connector actions that failed',
}

export const otelExecutionMetrics = {
    recordExecution,
    recordConnectorAction,
    push,
    buildPayload,
    reset,
}

type RecordExecutionParams = {
    status: string
    durationMs?: number
}

type RecordConnectorActionParams = {
    connectorName: string
    failed: boolean
}

type BuildPayloadParams = {
    timeUnixNano: string
    startTimeUnixNano: string
    hostName: string
}

type OtlpAttribute = {
    key: string
    value: { stringValue: string }
}

type OtlpNumberDataPoint = {
    startTimeUnixNano: string
    timeUnixNano: string
    asInt: string
    attributes: OtlpAttribute[]
}

type OtlpMetricsPayload = {
    resourceMetrics: Array<{
        resource: { attributes: OtlpAttribute[] }
        scopeMetrics: Array<{ scope: { name: string }, metrics: unknown[] }>
    }>
}

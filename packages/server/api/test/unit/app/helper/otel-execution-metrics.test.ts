import { otelExecutionMetrics } from '../../../../src/app/helper/otel-execution-metrics'

function metricsOf(payload: ReturnType<typeof otelExecutionMetrics.buildPayload>) {
    return payload.resourceMetrics[0].scopeMetrics[0].metrics
}

function sumFor(payload: ReturnType<typeof otelExecutionMetrics.buildPayload>, name: string) {
    const metric = metricsOf(payload).find((entry) => Reflect.get(entry as object, 'name') === name)
    return metric === undefined ? undefined : Reflect.get(metric as object, 'sum')
}

function histogramPoint(payload: ReturnType<typeof otelExecutionMetrics.buildPayload>) {
    const metric = metricsOf(payload).find((entry) => Reflect.get(entry as object, 'name') === 'workflow_execution_duration')
    return Reflect.get(Reflect.get(metric as object, 'histogram') as object, 'dataPoints')[0]
}

const BUILD_ARGS = { timeUnixNano: '2000', startTimeUnixNano: '1000', hostName: 'test-host' }

describe('otelExecutionMetrics', () => {
    beforeEach(() => {
        otelExecutionMetrics.reset()
    })

    it('counts every execution and only failures as failed', () => {
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED' })
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED' })
        otelExecutionMetrics.recordExecution({ status: 'FAILED' })
        otelExecutionMetrics.recordExecution({ status: 'TIMEOUT' })

        const payload = otelExecutionMetrics.buildPayload(BUILD_ARGS)
        const total = sumFor(payload, 'workflow_execution_total')
        const failed = sumFor(payload, 'workflow_execution_failed_total')

        expect(total.dataPoints).toHaveLength(3)
        expect(failed.dataPoints.map((point: { asInt: string }) => point.asInt).sort()).toEqual(['1', '1'])
    })

    it('does not count a paused or running execution as failed', () => {
        otelExecutionMetrics.recordExecution({ status: 'PAUSED' })
        otelExecutionMetrics.recordExecution({ status: 'RUNNING' })

        expect(sumFor(otelExecutionMetrics.buildPayload(BUILD_ARGS), 'workflow_execution_failed_total')).toBeUndefined()
    })

    it('emits cumulative monotonic sums', () => {
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED' })
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED' })

        const sum = sumFor(otelExecutionMetrics.buildPayload(BUILD_ARGS), 'workflow_execution_total')
        expect(sum.isMonotonic).toBe(true)
        expect(sum.aggregationTemporality).toBe(2)
        expect(sum.dataPoints[0].asInt).toBe('2')
    })

    it('buckets durations and keeps count and sum consistent', () => {
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED', durationMs: 50 })
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED', durationMs: 2_000 })
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED', durationMs: 10_000_000 })

        const point = histogramPoint(otelExecutionMetrics.buildPayload(BUILD_ARGS))
        expect(point.count).toBe('3')
        expect(point.sum).toBe(50 + 2_000 + 10_000_000)
        expect(point.bucketCounts).toHaveLength(point.explicitBounds.length + 1)
        expect(point.bucketCounts.reduce((total: number, value: string) => total + Number(value), 0)).toBe(3)
        expect(point.bucketCounts[point.bucketCounts.length - 1]).toBe('1')
    })

    it('ignores a negative or non-finite duration instead of corrupting the histogram', () => {
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED', durationMs: -5 })
        otelExecutionMetrics.recordExecution({ status: 'SUCCEEDED', durationMs: Number.NaN })

        const point = histogramPoint(otelExecutionMetrics.buildPayload(BUILD_ARGS))
        expect(point.count).toBe('0')
        expect(point.sum).toBe(0)
    })

    it('tracks connector actions separately per connector', () => {
        otelExecutionMetrics.recordConnectorAction({ connectorName: 'slack', failed: false })
        otelExecutionMetrics.recordConnectorAction({ connectorName: 'slack', failed: true })
        otelExecutionMetrics.recordConnectorAction({ connectorName: 'gmail', failed: false })

        const payload = otelExecutionMetrics.buildPayload(BUILD_ARGS)
        expect(sumFor(payload, 'connector_action_total').dataPoints).toHaveLength(2)
        const failed = sumFor(payload, 'connector_action_failed_total')
        expect(failed.dataPoints).toHaveLength(1)
        expect(failed.dataPoints[0].attributes[0].value.stringValue).toBe('slack')
    })
})

import { KeyPathError, ScheduleOverlapPolicy, scheduleUtils, triggerRunSettingsUtils } from '../../src'

describe('scheduleUtils.validateCron', () => {
    it('accepts five-field expressions', () => {
        expect(scheduleUtils.validateCron('0 9 * * 1-5')).toBe(true)
        expect(scheduleUtils.validateCron('0/5 * * * *')).toBe(true)
        expect(scheduleUtils.validateCron('*/15 8-18 1,15 JAN-JUN MON')).toBe(true)
    })

    it('rejects malformed expressions', () => {
        expect(scheduleUtils.validateCron('0 9 * *')).toBe(false)
        expect(scheduleUtils.validateCron('0 0 9 * * *')).toBe(false)
        expect(scheduleUtils.validateCron('61 * * * *')).toBe(false)
        expect(scheduleUtils.validateCron('0 9 * * L')).toBe(false)
        expect(scheduleUtils.validateCron('')).toBe(false)
    })
})

describe('scheduleUtils.nextFireTimes', () => {
    const from = new Date('2026-09-25T00:30:00Z')

    it('lists the next weekday runs in the schedule timezone', () => {
        const times = scheduleUtils.nextFireTimes({ schedule: { kind: 'cron', cron: '0 9 * * 1-5', timezone: 'Asia/Shanghai' }, from, count: 3 })
        expect(times.map((time) => time.toISOString())).toEqual([
            '2026-09-25T01:00:00.000Z',
            '2026-09-28T01:00:00.000Z',
            '2026-09-29T01:00:00.000Z',
        ])
    })

    it('skips excluded holiday dates', () => {
        const times = scheduleUtils.nextFireTimes({ schedule: { kind: 'cron', cron: '0 9 * * *', timezone: 'Asia/Shanghai' }, from, count: 2, excludeDates: ['2026-09-25', '2026-09-26'] })
        expect(times.map((time) => scheduleUtils.localDateOf({ instant: time, timezone: 'Asia/Shanghai' }))).toEqual(['2026-09-27', '2026-09-28'])
    })

    it('matches either day-of-month or day-of-week when both are set', () => {
        const times = scheduleUtils.nextFireTimes({ schedule: { kind: 'cron', cron: '0 0 1 * 0', timezone: 'UTC' }, from, count: 2 })
        expect(times.map((time) => time.toISOString())).toEqual(['2026-09-27T00:00:00.000Z', '2026-10-01T00:00:00.000Z'])
    })

    it('derives the schedule of the built-in schedule triggers', () => {
        expect(scheduleUtils.scheduleOf({ triggerName: 'every_day', input: { hour_of_the_day: 8, timezone: 'Asia/Shanghai', run_on_weekends: false } })).toEqual({ kind: 'cron', cron: '0 8 * * 1-5', timezone: 'Asia/Shanghai' })
        expect(scheduleUtils.scheduleOf({ triggerName: 'every_x_minutes', input: { minutes: 15 } })).toEqual({ kind: 'interval', intervalMinutes: 15, timezone: 'UTC' })
    })

    it('validates calendar dates', () => {
        expect(scheduleUtils.isValidDate('2026-10-01')).toBe(true)
        expect(scheduleUtils.isValidDate('2026-02-30')).toBe(false)
        expect(scheduleUtils.isValidDate('2026/10/01')).toBe(false)
    })
})

describe('triggerRunSettingsUtils', () => {
    it('only allows dedupe on event triggers', () => {
        expect(triggerRunSettingsUtils.supportsDedupe({ connectorName: '@fema-ipaas/connector-schedule', triggerName: 'every_day' })).toBe(false)
        expect(triggerRunSettingsUtils.supportsDedupe({ connectorName: '@fema-ipaas/connector-subflows', triggerName: 'callableWorkflow' })).toBe(false)
        expect(triggerRunSettingsUtils.supportsDedupe({ connectorName: '@fema-ipaas/connector-manual-trigger', triggerName: 'manual_trigger' })).toBe(false)
        expect(triggerRunSettingsUtils.supportsDedupe({ connectorName: '@fema-ipaas/connector-webhook', triggerName: 'catch_webhook' })).toBe(true)
    })

    it('validates that keys only reference the trigger output', () => {
        expect(triggerRunSettingsUtils.validateKeyPath('')).toBe(KeyPathError.EMPTY)
        expect(triggerRunSettingsUtils.validateKeyPath('body.order_no')).toBeNull()
        expect(triggerRunSettingsUtils.validateKeyPath('{{trigger.body.order_no}}')).toBeNull()
        expect(triggerRunSettingsUtils.validateKeyPath('{{step_1.id}}')).toBe(KeyPathError.NOT_TRIGGER_OUTPUT)
        expect(triggerRunSettingsUtils.validateKeyPath('body id')).toBe(KeyPathError.INVALID)
    })

    it('reads plain and templated keys from the payload', () => {
        const payload = { body: { order_no: 'A-1', tenant: 't1', items: [{ id: 7 }] } }
        expect(triggerRunSettingsUtils.readKey({ payload, keyPath: 'body.order_no' })).toBe('A-1')
        expect(triggerRunSettingsUtils.readKey({ payload, keyPath: '{{trigger.body.tenant}}:{{trigger.body.order_no}}' })).toBe('t1:A-1')
        expect(triggerRunSettingsUtils.readKey({ payload, keyPath: 'body.items[0].id' })).toBe('7')
        expect(triggerRunSettingsUtils.readKey({ payload, keyPath: 'body.missing' })).toBeNull()
    })

    it('forces one run at a time when a schedule queues overlapping runs', () => {
        const schedule = { connectorName: '@fema-ipaas/connector-schedule', scheduleOverlap: ScheduleOverlapPolicy.QUEUE, concurrency: { maxConcurrentRuns: 5, orderKeyPath: 'id' } }
        expect(triggerRunSettingsUtils.maxConcurrentRuns(schedule)).toBe(1)
        expect(triggerRunSettingsUtils.orderKeyPathOf(schedule)).toBeNull()
        expect(triggerRunSettingsUtils.overlapPolicyOf({ connectorName: '@fema-ipaas/connector-schedule' })).toBe(ScheduleOverlapPolicy.PARALLEL)
        expect(triggerRunSettingsUtils.orderKeyPathOf({ connectorName: 'x', concurrency: { maxConcurrentRuns: 3, orderKeyPath: ' body.user ' } })).toBe('body.user')
    })

    it('suggests id-like fields as dedupe keys', () => {
        expect(triggerRunSettingsUtils.keyCandidates({ body: { order_no: 'A-1', name: 'x', event_id: 3 } }).map((candidate) => candidate.path)).toEqual(['body.order_no', 'body.event_id'])
    })
})

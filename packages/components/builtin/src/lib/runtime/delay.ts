import { createComponent, ExecutionType, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

const MILLISECONDS: Record<TimeUnit, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
}

const INLINE_SLEEP_CEILING_MS = 10_000

export const delayComponent = createComponent({
    type: 'runtime/delay',
    displayName: 'Delay',
    description: 'Hold the workflow for a fixed duration before the next step runs',
    category: FlowComponentCategory.RUNTIME,
    icon: 'clock',
    props: {
        unit: Property.StaticDropdown({
            displayName: 'Unit',
            description: 'The unit of time to wait',
            required: true,
            defaultValue: 'seconds',
            options: {
                options: [
                    { value: 'seconds', label: 'Seconds' },
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                ],
            },
        }),
        amount: Property.Number({
            displayName: 'Amount',
            description: 'How many units to wait',
            required: true,
        }),
    },
    async run(context) {
        const unit = (context.input.unit ?? 'seconds') as TimeUnit
        const amount = Number(context.input.amount)
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error('Delay amount must be a non-negative number')
        }
        const delayMs = amount * MILLISECONDS[unit]

        if (context.executionType === ExecutionType.RESUME) {
            return { delayMs, resumed: true }
        }
        if (delayMs > INLINE_SLEEP_CEILING_MS) {
            const waitpoint = await context.run.createWaitpoint({
                type: 'DELAY',
                resumeDateTime: new Date(Date.now() + delayMs).toUTCString(),
            })
            context.run.waitForWaitpoint(waitpoint.id)
            return {}
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return { delayMs, resumed: false }
    },
})

type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days'

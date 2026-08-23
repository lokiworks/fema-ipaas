import { createComponent, ExecutionType, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

const INLINE_SLEEP_CEILING_MS = 60_000

export const delayUntilComponent = createComponent({
    type: 'runtime/delay-until',
    displayName: 'Delay Until',
    description: 'Hold the workflow until a given date and time before the next step runs',
    category: FlowComponentCategory.RUNTIME,
    icon: 'calendar-clock',
    props: {
        timestamp: Property.DateTime({
            displayName: 'Date and Time',
            description: 'The instant to resume at. Supports ISO 8601 and other parseable formats.',
            required: true,
        }),
    },
    async run(context) {
        const resumeAt = parseTimestampOrThrow(context.input.timestamp)
        if (context.executionType === ExecutionType.RESUME) {
            return { resumeAt: resumeAt.toISOString(), resumed: true }
        }
        const delayMs = resumeAt.getTime() - Date.now()
        if (delayMs <= 0) {
            return { resumeAt: resumeAt.toISOString(), resumed: false }
        }
        if (delayMs > INLINE_SLEEP_CEILING_MS) {
            const waitpoint = await context.run.createWaitpoint({
                type: 'DELAY',
                resumeDateTime: resumeAt.toISOString(),
            })
            context.run.waitForWaitpoint(waitpoint.id)
            return {}
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return { resumeAt: resumeAt.toISOString(), resumed: false }
    },
})

function parseTimestampOrThrow(timestamp: unknown): Date {
    const parsed = new Date(String(timestamp))
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid Date and Time: "${String(timestamp)}" could not be parsed. Use ISO format, e.g. 2026-08-05T14:30:00Z.`)
    }
    return parsed
}

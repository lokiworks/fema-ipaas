import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { dedupedEventController } from './deduped-event/deduped-event.controller'
import { holidayCalendarController } from './holiday-calendar/holiday-calendar.controller'
import { testTriggerController } from './test-trigger/test-trigger-controller'
import { triggerEventController } from './trigger-events/trigger-event-controller'
import { triggerRunController } from './trigger-run/trigger-run.controller'

export const triggerModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(testTriggerController, { prefix: '/v1/test-trigger' })
    await app.register(triggerEventController, { prefix: '/v1/trigger-events' })
    await app.register(triggerRunController, { prefix: '/v1/trigger-runs' })
    await app.register(dedupedEventController, { prefix: '/v1/deduped-events' })
    await app.register(holidayCalendarController, { prefix: '/v1/holiday-calendar' })
}

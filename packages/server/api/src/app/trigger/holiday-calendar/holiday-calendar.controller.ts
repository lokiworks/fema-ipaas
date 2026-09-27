import { HolidayCalendar, PrincipalType, UpdateHolidayCalendarRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { holidayCalendarService } from './holiday-calendar.service'

export const holidayCalendarController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', GetRequest, async (request): Promise<HolidayCalendar> => {
        return holidayCalendarService(request.log).get({ tenantId: request.principal.tenant.id })
    })

    app.post('/', UpdateRequest, async (request): Promise<HolidayCalendar> => {
        return holidayCalendarService(request.log).update({ tenantId: request.principal.tenant.id, request: request.body })
    })
}

const GetRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['holiday-calendar'], response: { 200: HolidayCalendar } },
}

const UpdateRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['holiday-calendar'], body: UpdateHolidayCalendarRequestBody, response: { 200: HolidayCalendar } },
}

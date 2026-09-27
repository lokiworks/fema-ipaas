import { ApplicationError, ErrorCode, generateId, isNil, TenantId } from '@fema-ipaas/core-utils'
import { HolidayCalendar, scheduleUtils, UpdateHolidayCalendarRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { HolidayCalendarEntity } from './holiday-calendar.entity'

const holidayCalendarRepo = repoFactory(HolidayCalendarEntity)

export const holidayCalendarService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: { tenantId: TenantId }): Promise<HolidayCalendar> {
        const existing = await holidayCalendarRepo().findOneBy({ tenantId })
        if (isNil(existing)) {
            return { dates: [], updated: null }
        }
        return { dates: existing.dates, updated: existing.updated }
    },

    async update({ tenantId, request }: { tenantId: TenantId, request: UpdateHolidayCalendarRequestBody }): Promise<HolidayCalendar> {
        const invalid = request.dates.find((date) => !scheduleUtils.isValidDate(date))
        if (!isNil(invalid)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Invalid holiday date: ${invalid}` },
            })
        }
        const dates = [...new Set(request.dates)].sort()
        const existing = await holidayCalendarRepo().findOneBy({ tenantId })
        if (isNil(existing)) {
            await holidayCalendarRepo().insert({ id: generateId(), tenantId, dates })
        }
        else {
            await holidayCalendarRepo().update({ id: existing.id, tenantId }, { dates })
        }
        log.info({ tenant: { id: tenantId }, count: dates.length }, '[holidayCalendarService#update] Holiday calendar updated')
        return this.get({ tenantId })
    },

    async isHoliday({ tenantId, date }: { tenantId: TenantId, date: string }): Promise<boolean> {
        const calendar = await this.get({ tenantId })
        return calendar.dates.includes(date)
    },
})

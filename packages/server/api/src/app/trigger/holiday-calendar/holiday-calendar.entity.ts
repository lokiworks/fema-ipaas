import { Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export type HolidayCalendarSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    dates: string[]
    tenant?: Tenant
}

export const HolidayCalendarEntity = new EntitySchema<HolidayCalendarSchema>({
    name: 'holiday_calendar',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        dates: {
            type: 'jsonb',
        },
    },
    indices: [
        {
            name: 'idx_holiday_calendar_tenant_id',
            columns: ['tenantId'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_holiday_calendar_tenant_id',
            },
        },
    },
})

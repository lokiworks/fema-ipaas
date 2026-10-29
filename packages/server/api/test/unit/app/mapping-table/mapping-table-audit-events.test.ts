import { ApplicationEvent, ApplicationEventName, summarizeApplicationEvent } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { mappingTableAuditEvents } from '../../../../src/app/mapping-table/mapping-table-audit-events'
import { projectAuditEvents } from '../../../../src/app/project/project-audit-events'

function asStoredEvent(event: object): unknown {
    return {
        id: 'e1',
        tenantId: 't1',
        projectId: 'p1',
        userId: 'u1',
        userEmail: 'a@corp.test',
        created: '2026-10-28T08:00:00Z',
        updated: '2026-10-28T08:00:00Z',
        ...event,
    }
}

describe('mappingTableAuditEvents', () => {
    const table = { id: 'm1', name: '部门映射' }

    it('records creation, update and deletion with the table name', () => {
        expect(mappingTableAuditEvents.created(table)).toEqual({ action: ApplicationEventName.MAPPING_TABLE_CREATED, data: { mappingTable: table } })
        expect(mappingTableAuditEvents.updated(table)).toEqual({ action: ApplicationEventName.MAPPING_TABLE_UPDATED, data: { mappingTable: table } })
        expect(mappingTableAuditEvents.deleted(table)).toEqual({ action: ApplicationEventName.MAPPING_TABLE_DELETED, data: { mappingTable: table } })
    })

    it('records rows added from coverage as an update that carries the row count', () => {
        const event = mappingTableAuditEvents.rowsAdded({ ...table, count: 3 })
        expect(event.action).toBe(ApplicationEventName.MAPPING_TABLE_UPDATED)
        expect(event.data.addedRows).toBe(3)
    })

    it('keeps only the id and name, never the rows', () => {
        const fullTable = { ...table, rows: [{ k: 'a', v: 'b' }], description: '' }
        const event = mappingTableAuditEvents.created(fullTable)
        expect(event.data.mappingTable).toEqual(table)
    })

    it('produces payloads the shared audit event schema accepts and summarizes', () => {
        const events = [
            mappingTableAuditEvents.created(table),
            mappingTableAuditEvents.updated(table),
            mappingTableAuditEvents.rowsAdded({ ...table, count: 2 }),
            mappingTableAuditEvents.deleted(table),
        ]
        for (const event of events) {
            const parsed = ApplicationEvent.safeParse(asStoredEvent(event))
            expect(parsed.success).toBe(true)
            if (parsed.success) {
                expect(summarizeApplicationEvent(parsed.data)).toContain('部门映射')
            }
        }
    })
})

describe('projectAuditEvents', () => {
    it('records the created project under its own key so the enriched project field cannot overwrite it', () => {
        const event = projectAuditEvents.created({ id: 'p9', displayName: '新项目' })
        expect(event).toEqual({ action: ApplicationEventName.PROJECT_CREATED, data: { createdProject: { id: 'p9', displayName: '新项目' } } })
        const stored = asStoredEvent({ ...event, data: { ...event.data, project: { displayName: '新项目' } } })
        const parsed = ApplicationEvent.safeParse(stored)
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(summarizeApplicationEvent(parsed.data)).toBe('Project "新项目" was created')
        }
    })
})

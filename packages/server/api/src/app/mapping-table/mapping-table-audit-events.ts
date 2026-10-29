import { ApplicationEventName, MappingTableEvent } from '@fema-ipaas/shared'

function created({ id, name }: TableRef): MappingTableAuditEvent {
    return { action: ApplicationEventName.MAPPING_TABLE_CREATED, data: { mappingTable: { id, name } } }
}

function updated({ id, name }: TableRef): MappingTableAuditEvent {
    return { action: ApplicationEventName.MAPPING_TABLE_UPDATED, data: { mappingTable: { id, name } } }
}

function rowsAdded({ id, name, count }: TableRef & { count: number }): MappingTableAuditEvent {
    return { action: ApplicationEventName.MAPPING_TABLE_UPDATED, data: { mappingTable: { id, name }, addedRows: count } }
}

function deleted({ id, name }: TableRef): MappingTableAuditEvent {
    return { action: ApplicationEventName.MAPPING_TABLE_DELETED, data: { mappingTable: { id, name } } }
}

export const mappingTableAuditEvents = { created, updated, rowsAdded, deleted }

type TableRef = {
    id: string
    name: string
}

type MappingTableAuditEvent = Pick<MappingTableEvent, 'action' | 'data'>

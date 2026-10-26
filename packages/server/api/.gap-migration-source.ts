import { DataSource, EntitySchema } from 'typeorm'
import { AuditEventEntity } from './src/app/audit/audit-event.entity'
import { readFileSync } from 'node:fs'
async function prepare() {
    const options = AuditEventEntity.options
    const { eventKey, ...columns } = options.columns
    const connection = { type: 'postgres' as const, host: '127.0.0.1', port: Number(readFileSync('/tmp/ipaas-gap-pg-port', 'utf8')), username: process.env.USER, database: 'postgres' }
    const old = new DataSource({ ...connection, entities: [new EntitySchema({ ...options, columns, indices: options.indices?.filter((index) => index.name !== 'idx_audit_event_event_key') })] })
    await old.initialize()
    await old.synchronize()
    await old.destroy()
    return new DataSource({ ...connection, entities: [AuditEventEntity] })
}
export default prepare()

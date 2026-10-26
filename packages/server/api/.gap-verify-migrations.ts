import { DedupeExecutionFinishedAudit1793034284291 } from './src/app/database/migration/postgres/1793034284291-DedupeExecutionFinishedAudit'
import { readFileSync } from 'node:fs'
import { DataSource } from 'typeorm'
import { AddReliabilityRetryReason1793031942377 } from './src/app/database/migration/postgres/1793031942377-AddReliabilityRetryReason'
import { AddReconciliation1793033278791 } from './src/app/database/migration/postgres/1793033278791-AddReconciliation'

async function verify() {
    const ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port: Number(readFileSync('/tmp/ipaas-gap-pg-port', 'utf8')), username: process.env.USER, database: 'postgres' })
    await ds.initialize()
    const runner = ds.createQueryRunner()
    const audit = new DedupeExecutionFinishedAudit1793034284291()
    await runner.query('DROP INDEX IF EXISTS idx_audit_event_event_key')
    await runner.query('ALTER TABLE audit_event DROP COLUMN IF EXISTS "eventKey"')
    await audit.up(runner)
    await audit.down(runner)
    await audit.up(runner)
    if (!await runner.hasColumn('audit_event', 'eventKey')) throw new Error('Audit key column missing')
    console.log('Audit migration passed up/down/up')
    await runner.release()
    await ds.destroy()
    return
    await runner.query('ALTER TABLE run_reliability_event DROP COLUMN IF EXISTS reason')
    const reason = new AddReliabilityRetryReason1793031942377()
    await reason.up(runner)
    if (!await runner.hasColumn('run_reliability_event', 'reason')) throw new Error('Reason column missing after up')
    await reason.down(runner)
    if (await runner.hasColumn('run_reliability_event', 'reason')) throw new Error('Reason column present after down')
    await reason.up(runner)
    const recon = new AddReconciliation1793033278791()
    await recon.up(runner)
    if (!await runner.hasTable('reconciliation_rule')) throw new Error('Rule table missing after up')
    await recon.down(runner)
    if (await runner.hasTable('reconciliation_rule')) throw new Error('Rule table present after down')
    await recon.up(runner)
    console.log('Both new migrations passed up/down/up on temporary PostgreSQL')
    await runner.release()
    await ds.destroy()
}

void verify()

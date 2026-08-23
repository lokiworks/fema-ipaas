import { isNil } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { variableRepo } from '../variable/variable.service'
import { EncryptedObject, encryptUtils } from './encryption'

const BATCH_SIZE = 200

export const encryptionRotationService = (log: FastifyBaseLogger) => ({
    async rotate(): Promise<RotationReport> {
        const connections = await rotateTable({
            log,
            table: 'connection',
            load: (skip) => connectionsRepo().find({ skip, take: BATCH_SIZE, order: { created: 'ASC' } }),
            save: async (row) => {
                await connectionsRepo().update(row.id, { value: row.value })
            },
        })
        const variables = await rotateTable({
            log,
            table: 'variable',
            load: (skip) => variableRepo().find({ skip, take: BATCH_SIZE, order: { created: 'ASC' } }),
            save: async (row) => {
                await variableRepo().update(row.id, { value: row.value })
            },
        })
        return { connections, variables }
    },
})

async function rotateTable<T extends { id: string, value: EncryptedObject }>({ log, table, load, save }: RotateTableParams<T>): Promise<TableRotationReport> {
    const report: TableRotationReport = { scanned: 0, rotated: 0, failed: 0 }
    let skip = 0
    for (;;) {
        const rows = await load(skip)
        if (rows.length === 0) {
            return report
        }
        for (const row of rows) {
            report.scanned += 1
            if (isNil(row.value) || await encryptUtils.isEncryptedWithCurrentKey(row.value)) {
                continue
            }
            try {
                const plaintext = await encryptUtils.decryptObject<unknown>(row.value)
                await save({ ...row, value: await encryptUtils.encryptObject(plaintext) })
                report.rotated += 1
            }
            catch (error) {
                report.failed += 1
                log.error({ error, table, id: row.id }, 'failed to rotate encryption key for row')
            }
        }
        skip += rows.length
    }
}

type RotateTableParams<T> = {
    log: FastifyBaseLogger
    table: string
    load: (skip: number) => Promise<T[]>
    save: (row: T) => Promise<void>
}

export type TableRotationReport = {
    scanned: number
    rotated: number
    failed: number
}

export type RotationReport = {
    connections: TableRotationReport
    variables: TableRotationReport
}

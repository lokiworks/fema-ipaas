import { TlsOptions } from 'node:tls'
import { isNil, spreadIfDefined } from '@fema-ipaas/core-utils'
import 'pg'
import { DataSource } from 'typeorm'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { commonProperties } from './database-connection'
import { Migration } from './migration'
import { InitialSchema1787473797710 } from './migration/postgres/1787473797710-InitialSchema'
import { CreateWorkspaceMember1787900000000 } from './migration/postgres/1787900000000-CreateWorkspaceMember'
import { CreateAuditEvent1787900000001 } from './migration/postgres/1787900000001-CreateAuditEvent'
import { AddConnectorRegistryTrust1787900000003 } from './migration/postgres/1787900000003-AddConnectorRegistryTrust'
import { CreateConnectorBlueprint1787900000004 } from './migration/postgres/1787900000004-CreateConnectorBlueprint'
import { AddWorkflowGraph1787900000005 } from './migration/postgres/1787900000005-AddWorkflowGraph'
import { RenameWorkspaceToProject1787900000006 } from './migration/postgres/1787900000006-RenameWorkspaceToProject'

const getSslConfig = (): boolean | TlsOptions => {
    const useSsl = system.get(AppSystemProp.POSTGRES_USE_SSL)
    if (useSsl === 'true') {
        return {
            ca: system.get(AppSystemProp.POSTGRES_SSL_CA)?.replace(/\\n/g, '\n'),
        }
    }
    return false
}

export const getMigrations = (): (new () => Migration)[] => {
    return [
        InitialSchema1787473797710,
        CreateWorkspaceMember1787900000000,
        CreateAuditEvent1787900000001,
        AddConnectorRegistryTrust1787900000003,
        CreateConnectorBlueprint1787900000004,
        AddWorkflowGraph1787900000005,
        RenameWorkspaceToProject1787900000006,
    ]
}


export const createPostgresDataSource = (): DataSource => {
    const migrationConfig: MigrationConfig = {
        migrationsRun: true,
        migrationsTransactionMode: 'each',
        migrations: getMigrations(),
        synchronize: false,
    }

    const url = system.get(AppSystemProp.POSTGRES_URL)

    if (!isNil(url)) {
        return new DataSource({
            type: 'postgres',
            url,
            ssl: getSslConfig(),
            ...spreadIfDefined('poolSize', system.get(AppSystemProp.POSTGRES_POOL_SIZE)),
            ...migrationConfig,
            ...commonProperties,
        })
    }

    const database = system.getOrThrow(AppSystemProp.POSTGRES_DATABASE)
    const host = system.getOrThrow(AppSystemProp.POSTGRES_HOST)
    const password = system.getOrThrow(AppSystemProp.POSTGRES_PASSWORD)
    const serializedPort = system.getOrThrow(AppSystemProp.POSTGRES_PORT)
    const port = Number.parseInt(serializedPort, 10)
    const idleTimeoutMillis = system.getNumberOrThrow(AppSystemProp.POSTGRES_IDLE_TIMEOUT_MS)
    const username = system.getOrThrow(AppSystemProp.POSTGRES_USERNAME)

    return new DataSource({
        type: 'postgres',
        host,
        port,
        username,
        password,
        database,
        ssl: getSslConfig(),
        ...spreadIfDefined('poolSize', system.get(AppSystemProp.POSTGRES_POOL_SIZE)),
        ...commonProperties,
        ...migrationConfig,
        extra: {
            idleTimeoutMillis,
        },
    })
}

type MigrationConfig = {
    migrationsRun?: boolean
    migrationsTransactionMode?: 'all' | 'none' | 'each'
    migrations?: (new () => Migration)[]
    synchronize: false
}

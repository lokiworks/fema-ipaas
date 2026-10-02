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
import { AddIssuesAlertsAndPrivacy1790465349745 } from './migration/postgres/1790465349745-AddIssuesAlertsAndPrivacy'
import { AddReleasesAndEnvironments1790467622232 } from './migration/postgres/1790467622232-AddReleasesAndEnvironments'
import { AddMappingTables1790468776314 } from './migration/postgres/1790468776314-AddMappingTables'
import { AddAiUsageAndMcpServices1790471332672 } from './migration/postgres/1790471332672-AddAiUsageAndMcpServices'
import { MaskLogsBeforeWrite1790473281926 } from './migration/postgres/1790473281926-MaskLogsBeforeWrite'
import { AddTestDeployments1790473753032 } from './migration/postgres/1790473753032-AddTestDeployments'
import { AddDataErasureRequests1790474079361 } from './migration/postgres/1790474079361-AddDataErasureRequests'
import { AddAgentApprovals1790475172395 } from './migration/postgres/1790475172395-AddAgentApprovals'
import { DesignDocRolloutSchema1790501279466 } from './migration/postgres/1790501279466-DesignDocRolloutSchema'
import { AddExecutionBusinessKey1790851200000 } from './migration/postgres/1790851200000-AddExecutionBusinessKey'
import { AddSolutions1790921911539 } from './migration/postgres/1790921911539-AddSolutions'
import { AddSolutionInstallWorkflowKeys1790930000000 } from './migration/postgres/1790930000000-AddSolutionInstallWorkflowKeys'
import { KeepAlertRecordsAfterPolicyDeletion1790940000000 } from './migration/postgres/1790940000000-KeepAlertRecordsAfterPolicyDeletion'

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
        AddIssuesAlertsAndPrivacy1790465349745,
        AddReleasesAndEnvironments1790467622232,
        AddMappingTables1790468776314,
        AddAiUsageAndMcpServices1790471332672,
        MaskLogsBeforeWrite1790473281926,
        AddTestDeployments1790473753032,
        AddDataErasureRequests1790474079361,
        AddAgentApprovals1790475172395,
        DesignDocRolloutSchema1790501279466,
        AddExecutionBusinessKey1790851200000,
        AddSolutions1790921911539,
        AddSolutionInstallWorkflowKeys1790930000000,
        KeepAlertRecordsAfterPolicyDeletion1790940000000,
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

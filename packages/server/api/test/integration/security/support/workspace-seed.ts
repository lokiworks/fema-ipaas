import { WebhookRenewStrategy } from '@fema-ipaas/connector-sdk'
import { generateId, isNil, isObject } from '@fema-ipaas/core-utils'
import {
    ConnectorType,
    PackageType,
    PropertyExecutionType,
    SolutionCheckKind,
    SolutionProvider,
    SolutionVisibility,
    TemplateStatus,
    TemplateType,
    TemplateVisibility,
    TriggerStrategy,
    TriggerTestStrategy,
    WebhookHandshakeStrategy,
    WorkflowActionType,
    WorkflowReleaseStatus,
    WorkflowStatus,
    WorkflowTrigger,
    WorkflowTriggerType,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata, createMockWorkflow, createMockWorkflowVersion } from '../../../helpers/mocks'
import { Identity, Scope, World, WorldRequest } from './world'

const SCHEDULE_CONNECTOR_NAME = '@fema-ipaas/connector-schedule'
const SCHEDULE_CONNECTOR_VERSION = '0.1.5'

function actorOf({ world, scope }: { world: World, scope: Scope }): Identity {
    return world.scopes[scope].actor.identity
}

function idOf({ value }: { value: unknown }): string {
    if (isObject(value) && 'id' in value && typeof value.id === 'string') {
        return value.id
    }
    throw new Error(`response has no id: ${JSON.stringify(value).slice(0, 200)}`)
}

async function sendAsOwner({ world, scope, request, label }: { world: World, scope: Scope, request: WorldRequest, label: string }): Promise<unknown> {
    const response = await world.send({ identity: actorOf({ world, scope }), request })
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`seed ${label} failed with ${response.status}: ${response.text.slice(0, 300)}`)
    }
    return response.json()
}

async function create({ world, scope, request, label }: { world: World, scope: Scope, request: WorldRequest, label: string }): Promise<string> {
    return idOf({ value: await sendAsOwner({ world, scope, request, label }) })
}

function unique({ prefix }: { prefix: string }): string {
    return `${prefix}_${generateId().slice(0, 10)}`.replace(/[^a-zA-Z0-9_]/g, '_')
}

async function folder({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string }> {
    const id = await create({
        world,
        scope,
        label: 'folder',
        request: { method: 'POST', url: '/v1/folders', body: { projectId: world.scopes[scope].project.id, displayName: unique({ prefix: 'sec-folder' }) } },
    })
    return { id }
}

async function variable({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string, name: string, value: string }> {
    const name = unique({ prefix: 'SEC_VAR' })
    const value = `top-secret-${generateId()}`
    const id = await create({
        world,
        scope,
        label: 'variable',
        request: { method: 'POST', url: '/v1/variables', body: { projectId: world.scopes[scope].project.id, name, value } },
    })
    return { id, name, value }
}

async function dataStore({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string, name: string }> {
    const name = unique({ prefix: 'sec-store' })
    const id = await create({
        world,
        scope,
        label: 'data store',
        request: { method: 'POST', url: '/v1/data-stores', body: { projectId: world.scopes[scope].project.id, name, description: '', ttlDays: 30 } },
    })
    return { id, name }
}

async function dataStoreRecord({ world, scope, storeId, key }: { world: World, scope: Scope, storeId: string, key: string }): Promise<void> {
    await sendAsOwner({
        world,
        scope,
        label: 'data store record',
        request: { method: 'POST', url: `/v1/data-stores/${storeId}/records`, body: { mode: 'CREATE', key, value: 'v' } },
    })
}

function mappingTableBody({ projectId, name }: { projectId: string, name: string }): Record<string, unknown> {
    return {
        projectId,
        name,
        description: '',
        keyLabel: 'from',
        valueLabel: 'to',
        missingBehavior: 'ERROR',
        defaultValue: null,
        rows: [{ k: 'a', v: 'b' }],
    }
}

async function mappingTable({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string, name: string }> {
    const name = unique({ prefix: 'sec-map' }).slice(0, 30)
    const id = await create({
        world,
        scope,
        label: 'mapping table',
        request: { method: 'POST', url: '/v1/mapping-tables', body: mappingTableBody({ projectId: world.scopes[scope].project.id, name }) },
    })
    return { id, name }
}

function emptyValidTrigger(): WorkflowTrigger {
    return {
        type: WorkflowTriggerType.EMPTY,
        name: 'trigger',
        settings: {},
        valid: true,
        displayName: 'Trigger',
        lastUpdatedDate: dayjs().toISOString(),
        nextAction: {
            type: WorkflowActionType.CODE,
            name: 'step_1',
            valid: true,
            displayName: 'Code',
            lastUpdatedDate: dayjs().toISOString(),
            settings: {
                sourceCodeHash: 'x',
                input: {},
                sourceCode: { code: 'export const code = async () => 1', packageJson: '{}' },
            },
        },
    }
}

function scheduleTrigger(): WorkflowTrigger {
    return {
        type: WorkflowTriggerType.CONNECTOR,
        settings: {
            connectorName: SCHEDULE_CONNECTOR_NAME,
            connectorVersion: SCHEDULE_CONNECTOR_VERSION,
            input: { run_on_weekends: false },
            triggerName: 'every_hour',
            propertySettings: {
                run_on_weekends: { type: PropertyExecutionType.MANUAL },
            },
        },
        valid: true,
        name: 'trigger',
        displayName: 'Schedule',
        lastUpdatedDate: dayjs().toISOString(),
    }
}

async function ensureScheduleConnector(): Promise<void> {
    const existing = await db.findOneBy('connector_metadata', { name: SCHEDULE_CONNECTOR_NAME, version: SCHEDULE_CONNECTOR_VERSION })
    if (!isNil(existing)) {
        return
    }
    await db.save('connector_metadata', createMockConnectorMetadata({
        name: SCHEDULE_CONNECTOR_NAME,
        version: SCHEDULE_CONNECTOR_VERSION,
        triggers: {
            every_hour: {
                name: 'every_hour',
                displayName: 'Every Hour',
                description: 'Triggers the current workflow every hour',
                requireAuth: true,
                props: {},
                type: TriggerStrategy.WEBHOOK,
                handshakeConfiguration: { strategy: WebhookHandshakeStrategy.NONE },
                renewConfiguration: { strategy: WebhookRenewStrategy.NONE },
                sampleData: {},
                testStrategy: TriggerTestStrategy.TEST_FUNCTION,
            },
        },
        connectorType: ConnectorType.OFFICIAL,
        packageType: PackageType.REGISTRY,
    }))
}

async function validWorkflow({ world, scope, projectId, published, status, state }: ValidWorkflowParams): Promise<SeededValidWorkflow> {
    const targetProjectId = projectId ?? world.scopes[scope].project.id
    const trigger = emptyValidTrigger()
    const workflow = createMockWorkflow({ projectId: targetProjectId, status: status ?? WorkflowStatus.DISABLED, folderId: null, publishedVersionId: null })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        workflowId: workflow.id,
        state: state ?? (published === true ? WorkflowVersionState.LOCKED : WorkflowVersionState.DRAFT),
        valid: true,
        trigger,
        updatedBy: world.scopes[scope].ownerId,
    })
    await db.save('workflow_version', version)
    if (published === true) {
        await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    }
    return { id: workflow.id, versionId: version.id, projectId: targetProjectId }
}

async function scheduledWorkflow({ world, scope, projectId, published }: { world: World, scope: Scope, projectId?: string, published?: boolean }): Promise<SeededValidWorkflow> {
    await ensureScheduleConnector()
    const targetProjectId = projectId ?? world.scopes[scope].project.id
    const workflow = createMockWorkflow({ projectId: targetProjectId, status: WorkflowStatus.DISABLED, folderId: null, publishedVersionId: null })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        workflowId: workflow.id,
        state: published === true ? WorkflowVersionState.LOCKED : WorkflowVersionState.DRAFT,
        valid: true,
        trigger: scheduleTrigger(),
        updatedBy: world.scopes[scope].ownerId,
    })
    await db.save('workflow_version', version)
    if (published === true) {
        await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    }
    return { id: workflow.id, versionId: version.id, projectId: targetProjectId }
}

async function release({ world, projectId, workflowId, versionId, requestedBy, approverIds, status }: ReleaseParams): Promise<{ id: string }> {
    const id = generateId()
    const now = dayjs().toISOString()
    await db.save('workflow_release', {
        id,
        created: now,
        updated: now,
        projectId,
        workflowId,
        workflowVersionId: versionId,
        previousVersionId: null,
        status: status ?? WorkflowReleaseStatus.PENDING,
        note: 'sec-release',
        requestedById: requestedBy ?? world.scopes.A.ownerId,
        approverIds,
        decidedById: null,
        decidedAt: null,
        comment: null,
    })
    return { id }
}

function solutionPackage(): Record<string, unknown> {
    return {
        format: 'fema-solution',
        version: 1,
        connections: [],
        workflows: [],
        mappingTables: [],
        config: [],
        checks: [{ key: 'manual:1', label: 'manual check', kind: SolutionCheckKind.MANUAL, blocking: false, fixSteps: [] }],
    }
}

async function solution({ world, scope, createdBy, visibility, sourceProjectId, newerVersion }: SolutionParams): Promise<{ id: string }> {
    const info = world.scopes[scope]
    const id = generateId()
    const now = dayjs().toISOString()
    const publisher = createdBy ?? info.ownerId
    await db.save('solution', {
        id,
        created: now,
        updated: now,
        tenantId: info.tenant.id,
        provider: SolutionProvider.TENANT,
        name: `sec-solution-${id}`.slice(0, 40),
        summary: 'sec',
        category: 'HR',
        visibility: visibility ?? SolutionVisibility.TENANT,
        sourceProjectId: sourceProjectId ?? null,
        currentVersion: newerVersion === true ? '1.1' : '1.0',
        createdBy: publisher,
    })
    const versions = newerVersion === true ? ['1.0', '1.1'] : ['1.0']
    await db.save('solution_version', versions.map((version) => ({
        id: generateId(),
        created: now,
        updated: now,
        solutionId: id,
        version,
        notes: `version ${version}`,
        package: solutionPackage(),
        publishedBy: publisher,
    })))
    return { id }
}

async function solutionInstall({ world, scope, solutionId, installedBy }: { world: World, scope: Scope, solutionId: string, installedBy?: string }): Promise<{ id: string }> {
    const info = world.scopes[scope]
    const id = generateId()
    const now = dayjs().toISOString()
    await db.save('solution_install', {
        id,
        created: now,
        updated: now,
        tenantId: info.tenant.id,
        projectId: info.project.id,
        solutionId,
        solutionName: 'sec-solution',
        version: '1.0',
        config: {},
        connections: {},
        workflowIds: [],
        workflowKeys: [],
        mappingTableIds: [],
        skippedChecks: [],
        installedBy: installedBy ?? info.ownerId,
    })
    return { id }
}

async function template({ world, scope, createdBy, visibility, type, tenantId }: TemplateParams): Promise<{ id: string }> {
    const info = world.scopes[scope]
    const id = generateId()
    const now = dayjs().toISOString()
    await db.save('template', {
        id,
        created: now,
        updated: now,
        name: `sec-template-${id}`.slice(0, 40),
        summary: 'sec',
        description: 'sec',
        tags: [],
        blogUrl: null,
        metadata: null,
        author: 'sec',
        categories: [],
        type: type ?? TemplateType.CUSTOM,
        status: TemplateStatus.PUBLISHED,
        connectors: [],
        workflows: [templateWorkflow()],
        tenantId: tenantId === undefined ? info.tenant.id : tenantId,
        createdBy: createdBy ?? null,
        visibility: visibility ?? null,
        usageCount: 0,
        featured: false,
    })
    return { id }
}

function templateWorkflow(): Record<string, unknown> {
    return {
        displayName: 'sec template workflow',
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: false,
            displayName: 'Select Trigger',
            lastUpdatedDate: dayjs().toISOString(),
        },
        valid: false,
        schemaVersion: null,
    }
}

async function countRows({ entity, where }: { entity: string, where: Record<string, unknown> }): Promise<number> {
    return databaseConnection().getRepository(entity).countBy(where)
}

async function setReleaseMode({ projectId, enabled, approverIds }: { projectId: string, enabled: boolean, approverIds?: string[] }): Promise<void> {
    await db.update('project', projectId, { releasesEnabled: enabled, releaseApproverIds: approverIds ?? [] })
}

export const workspaceSeed = {
    folder,
    variable,
    dataStore,
    dataStoreRecord,
    mappingTable,
    mappingTableBody,
    validWorkflow,
    scheduledWorkflow,
    release,
    solution,
    solutionInstall,
    template,
    templateWorkflowBody: templateWorkflow,
    setReleaseMode,
    countRows,
    emptyValidTrigger,
    uniqueName: unique,
}

export type SeededValidWorkflow = {
    id: string
    versionId: string
    projectId: string
}

type ValidWorkflowParams = {
    world: World
    scope: Scope
    projectId?: string
    published?: boolean
    status?: WorkflowStatus
    state?: WorkflowVersionState
}

type ReleaseParams = {
    world: World
    projectId: string
    workflowId: string
    versionId: string
    requestedBy?: string
    approverIds: string[]
    status?: WorkflowReleaseStatus
}

type SolutionParams = {
    world: World
    scope: Scope
    createdBy?: string
    visibility?: SolutionVisibility
    sourceProjectId?: string
    newerVersion?: boolean
}

type TemplateParams = {
    world: World
    scope: Scope
    createdBy?: string
    visibility?: TemplateVisibility
    type?: TemplateType
    tenantId?: string | null
}

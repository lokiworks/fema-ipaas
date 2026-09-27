import { OAuth2AuthorizationMethod } from '@fema-ipaas/connector-sdk'
import { generateId, isNil } from '@fema-ipaas/core-utils'
import {
    BLUEPRINT_DEVKIT_ACTIONS,
    BLUEPRINT_LIMITS,
    BlueprintAuth,
    BlueprintAuthType,
    BlueprintDebugResult,
    blueprintFactory,
    blueprintProblems,
    BlueprintTestKind,
    BlueprintTestResult,
    BlueprintTestStatus,
    ConnectionType,
    ConnectorBlueprintDetail,
    ConnectorType,
    DebugBlueprintOperationRequest,
    FileCompression,
    FileType,
    OAuth2GrantType,
    PackageType,
    PrivateConnectorPackage,
    RunBlueprintAuthTestRequest,
    SaveBlueprintDebugRecordRequest,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { ActionRunOutcome, actionRunService, ActionRunStatus } from '../../action-run/action-run.service'
import { connectionAccessService } from '../../connection/connection-access.service'
import { credentialsOauth2Service } from '../../connection/connection-service/oauth2/services/credentials-oauth2-service'
import { fileRepo, fileService } from '../../file/file.service'
import { s3Helper } from '../../file/s3-helper'
import { BLUEPRINT_SECRET_MASK, blueprintAccess, BlueprintActor, blueprintAuthState, blueprintCommon, blueprintRepo, BlueprintTestData, blueprintTestData } from './connector-blueprint-common'
import { connectorBlueprintPackage } from './connector-blueprint-package'
import { ConnectorBlueprintSchema } from './connector-blueprint.entity'
import { connectorBlueprintService } from './connector-blueprint.service'

export const connectorBlueprintDevService = (log: FastifyBaseLogger) => ({
    async saveTestData({ id, actor, values }: SaveTestDataParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const auth = requireAuth(blueprint)
        const allowed = [...blueprintFactory.autoAuthFields(auth.type), ...auth.fields].map((field) => field.key)
        const previous = await blueprintTestData.read(blueprint)
        const nextValues = Object.fromEntries(allowed.map((key) => {
            const submitted = values[key]
            const kept = submitted === BLUEPRINT_SECRET_MASK ? previous.values[key] ?? '' : (submitted ?? '').trim()
            return [key, kept]
        }).filter(([, value]) => value.length > 0))
        const unchanged = JSON.stringify(nextValues) === JSON.stringify(previous.values)
        const authTestData = await blueprintTestData.write({ values: nextValues, oauth: unchanged ? previous.oauth : null })
        await blueprintRepo().save({ ...blueprint, authTestData, authState: { ...blueprint.authState, testRevision: blueprint.authState.testRevision + 1 } })
        return connectorBlueprintService(log).detail({ id, actor })
    },

    async runAuthTest({ id, actor, request }: RunAuthTestParams): Promise<BlueprintTestResult> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const auth = requireAuth(blueprint)
        if (blueprintProblems.auth({ auth }).length > 0) {
            throw blueprintCommon.validation('Finish the authentication configuration before testing it')
        }
        const projectId = await testProjectOf({ actor, projectId: request.projectId, log })
        const started = Date.now()
        const testData = request.kind === BlueprintTestKind.FLOW && auth.type === BlueprintAuthType.AUTHORIZATION_CODE && !isNil(request.code)
            ? await claimAuthorizationCode({ blueprint, auth, request, actor, log })
            : await blueprintTestData.read(blueprint)
        const fresh = await blueprintRepo().findOneByOrFail({ id: blueprint.id, tenantId: actor.tenantId })
        const outcome = await runTestOnWorker({ blueprint: fresh, auth, testData, request, actor, projectId, log })
        const result: BlueprintTestResult = {
            status: outcome.success ? BlueprintTestStatus.PASSED : BlueprintTestStatus.FAILED,
            message: outcome.message,
            durationMs: Date.now() - started,
            at: dayjs().toISOString(),
            hash: blueprintAuthState.testHash({ auth, revision: fresh.authState.testRevision }),
            operationKey: request.kind === BlueprintTestKind.API ? request.operationKey : null,
        }
        const authState = request.kind === BlueprintTestKind.FLOW
            ? { ...fresh.authState, flowTest: result, apiTest: null }
            : { ...fresh.authState, apiTest: result }
        await blueprintRepo().save({ ...fresh, authState })
        return result
    },

    async publishAuth({ id, actor }: IdParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const auth = requireAuth(blueprint)
        const revision = blueprint.authState.testRevision
        const flow = blueprintAuthState.validTest({ result: blueprint.authState.flowTest, auth, revision })
        const api = blueprintAuthState.validTest({ result: blueprint.authState.apiTest, auth, revision })
        if (blueprintProblems.auth({ auth }).length > 0 || !blueprintAuthState.passed(flow) || !blueprintAuthState.passed(api)) {
            throw blueprintCommon.validation('Pass the authentication flow test and the business API test before publishing the authentication')
        }
        await blueprintRepo().save({
            ...blueprint,
            authState: { ...blueprint.authState, publishedHash: blueprintAuthState.configHash(auth), publishedAt: dayjs().toISOString(), publishedType: auth.type },
        })
        return connectorBlueprintService(log).detail({ id, actor })
    },

    async debug({ id, actor, request }: DebugParams): Promise<BlueprintDebugResult> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const operation = blueprint.definition.operations.find((candidate) => candidate.key === request.operationKey)
        if (isNil(operation)) {
            throw blueprintCommon.validation(`Operation ${request.operationKey} does not exist`)
        }
        const projectId = await testProjectOf({ actor, projectId: request.projectId, log })
        const testData = await blueprintTestData.read(blueprint)
        const authInput = authValueOf({ auth: blueprintAuthState.activeAuth(blueprint.definition), testData })
        const connector = await draftPackage({ blueprint, actor, log })
        const outcome = await actionRunService(log).runPackageAction({
            tenantId: actor.tenantId,
            projectId,
            connector,
            actionName: `${BLUEPRINT_DEVKIT_ACTIONS.debugPrefix}${operation.key}`,
            input: { ...request.input, ...(isNil(authInput) ? {} : { auth: authInput }) },
            timeoutSeconds: operationTimeout(operation.request?.timeoutSeconds),
        })
        return debugResultOf(outcome)
    },

    async saveDebugRecord({ id, actor, request }: SaveRecordParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const record = { id: generateId(), operationKey: request.operationKey, at: dayjs().toISOString(), input: request.input, success: request.success, status: request.status, durationMs: request.durationMs }
        const own = [record, ...blueprint.debugRecords.filter((candidate) => candidate.operationKey === request.operationKey)].slice(0, BLUEPRINT_LIMITS.debugRecords)
        const others = blueprint.debugRecords.filter((candidate) => candidate.operationKey !== request.operationKey)
        await blueprintRepo().save({ ...blueprint, debugRecords: [...own, ...others] })
        return connectorBlueprintService(log).detail({ id, actor })
    },
})

async function runTestOnWorker({ blueprint, auth, testData, request, actor, projectId, log }: RunTestParams): Promise<{ success: boolean, message: string }> {
    const authValue = authValueOf({ auth, testData })
    if (isNil(authValue)) {
        return { success: false, message: auth.type === BlueprintAuthType.AUTHORIZATION_CODE ? 'Authorize with the service first to get an access token' : 'Fill in the test data first' }
    }
    const connector = await draftPackage({ blueprint, actor, log })
    if (request.kind === BlueprintTestKind.FLOW) {
        const outcome = await actionRunService(log).runPackageAction({ tenantId: actor.tenantId, projectId, connector, actionName: BLUEPRINT_DEVKIT_ACTIONS.authTest, input: { auth: authValue }, timeoutSeconds: TEST_TIMEOUT_SECONDS })
        if (outcome.status !== ActionRunStatus.SUCCEEDED) {
            return { success: false, message: outcome.errorMessage ?? 'The authentication flow failed' }
        }
        const user = readString({ value: outcome.output, key: 'user' })
        return { success: true, message: user }
    }
    const operation = blueprint.definition.operations.find((candidate) => candidate.key === request.operationKey)
    if (isNil(operation)) {
        return { success: false, message: 'Pick an operation to call' }
    }
    const flow = blueprintAuthState.validTest({ result: blueprint.authState.flowTest, auth, revision: blueprint.authState.testRevision })
    if (!blueprintAuthState.passed(flow)) {
        return { success: false, message: 'Pass the authentication flow test first' }
    }
    const outcome = await actionRunService(log).runPackageAction({ tenantId: actor.tenantId, projectId, connector, actionName: `${BLUEPRINT_DEVKIT_ACTIONS.debugPrefix}${operation.key}`, input: { auth: authValue }, timeoutSeconds: operationTimeout(operation.request?.timeoutSeconds) })
    const result = debugResultOf(outcome)
    return { success: result.success, message: result.success ? `HTTP ${result.status}` : result.errorMessage ?? `HTTP ${result.status}` }
}

async function claimAuthorizationCode({ blueprint, auth, request, actor, log }: ClaimParams): Promise<BlueprintTestData> {
    const previous = await blueprintTestData.read(blueprint)
    const clientId = previous.values.client_id ?? ''
    if (clientId.length === 0 || isNil(request.code)) {
        throw blueprintCommon.validation('Fill in the Client ID and Client Secret in the test data first')
    }
    const customProps = Object.fromEntries(auth.fields.map((field) => [field.key, previous.values[field.key] ?? '']))
    const claimed = await credentialsOauth2Service(log).claim({
        projectId: undefined,
        tenantId: actor.tenantId,
        connectorName: blueprint.connectorName,
        request: {
            code: request.code,
            clientId,
            clientSecret: previous.values.client_secret,
            tokenUrl: auth.tokenUrl,
            redirectUrl: request.redirectUrl ?? undefined,
            codeVerifier: request.codeVerifier ?? undefined,
            grantType: OAuth2GrantType.AUTHORIZATION_CODE,
            authorizationMethod: OAuth2AuthorizationMethod.BODY,
            props: customProps,
        },
    })
    const next: BlueprintTestData = {
        values: previous.values,
        oauth: { access_token: claimed.access_token, refresh_token: claimed.refresh_token ?? null, data: claimed.data ?? {} },
    }
    await blueprintRepo().save({ ...blueprint, authTestData: await blueprintTestData.write(next) })
    return next
}

async function draftPackage({ blueprint, actor, log }: { blueprint: ConnectorBlueprintSchema, actor: BlueprintActor, log: FastifyBaseLogger }): Promise<PrivateConnectorPackage> {
    const { hash, packageVersion } = connectorBlueprintPackage.draftVersion(blueprint.definition)
    const existing = blueprint.draftBuild
    if (!isNil(existing) && existing.hash === hash) {
        const file = await fileRepo().findOneBy({ id: existing.archiveId, tenantId: actor.tenantId, type: FileType.PACKAGE_ARCHIVE })
        if (!isNil(file)) {
            return packageOf({ blueprint, archiveId: existing.archiveId, packageVersion: existing.packageVersion, tenantId: actor.tenantId })
        }
    }
    const manifest = connectorBlueprintPackage.manifest({ identifier: blueprint.identifier, connectorName: blueprint.connectorName, packageVersion, definition: blueprint.definition, draft: true })
    const archive = connectorBlueprintPackage.archive(manifest)
    const saved = await fileService(log).save({ tenantId: actor.tenantId, data: archive, size: archive.length, type: FileType.PACKAGE_ARCHIVE, compression: FileCompression.NONE })
    const latest = await blueprintRepo().findOneByOrFail({ id: blueprint.id, tenantId: actor.tenantId })
    await blueprintRepo().save({ ...latest, draftBuild: { hash, archiveId: saved.id, packageVersion } })
    if (!isNil(existing) && existing.archiveId !== saved.id) {
        await deleteArchive({ archiveId: existing.archiveId, tenantId: actor.tenantId, log })
    }
    return packageOf({ blueprint, archiveId: saved.id, packageVersion, tenantId: actor.tenantId })
}

async function deleteArchive({ archiveId, tenantId, log }: { archiveId: string, tenantId: string, log: FastifyBaseLogger }): Promise<void> {
    const file = await fileRepo().findOneBy({ id: archiveId, tenantId, type: FileType.PACKAGE_ARCHIVE })
    if (isNil(file)) {
        return
    }
    if (!isNil(file.s3Key)) {
        await s3Helper(log).deleteFiles([file.s3Key])
    }
    await fileRepo().delete({ id: file.id, tenantId })
}

function packageOf({ blueprint, archiveId, packageVersion, tenantId }: { blueprint: ConnectorBlueprintSchema, archiveId: string, packageVersion: string, tenantId: string }): PrivateConnectorPackage {
    return {
        packageType: PackageType.ARCHIVE,
        connectorType: ConnectorType.CUSTOM,
        connectorName: blueprint.connectorName,
        connectorVersion: packageVersion,
        archiveId,
        tenantId,
    }
}

async function testProjectOf({ actor, projectId, log }: { actor: BlueprintActor, projectId: string | null, log: FastifyBaseLogger }): Promise<string> {
    const memberIds = await connectionAccessService(log).memberProjectIds({ userId: actor.userId, tenantId: actor.tenantId })
    if (!isNil(projectId)) {
        if (!memberIds.includes(projectId)) {
            throw blueprintCommon.denied('You are not a member of the selected project')
        }
        return projectId
    }
    const first = memberIds[0]
    if (isNil(first)) {
        throw blueprintCommon.validation('Tests run on a worker inside one of your projects. Join or create a project first.')
    }
    return first
}

function authValueOf({ auth, testData }: { auth: BlueprintAuth | null, testData: BlueprintTestData }): Record<string, unknown> | undefined {
    if (isNil(auth)) {
        return undefined
    }
    if (auth.type === BlueprintAuthType.AUTHORIZATION_CODE) {
        if (isNil(testData.oauth)) {
            return undefined
        }
        const props = Object.fromEntries(auth.fields.map((field) => [field.key, testData.values[field.key] ?? '']))
        return {
            type: ConnectionType.OAUTH2,
            access_token: testData.oauth.access_token,
            refresh_token: testData.oauth.refresh_token,
            data: testData.oauth.data,
            props,
            client_id: testData.values.client_id ?? '',
            token_url: auth.tokenUrl,
            scope: auth.scope,
        }
    }
    const required = [...blueprintFactory.autoAuthFields(auth.type), ...auth.fields].filter((field) => field.required)
    if (required.some((field) => (testData.values[field.key] ?? '').length === 0)) {
        return undefined
    }
    return { type: ConnectionType.CUSTOM_AUTH, props: testData.values }
}

function requireAuth(blueprint: ConnectorBlueprintSchema): BlueprintAuth {
    const auth = blueprintAuthState.activeAuth(blueprint.definition)
    if (isNil(auth)) {
        throw blueprintCommon.validation('This connector has no active authentication')
    }
    return auth
}

function debugResultOf(outcome: ActionRunOutcome): BlueprintDebugResult {
    const at = dayjs().toISOString()
    if (outcome.status !== ActionRunStatus.SUCCEEDED || !isRecord(outcome.output)) {
        return { success: false, status: 0, durationMs: outcome.durationMs, at, request: '', response: null, log: [], errorMessage: outcome.errorMessage ?? 'The worker could not run the operation' }
    }
    const output = outcome.output
    return {
        success: output.success === true,
        status: typeof output.status === 'number' ? output.status : 0,
        durationMs: typeof output.durationMs === 'number' ? output.durationMs : outcome.durationMs,
        at,
        request: typeof output.request === 'string' ? output.request : '',
        response: output.response ?? null,
        log: Array.isArray(output.log) ? output.log.filter((line): line is string => typeof line === 'string') : [],
        errorMessage: typeof output.errorMessage === 'string' ? output.errorMessage : null,
    }
}

function readString({ value, key }: { value: unknown, key: string }): string {
    if (!isRecord(value)) {
        return ''
    }
    const entry = value[key]
    return typeof entry === 'string' ? entry : ''
}

function operationTimeout(seconds: number | undefined): number {
    return Math.min(BLUEPRINT_LIMITS.timeoutMax, seconds ?? 30) + WORKER_OVERHEAD_SECONDS
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const TEST_TIMEOUT_SECONDS = 120
const WORKER_OVERHEAD_SECONDS = 60

type IdParams = {
    id: string
    actor: BlueprintActor
}

type SaveTestDataParams = IdParams & {
    values: Record<string, string>
}

type RunAuthTestParams = IdParams & {
    request: RunBlueprintAuthTestRequest
}

type DebugParams = IdParams & {
    request: DebugBlueprintOperationRequest
}

type SaveRecordParams = IdParams & {
    request: SaveBlueprintDebugRecordRequest
}

type RunTestParams = {
    blueprint: ConnectorBlueprintSchema
    auth: BlueprintAuth
    testData: BlueprintTestData
    request: RunBlueprintAuthTestRequest
    actor: BlueprintActor
    projectId: string
    log: FastifyBaseLogger
}

type ClaimParams = {
    blueprint: ConnectorBlueprintSchema
    auth: BlueprintAuth
    request: RunBlueprintAuthTestRequest
    actor: BlueprintActor
    log: FastifyBaseLogger
}

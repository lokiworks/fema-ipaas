import { AIProviderName, apId, assertNotNullOrUndefined, WorkspaceRole, RoleType } from '@fema/core-utils'
import { LATEST_CONTEXT_VERSION, ConnectorMetadata } from '@fema/connector-sdk'
import { AIProvider, Connection, ConnectionScope, ConnectionStatus, ConnectionType, ApplicationEvent, ApplicationEventName, ColorName, File, FileCompression, FileLocation, FileType, Flow, FlowOperationStatus, Execution, ExecutionStatus, FlowStatus, FlowTriggerType, FlowVersion, FlowVersionState, Folder, InvitationStatus, InvitationType, LATEST_FLOW_SCHEMA_VERSION, OtpModel, OtpState, OtpType, PackageType, ConnectorsFilterType, ConnectorType, Platform, PlatformPlan, PlatformRole, Workspace, WorkspaceIcon, WorkspaceType, RunEnvironment, Template, TemplateStatus, TemplateType, User, UserIdentity, UserIdentityProvider, UserInvitation, UserStatus } from '@fema/shared'
import { faker } from '@faker-js/faker'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { AIProviderSchema } from '../../../src/app/ai/ai-provider-entity'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { generateApiKey } from '../../../src/app/ee/api-keys/api-key-service'
import { OAuthAppWithEncryptedSecret } from '../../../src/app/ee/oauth-apps/oauth-app.entity'
import { PlatformPlanEntity } from '../../../src/app/ee/platform/platform-plan/platform-plan.entity'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { ConnectorMetadataSchema } from '../../../src/app/connectors/metadata/connector-metadata-entity'
import { connectorMetadataService } from '../../../src/app/connectors/metadata/connector-metadata-service'

export const CLOUD_PLATFORM_ID = 'cloud-id'

const HASHED_OTP_VERSION = 1

export const createMockUserIdentity = (userIdentity?: Partial<UserIdentity>): UserIdentity => {
    return {
        id: userIdentity?.id ?? apId(),
        created: userIdentity?.created ?? faker.date.recent().toISOString(),
        updated: userIdentity?.updated ?? faker.date.recent().toISOString(),
        email: (userIdentity?.email ?? `${apId()}@example.com`).toLowerCase().trim(),
        firstName: userIdentity?.firstName ?? faker.person.firstName(),
        lastName: userIdentity?.lastName ?? faker.person.lastName(),
        tokenVersion: userIdentity?.tokenVersion ?? undefined,
        password: userIdentity?.password
            ? bcrypt.hashSync(userIdentity.password, 10)
            : faker.internet.password(),
        trackEvents: userIdentity?.trackEvents ?? faker.datatype.boolean(),
        newsLetter: userIdentity?.newsLetter ?? faker.datatype.boolean(),
        verified: userIdentity?.verified ?? faker.datatype.boolean(),
        provider: userIdentity?.provider ?? UserIdentityProvider.EMAIL,
    }
}

export const createMockUser = (user?: Partial<User>): User => {
    return {
        id: user?.id ?? apId(),
        created: user?.created ?? faker.date.recent().toISOString(),
        updated: user?.updated ?? faker.date.recent().toISOString(),
        status: user?.status ?? UserStatus.ACTIVE,
        platformRole: user?.platformRole ?? faker.helpers.enumValue(PlatformRole),
        externalId: user?.externalId,
        identityId: user?.identityId ?? apId(),
        platformId: user?.platformId ?? null,
    }
}

export const createMockOAuthApp = async (
    oAuthApp?: Partial<OAuthApp>,
): Promise<OAuthAppWithEncryptedSecret> => {
    return {
        id: oAuthApp?.id ?? apId(),
        created: oAuthApp?.created ?? faker.date.recent().toISOString(),
        updated: oAuthApp?.updated ?? faker.date.recent().toISOString(),
        platformId: oAuthApp?.platformId ?? apId(),
        connectorName: oAuthApp?.connectorName ?? faker.lorem.word(),
        clientId: oAuthApp?.clientId ?? apId(),
        clientSecret: await encryptUtils.encryptString(faker.lorem.word()),
    }
}

export const createMockTemplate = (
    template?: Partial<Template>,
): Template => {
    return {
        id: template?.id ?? apId(),
        created: template?.created ?? faker.date.recent().toISOString(),
        updated: template?.updated ?? faker.date.recent().toISOString(),
        connectors: template?.connectors ?? [],
        flows: template?.flows ?? [createMockFlowVersion()],
        platformId: template?.platformId ?? apId(),
        name: template?.name ?? faker.lorem.word(),
        type: template?.type ?? TemplateType.CUSTOM,
        description: template?.description ?? faker.lorem.sentence(),
        summary: template?.summary ?? faker.lorem.sentence(),
        tags: template?.tags ?? [],
        blogUrl: template?.blogUrl ?? faker.internet.url(),
        metadata: template?.metadata ?? null,
        author: template?.author ?? faker.person.fullName(),
        categories: template?.categories ?? [],
        status: template?.status ?? TemplateStatus.PUBLISHED,
    }
}

export const createMockPlan = (plan?: Partial<WorkspacePlan>): WorkspacePlan => {
    return {
        id: plan?.id ?? apId(),
        created: plan?.created ?? faker.date.recent().toISOString(),
        updated: plan?.updated ?? faker.date.recent().toISOString(),
        workspaceId: plan?.workspaceId ?? apId(),
        name: plan?.name ?? faker.lorem.word(),
        locked: plan?.locked ?? false,
        connectors: plan?.connectors ?? [],
        connectorsFilterType: plan?.connectorsFilterType ?? ConnectorsFilterType.NONE,
        activeFlowsLimit: plan?.activeFlowsLimit ?? null,
    }
}

export const createMockUserInvitation = (userInvitation: Partial<UserInvitation>): UserInvitation => {
    return {
        id: userInvitation.id ?? apId(),
        created: userInvitation.created ?? faker.date.recent().toISOString(),
        updated: userInvitation.updated ?? faker.date.recent().toISOString(),
        email: userInvitation.email ?? faker.internet.email(),
        type: userInvitation.type ?? faker.helpers.enumValue(InvitationType),
        platformId: userInvitation.platformId ?? apId(),
        workspaceId: userInvitation.workspaceId,
        workspaceRole: userInvitation.workspaceRole,
        platformRole: userInvitation.platformRole,
        status: userInvitation.status ?? faker.helpers.enumValue(InvitationStatus),
    }
}

export const createMockWorkspace = (workspace?: Partial<Workspace>): Workspace => {
    const icon: WorkspaceIcon = {
        color: faker.helpers.enumValue(ColorName),
    }
    return {
        id: workspace?.id ?? apId(),
        created: workspace?.created ?? faker.date.recent().toISOString(),
        updated: workspace?.updated ?? faker.date.recent().toISOString(),
        deleted: workspace?.deleted ?? null,
        ownerId: workspace?.ownerId ?? apId(),
        displayName: workspace?.displayName ?? faker.lorem.word(),
        platformId: workspace?.platformId ?? apId(),
        externalId: workspace?.externalId ?? apId(),
        releasesEnabled: workspace?.releasesEnabled ?? false,
        notifyFlowOwnerOnFailure: workspace?.notifyFlowOwnerOnFailure ?? false,
        metadata: workspace?.metadata ?? null,
        type: workspace?.type ?? WorkspaceType.TEAM,
        poolId: workspace?.poolId ?? null,
        workerGroupId: workspace?.workerGroupId ?? null,
        executionDataRetentionDays: workspace?.executionDataRetentionDays ?? null,
        icon,
    }
}

export const createMockGitRepo = (gitRepo?: Partial<GitRepo>): GitRepo => {
    return {
        id: gitRepo?.id ?? apId(),
        branchType: faker.helpers.enumValue(GitBranchType),
        created: gitRepo?.created ?? faker.date.recent().toISOString(),
        updated: gitRepo?.updated ?? faker.date.recent().toISOString(),
        workspaceId: gitRepo?.workspaceId ?? apId(),
        remoteUrl: gitRepo?.remoteUrl ?? `git@${faker.internet.url()}`,
        sshPrivateKey: gitRepo?.sshPrivateKey ?? faker.internet.password(),
        branch: gitRepo?.branch ?? faker.lorem.word(),
        slug: gitRepo?.slug ?? faker.lorem.word(),
    }
}

export const createMockPlatformPlan = (platformPlan?: Partial<PlatformPlan>): PlatformPlan => {
    return {
        id: platformPlan?.id ?? apId(),
        created: platformPlan?.created ?? faker.date.recent().toISOString(),
        updated: platformPlan?.updated ?? faker.date.recent().toISOString(),
        platformId: platformPlan?.platformId ?? apId(),
        tablesEnabled: platformPlan?.tablesEnabled ?? false,
        includedCredits: platformPlan?.includedCredits ?? 0,
        licenseKey: platformPlan?.licenseKey ?? faker.lorem.word(),
        ssoEnabled: platformPlan?.ssoEnabled ?? false,
        eventStreamingEnabled: platformPlan?.eventStreamingEnabled ?? false,
        environmentsEnabled: platformPlan?.environmentsEnabled ?? false,
        analyticsEnabled: platformPlan?.analyticsEnabled ?? false,
        auditLogEnabled: platformPlan?.auditLogEnabled ?? false,
        globalConnectionsEnabled: platformPlan?.globalConnectionsEnabled ?? false,
        customRolesEnabled: platformPlan?.customRolesEnabled ?? false,
        manageConnectorsEnabled: platformPlan?.manageConnectorsEnabled ?? false,
        manageTemplatesEnabled: platformPlan?.manageTemplatesEnabled ?? false,
        customAppearanceEnabled: platformPlan?.customAppearanceEnabled ?? false,
        apiKeysEnabled: platformPlan?.apiKeysEnabled ?? false,
        showPoweredBy: platformPlan?.showPoweredBy ?? false,
        embeddingEnabled: platformPlan?.embeddingEnabled ?? false,
        aiProvidersEnabled: platformPlan?.aiProvidersEnabled ?? false,
        chatEnabled: platformPlan?.chatEnabled ?? false,
        agentsEnabled: platformPlan?.agentsEnabled ?? false,
        workerGroupsEnabled: platformPlan?.workerGroupsEnabled ?? false,
        billedTeamWorkspacesLimit: platformPlan?.billedTeamWorkspacesLimit === undefined ? 0 : platformPlan.billedTeamWorkspacesLimit,
        usersLimit: platformPlan?.usersLimit ?? null,
        scheduledUsersLimit: platformPlan?.scheduledUsersLimit ?? null,
        workspaceRolesEnabled: platformPlan?.workspaceRolesEnabled ?? false,
        plan: platformPlan?.plan,
        secretManagersEnabled: platformPlan?.secretManagersEnabled ?? false,
        scimEnabled: platformPlan?.scimEnabled ?? false,
        canary: platformPlan?.canary ?? false,
        customDomainsEnabled: false,
    }
}
export const createMockPlatform = (platform?: Partial<Platform>): Platform => {
    return {
        id: platform?.id ?? apId(),
        created: platform?.created ?? faker.date.recent().toISOString(),
        updated: platform?.updated ?? faker.date.recent().toISOString(),
        ownerId: platform?.ownerId ?? apId(),
        enforceAllowedAuthDomains: platform?.enforceAllowedAuthDomains ?? false,
        federatedAuthProviders: platform?.federatedAuthProviders ?? { saml: null },
        allowedAuthDomains: platform?.allowedAuthDomains ?? [],
        allowedEmbedOrigins: platform?.allowedEmbedOrigins ?? [],
        name: platform?.name ?? faker.lorem.word(),
        primaryColor: platform?.primaryColor ?? faker.color.rgb(),
        themeColors: platform?.themeColors ?? null,
        logoIconUrl: platform?.logoIconUrl ?? faker.image.urlPlaceholder(),
        fullLogoUrl: platform?.fullLogoUrl ?? faker.image.urlPlaceholder(),
        emailAuthEnabled: platform?.emailAuthEnabled ?? faker.datatype.boolean(),
        pinnedConnectors: platform?.pinnedConnectors ?? [],
        favIconUrl: platform?.favIconUrl ?? faker.image.urlPlaceholder(),
        cloudAuthEnabled: platform?.cloudAuthEnabled ?? faker.datatype.boolean(),
        googleAuthEnabled: platform?.googleAuthEnabled ?? true,
        ssoDomain: platform?.ssoDomain ?? null,
        ssoDomainVerification: platform?.ssoDomainVerification ?? null,
    }
}

export const createMockPlatformWithOwner = (
    params?: CreateMockPlatformWithOwnerParams,
): CreateMockPlatformWithOwnerReturn => {
    const mockOwnerId = params?.owner?.id ?? apId()
    const mockPlatformId = params?.platform?.id ?? apId()

    const mockUserIdentity = createMockUserIdentity({})

    const mockOwner = createMockUser({
        identityId: mockUserIdentity.id,
        ...params?.owner,
        id: mockOwnerId,
        platformId: mockPlatformId,
        platformRole: PlatformRole.ADMIN,
    })

    const mockPlatform = createMockPlatform({
        ...params?.platform,
        id: mockPlatformId,
        ownerId: mockOwnerId,
    })

    return {
        mockUserIdentity,
        mockPlatform,
        mockOwner,
    }
}

export const createMockWorkspaceMember = (
    workspaceMember?: Omit<Partial<WorkspaceMember>, 'workspaceRoleId'> & {
        workspaceRoleId: string
    },
): WorkspaceMember => {
    assertNotNullOrUndefined(workspaceMember?.userId, 'userId')
    return {
        id: workspaceMember?.id ?? apId(),
        created: workspaceMember?.created ?? faker.date.recent().toISOString(),
        updated: workspaceMember?.updated ?? faker.date.recent().toISOString(),
        platformId: workspaceMember?.platformId ?? apId(),
        workspaceRoleId: workspaceMember.workspaceRoleId,
        userId: workspaceMember?.userId,
        workspaceId: workspaceMember?.workspaceId ?? apId(),
    }
}

const MOCK_SIGNING_KEY_PUBLIC_KEY = `-----BEGIN RSA PUBLIC KEY-----
MIICCgKCAgEAlnd5vGP/1bzcndN/yRD+ZTd6tuemxaJd+12bOZ2QCXcTM03AKSp3
NE5QMyIi13PXMg+z1uPowfivPJ4iVTMaW1U00O7JlUduGR0VrG0BCJlfEf852V71
TfE+2+EpMme9Yw6Gs/YAuOwgVwu3n/XF0il3FTIm1oY1a/MA79rv0RSscnIgCaYJ
e86LWm+H6753Si0MIId/ajIfYYIndN6qRIlPsgagdL+kljUSPEiIzmV0POxTltBo
tXL1t7Mu+meJrY85MXG5W8BS05+q6dJql7Cl0UbPK152ziakB+biMI/4hYlaOIBT
3KeOcz/Jg7Zv21Y0tbdrZ5osVrrNpFsCV7PGyQIUDVmmnCHrOEBS2XM5zOHzTxMl
JQh3Db318rB5415zuBTzrO+20++03kH4SwZEEBg1SDAInYwLOWldbTuZuD0Hx7P2
g4a3OqHHVOcAgtsHgmU7/zCgCIETg4KbRdpSsqOm/YJDWWoLDTwvKnH5QHSBacq1
kxbNAUSuLQESkfZq1Dw5+tdBDJr29bxjmiSggyittTYn1B3iHACNoe4zj9sMQQIf
j9mmntXsa/leIwBVspiEOHYZwJOe5+goSd8K1VIQJxC1DVBxB2eHxMvuo3eyJ0HE
DlebIeZy4zrE1LPgRic1kfdemyxvuN3iwZnPGiY79nL1ZNDM3M4ApSMCAwEAAQ==
-----END RSA PUBLIC KEY-----`

export const createMockApiKey = (
    apiKey?: Partial<Omit<ApiKey, 'hashedValue' | 'truncatedValue'>>,
): ApiKey & { value: string } => {
    const { secretHashed, secretTruncated, secret } = generateApiKey()
    return {
        id: apiKey?.id ?? apId(),
        created: apiKey?.created ?? faker.date.recent().toISOString(),
        updated: apiKey?.updated ?? faker.date.recent().toISOString(),
        displayName: apiKey?.displayName ?? faker.lorem.word(),
        platformId: apiKey?.platformId ?? apId(),
        hashedValue: secretHashed,
        value: secret,
        truncatedValue: secretTruncated,
    }
}


export const createMockSigningKey = (
    signingKey?: Partial<SigningKey>,
): SigningKey => {
    return {
        id: signingKey?.id ?? apId(),
        created: signingKey?.created ?? faker.date.recent().toISOString(),
        updated: signingKey?.updated ?? faker.date.recent().toISOString(),
        displayName: signingKey?.displayName ?? faker.lorem.word(),
        platformId: signingKey?.platformId ?? apId(),
        publicKey: signingKey?.publicKey ?? MOCK_SIGNING_KEY_PUBLIC_KEY,
        algorithm: signingKey?.algorithm ?? KeyAlgorithm.RSA,
    }
}


export const createMockConnectorMetadata = (
    connectorMetadata?: Partial<Omit<ConnectorMetadataSchema, 'workspace'>>,
): Omit<ConnectorMetadataSchema, 'workspace'> => {
    return {
        id: connectorMetadata?.id ?? apId(),
        workspaceUsage: 0,
        created: connectorMetadata?.created ?? faker.date.recent().toISOString(),
        updated: connectorMetadata?.updated ?? faker.date.recent().toISOString(),
        name: connectorMetadata?.name ?? faker.lorem.word(),
        displayName: connectorMetadata?.displayName ?? faker.lorem.word(),
        logoUrl: connectorMetadata?.logoUrl ?? faker.image.urlPlaceholder(),
        description: connectorMetadata?.description ?? faker.lorem.sentence(),
        directoryPath: connectorMetadata?.directoryPath,
        auth: connectorMetadata?.auth,
        authors: connectorMetadata?.authors ?? [],
        platformId: connectorMetadata?.platformId,
        version: connectorMetadata?.version ?? faker.system.semver(),
        minimumSupportedRelease: connectorMetadata?.minimumSupportedRelease ?? '0.0.0',
        maximumSupportedRelease: connectorMetadata?.maximumSupportedRelease ?? '9.9.9',
        actions: connectorMetadata?.actions ?? {},
        triggers: connectorMetadata?.triggers ?? {},
        connectorType: connectorMetadata?.connectorType ?? faker.helpers.enumValue(ConnectorType),
        packageType:
            connectorMetadata?.packageType ?? faker.helpers.enumValue(PackageType),
        archiveId: connectorMetadata?.archiveId,
        categories: connectorMetadata?.categories ?? [],
        contextInfo: connectorMetadata?.contextInfo ?? { version: LATEST_CONTEXT_VERSION },
    }
}

export const createAuditEvent = (auditEvent: Partial<ApplicationEvent>) => {
    return {
        id: auditEvent.id ?? apId(),
        created: auditEvent.created ?? faker.date.recent().toISOString(),
        updated: auditEvent.updated ?? faker.date.recent().toISOString(),
        ip: auditEvent.ip ?? faker.internet.ip(),
        platformId: auditEvent.platformId,
        userId: auditEvent.userId,
        userEmail: auditEvent.userEmail ?? faker.internet.email(),
        action: auditEvent.action ?? faker.helpers.enumValue(ApplicationEventName),
        data: auditEvent.data ?? {},
    }
}

export const createMockOtp = (otp?: Partial<OtpModel>): OtpModel => {
    const now = dayjs()
    const twentyMinutesAgo = now.subtract(5, 'minutes')

    return {
        id: otp?.id ?? apId(),
        created: otp?.created ?? faker.date.recent().toISOString(),
        updated:
            otp?.updated ??
            faker.date
                .between({ from: twentyMinutesAgo.toDate(), to: now.toDate() })
                .toISOString(),
        type: otp?.type ?? faker.helpers.enumValue(OtpType),
        identityId: otp?.identityId ?? apId(),
        value:
            otp?.value ?? faker.number.int({ min: 100000, max: 999999 }).toString(),
        state: otp?.state ?? faker.helpers.enumValue(OtpState),
        attempts: otp?.attempts ?? 0,
        version: otp?.version ?? 0,
    }
}

export const createMockOtpWithCode = async (otp?: Partial<OtpModel>): Promise<MockOtpWithCode> => {
    const code = otp?.value ?? faker.number.int({ min: 100000, max: 999999 }).toString()
    const value = await encryptUtils.hmacString(code)
    return { otp: createMockOtp({ ...otp, value, version: HASHED_OTP_VERSION }), code }
}

export const createMockExecution = (execution?: Partial<Execution>): Execution => {
    return {
        id: execution?.id ?? apId(),
        created: execution?.created ?? faker.date.recent().toISOString(),
        updated: execution?.updated ?? faker.date.recent().toISOString(),
        workspaceId: execution?.workspaceId ?? apId(),
        flowId: execution?.flowId ?? apId(),
        tags: execution?.tags ?? [],
        steps: {},
        failParentOnFailure: execution?.failParentOnFailure ?? false,
        parentRunId: execution?.parentRunId ?? undefined,
        flowVersionId: execution?.flowVersionId ?? apId(),
        flowVersion: execution?.flowVersion,
        logsFileId: execution?.logsFileId ?? null,
        status: execution?.status ?? faker.helpers.enumValue(ExecutionStatus),
        startTime: execution?.startTime ?? faker.date.recent().toISOString(),
        finishTime: execution?.finishTime ?? faker.date.recent().toISOString(),
        environment:
            execution?.environment ?? faker.helpers.enumValue(RunEnvironment),
    }
}

export const createMockFlow = (flow?: Partial<Flow>): Flow => {
    return {
        id: flow?.id ?? apId(),
        created: flow?.created ?? faker.date.recent().toISOString(),
        updated: flow?.updated ?? faker.date.recent().toISOString(),
        workspaceId: flow?.workspaceId ?? apId(),
        status: flow?.status ?? faker.helpers.enumValue(FlowStatus),
        folderId: flow?.folderId ?? null,
        operationStatus: flow?.operationStatus ?? FlowOperationStatus.NONE,
        publishedVersionId: flow?.publishedVersionId ?? null,
        externalId: flow?.externalId ?? apId(),
    }
}

export const createMockFlowVersion = (
    flowVersion?: Partial<FlowVersion>,
): FlowVersion => {
    const emptyTrigger = {
        type: FlowTriggerType.EMPTY,
        name: 'trigger',
        settings: {},
        valid: false,
        displayName: 'Select Trigger',
        lastUpdatedDate: dayjs().toISOString(),
    } as const

    return {
        id: flowVersion?.id ?? apId(),
        created: flowVersion?.created ?? faker.date.recent().toISOString(),
        updated: flowVersion?.updated ?? faker.date.recent().toISOString(),
        displayName: flowVersion?.displayName ?? faker.word.words(),
        flowId: flowVersion?.flowId ?? apId(),
        agentIds: flowVersion?.agentIds ?? [],
        trigger: flowVersion?.trigger ?? emptyTrigger,
        connectionIds: flowVersion?.connectionIds ?? [],
        state: flowVersion?.state ?? faker.helpers.enumValue(FlowVersionState),
        updatedBy: flowVersion?.updatedBy,
        valid: flowVersion?.valid ?? faker.datatype.boolean(),
        notes: flowVersion?.notes ?? [],
        schemaVersion: flowVersion?.schemaVersion ?? LATEST_FLOW_SCHEMA_VERSION,
        backupFiles: flowVersion?.backupFiles ?? null,
    }
}

export const createMockConnection = (connection: Partial<Connection>, ownerId: string): Connection<ConnectionType.SECRET_TEXT> => {
    return {
        id: connection?.id ?? apId(),
        created: connection?.created ?? faker.date.recent().toISOString(),
        updated: connection?.updated ?? faker.date.recent().toISOString(),
        platformId: connection?.platformId ?? apId(),
        workspaceIds: connection?.workspaceIds ?? [],
        connectorName: connection?.connectorName ?? faker.lorem.word(),
        displayName: connection?.displayName ?? faker.lorem.word(),
        type: ConnectionType.SECRET_TEXT,
        scope: ConnectionScope.WORKSPACE,
        status: ConnectionStatus.ACTIVE,
        ownerId,
        value: {
            type: ConnectionType.SECRET_TEXT,
            secret_text: faker.lorem.word(),
        },
        metadata: connection?.metadata ?? {},
        externalId: connection?.externalId ?? apId(),
        owner: null,
        connectorVersion: connection?.connectorVersion ?? '0.0.0',
        preSelectForNewWorkspaces: connection?.preSelectForNewWorkspaces ?? false,
    }
}

export const createMockTable = ({ workspaceId }: { workspaceId: string }): Table => {
    return {
        id: apId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        workspaceId,
        externalId: apId(),
        name: faker.lorem.word(),
    }
}

export const createMockField = ({ tableId, workspaceId }: { tableId: string, workspaceId: string }): Field => {
    return {
        id: apId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        tableId,
        name: faker.lorem.word(),
        data: {
            options: [],
        },
        externalId: apId(),
        workspaceId,
        position: 0,
        type: FieldType.STATIC_DROPDOWN,
    }
}
export const createMockRecord = ({ tableId, workspaceId }: { tableId: string, workspaceId: string }): Record => {
    return {
        id: apId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        tableId,
        workspaceId,
    }
}

export const createMockCell = ({ recordId, fieldId, workspaceId }: { recordId: string, fieldId: string, workspaceId: string }): Cell => {
    return {
        id: apId(),
        created: faker.date.recent().toISOString(),
        updated: faker.date.recent().toISOString(),
        recordId,
        fieldId,
        workspaceId,
        value: faker.lorem.word(),
    }
}


type Solution = {
    table: Table
    connection: Connection<ConnectionType.SECRET_TEXT>
    flow: Flow
    execution: Execution
    flowVersion: FlowVersion
    cell: Cell
}

export const createMockSolutionAndSave = async ({ workspaceId, platformId, userId }: { workspaceId: string, platformId: string, userId: string }): Promise<Solution> => {
    const table = createMockTable({ workspaceId })
    const field = createMockField({ tableId: table.id, workspaceId })
    const record = createMockRecord({ tableId: table.id, workspaceId })
    const cell = createMockCell({ recordId: record.id, fieldId: field.id, workspaceId })
    const connection = createMockConnection({ workspaceIds: [workspaceId], platformId }, userId)
    const flow = createMockFlow({ workspaceId })
    const flowVersion = createMockFlowVersion({ flowId: flow.id })
    const execution = createMockExecution({ workspaceId, flowId: flow.id, flowVersionId: flowVersion.id })
    await databaseConnection().getRepository('table').save([table])
    await databaseConnection().getRepository('field').save([field])
    await databaseConnection().getRepository('record').save([record])
    await databaseConnection().getRepository('cell').save([cell])
    await databaseConnection().getRepository('connection').save([connection])
    await databaseConnection().getRepository('flow').save([flow])
    await databaseConnection().getRepository('flow_version').save([flowVersion])
    await databaseConnection().getRepository('execution').save([execution])
    return { table, connection, flow, execution, flowVersion, cell }
}

export const checkIfSolutionExistsInDb = async (solution: Solution): Promise<boolean> => {
    const table = await databaseConnection().getRepository('table').findOneBy({ id: solution.table.id })
    const connection = await databaseConnection().getRepository('connection').findOneBy({ id: solution.connection.id })
    const flow = await databaseConnection().getRepository('flow').findOneBy({ id: solution.flow.id })
    const execution = await databaseConnection().getRepository('execution').findOneBy({ id: solution.execution.id })
    const flowVersion = await databaseConnection().getRepository('flow_version').findOneBy({ id: solution.flowVersion.id })
    const cell = await databaseConnection().getRepository('cell').findOneBy({ id: solution.cell.id })
    return table !== null && connection !== null && flow !== null && execution !== null && flowVersion !== null && cell !== null
}
export const mockBasicUser = async ({ userIdentity, user }: { userIdentity?: Partial<UserIdentity>, user?: Partial<User> }) => {
    const mockUserIdentity = createMockUserIdentity({
        verified: true,
        ...userIdentity,
    })
    await databaseConnection().getRepository('user_identity').save(mockUserIdentity)
    const mockUser = createMockUser({
        ...user,
        identityId: mockUserIdentity.id,
    })
    await databaseConnection().getRepository('user').save(mockUser)
    return {
        mockUserIdentity,
        mockUser,
    }
}
export const mockAndSaveBasicSetup = async (params?: MockBasicSetupParams): Promise<MockBasicSetup> => {
    const mockUserIdentity = createMockUserIdentity({
        verified: true,
        ...params?.userIdentity,
    })
    await databaseConnection().getRepository('user_identity').save(mockUserIdentity)

    const mockOwner = createMockUser({
        ...params?.user,
        identityId: mockUserIdentity.id,
        platformRole: PlatformRole.ADMIN,
    })
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockPlatform = createMockPlatform({
        ...params?.platform,
        ownerId: mockOwner.id,
    })

    await databaseConnection().getRepository('platform').save(mockPlatform)
    const hasPlanTable = databaseConnection().hasMetadata(PlatformPlanEntity)
    if (hasPlanTable) {
        const mockPlatformPlan = createMockPlatformPlan({
            platformId: mockPlatform.id,
            auditLogEnabled: true,
            apiKeysEnabled: true,
            customRolesEnabled: true,
            billedTeamWorkspacesLimit: null,
            includedCredits: 1000,
            ...params?.plan,
        })
        await databaseConnection().getRepository('platform_plan').upsert(mockPlatformPlan, ['platformId'])
    }

    mockOwner.platformId = mockPlatform.id
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockWorkspace = createMockWorkspace({
        ...params?.workspace,
        ownerId: mockOwner.id,
        platformId: mockPlatform.id,
    })
    await databaseConnection().getRepository('workspace').save(mockWorkspace)

    return {
        mockUserIdentity,
        mockOwner,
        mockPlatform,
        mockWorkspace,
    }
}

type MockBasicSetupWithApiKey = MockBasicSetup & { mockApiKey: ApiKey & { value: string } }
export const mockAndSaveBasicSetupWithApiKey = async (params?: MockBasicSetupParams): Promise<MockBasicSetupWithApiKey> => {
    const basicSetup = await mockAndSaveBasicSetup(params)

    const mockApiKey = createMockApiKey({
        platformId: basicSetup.mockPlatform.id,
    })
    await databaseConnection().getRepository('api_key').save(mockApiKey)

    return {
        ...basicSetup,
        mockApiKey,
    }
}

export const createMockFile = (file?: Partial<File>): File => {
    const hasExplicitWorkspaceId = file !== undefined && 'workspaceId' in file
    const hasExplicitPlatformId = file !== undefined && 'platformId' in file
    return {
        id: file?.id ?? apId(),
        created: file?.created ?? faker.date.recent().toISOString(),
        updated: file?.updated ?? faker.date.recent().toISOString(),
        platformId: hasExplicitPlatformId ? (file?.platformId ?? null) : apId(),
        workspaceId: hasExplicitWorkspaceId ? (file?.workspaceId ?? null) : apId(),
        location: file?.location ?? FileLocation.DB,
        compression: file?.compression ?? faker.helpers.enumValue(FileCompression),
        data: file?.data ?? Buffer.from(faker.lorem.paragraphs()),
        type: file?.type ?? faker.helpers.enumValue(FileType),
        fileName: file?.fileName ?? null,
        metadata: file?.metadata ?? null,
        s3Key: file?.s3Key ?? null,
        size: file?.size ?? null,
    }
}

export const createMockWorkspaceRole = (workspaceRole?: Partial<WorkspaceRole>): WorkspaceRole => {
    return {
        id: workspaceRole?.id ?? apId(),
        name: workspaceRole?.name ?? faker.lorem.word(),
        created: workspaceRole?.created ?? faker.date.recent().toISOString(),
        updated: workspaceRole?.updated ?? faker.date.recent().toISOString(),
        permissions: workspaceRole?.permissions ?? [],
        platformId: workspaceRole?.platformId ?? apId(),
        type: workspaceRole?.type ?? faker.helpers.enumValue(RoleType),
    }
}

export const createMockWorkspaceRelease = (workspaceRelease?: Partial<WorkspaceRelease>): WorkspaceRelease => {
    return {
        id: workspaceRelease?.id ?? apId(),
        created: workspaceRelease?.created ?? faker.date.recent().toISOString(),
        updated: workspaceRelease?.updated ?? faker.date.recent().toISOString(),
        workspaceId: workspaceRelease?.workspaceId ?? apId(),
        importedBy: workspaceRelease?.importedBy ?? apId(),
        fileId: workspaceRelease?.fileId ?? apId(),
        name: workspaceRelease?.name ?? faker.lorem.word(),
        description: workspaceRelease?.description ?? faker.lorem.sentence(),
        type: workspaceRelease?.type ?? faker.helpers.enumValue(WorkspaceReleaseType),
    }
}

export const createMockAIProvider = async (aiProvider?: Partial<AIProvider> & { enabledForChat?: boolean }): Promise<Omit<AIProviderSchema, 'platform'>> => {
    return {
        id: aiProvider?.id ?? apId(),
        created: aiProvider?.created ?? faker.date.recent().toISOString(),
        updated: aiProvider?.updated ?? faker.date.recent().toISOString(),
        platformId: aiProvider?.platformId ?? apId(),
        provider: aiProvider?.provider ?? faker.helpers.enumValue(AIProviderName),
        displayName: aiProvider?.displayName ?? faker.lorem.word(),
        auth: await encryptUtils.encryptObject({
            apiKey: process.env.OPENAI_API_KEY || faker.string.uuid(),
        }),
        config: aiProvider?.config ?? {},
        enabledForChat: aiProvider?.enabledForChat ?? aiProvider?.provider === AIProviderName.FEMA,
    }

}

export const mockAndSaveAIProvider = async (params?: Partial<AIProvider> & { enabledForChat?: boolean }): Promise<Omit<AIProviderSchema, 'platform'>> => {
    const mockAIProvider = await createMockAIProvider(params)
    await databaseConnection().getRepository('ai_provider').upsert(mockAIProvider, ['platformId', 'provider'])
    return mockAIProvider
}

export const mockConnectorMetadata = async (mockLog: FastifyBaseLogger): Promise<ConnectorMetadata> => {
    const { mockPlatform } = await mockAndSaveBasicSetup()
    const mockConnectorMetadata = createMockConnectorMetadata({
        platformId: mockPlatform.id,
        packageType: PackageType.REGISTRY,
    })
    await databaseConnection().getRepository('connector_metadata').save([mockConnectorMetadata])
    connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnectorMetadata)
    return mockConnectorMetadata
}

export const createMockFolder = (folder?: Partial<Folder>): Folder => {
    return {
        id: folder?.id ?? apId(),
        created: folder?.created ?? faker.date.recent().toISOString(),
        updated: folder?.updated ?? faker.date.recent().toISOString(),
        workspaceId: folder?.workspaceId ?? apId(),
        displayName: folder?.displayName ?? faker.lorem.word(),
        displayOrder: folder?.displayOrder ?? faker.number.int({ min: 0, max: 100 }),
    }
}

export const createMockEventDestination = (eventDestination?: Partial<{
    id: string
    created: string
    updated: string
    platformId: string
    workspaceId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
}>): {
    id: string
    created: string
    updated: string
    platformId: string
    workspaceId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
} => {
    return {
        id: eventDestination?.id ?? apId(),
        created: eventDestination?.created ?? faker.date.recent().toISOString(),
        updated: eventDestination?.updated ?? faker.date.recent().toISOString(),
        platformId: eventDestination?.platformId ?? apId(),
        workspaceId: eventDestination?.workspaceId ?? null,
        events: eventDestination?.events ?? [faker.helpers.enumValue(ApplicationEventName)],
        url: eventDestination?.url ?? faker.internet.url(),
        scope: eventDestination?.scope ?? EventDestinationScope.PLATFORM,
    }
}

type CreateMockPlatformWithOwnerParams = {
    platform?: Partial<Omit<Platform, 'ownerId'>>
    owner?: Partial<Omit<User, 'platformId'>>
}

type CreateMockPlatformWithOwnerReturn = {
    mockPlatform: Platform
    mockOwner: User
    mockUserIdentity: UserIdentity
}


type MockBasicSetup = {
    mockOwner: User
    mockPlatform: Platform
    mockWorkspace: Workspace
    mockUserIdentity: UserIdentity
}

type MockBasicSetupParams = {
    userIdentity?: Partial<UserIdentity>
    user?: Partial<User>
    plan?: Partial<PlatformPlan>
    platform?: Partial<Platform>
    workspace?: Partial<Workspace>
}

type MockOtpWithCode = {
    otp: OtpModel
    code: string
}

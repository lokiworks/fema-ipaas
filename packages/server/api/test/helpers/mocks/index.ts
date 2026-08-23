import { AIProviderName, apId, assertNotNullOrUndefined, WorkspaceRole, RoleType } from '@fema/core-utils'
import { LATEST_CONTEXT_VERSION, ConnectorMetadata } from '@fema/connector-sdk'
import { AIProvider, Connection, ConnectionScope, ConnectionStatus, ConnectionType, ApplicationEvent, ApplicationEventName, ColorName, File, FileCompression, FileLocation, FileType, Workflow, WorkflowOperationStatus, Execution, ExecutionStatus, WorkflowStatus, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, Folder, InvitationStatus, InvitationType, LATEST_WORKFLOW_SCHEMA_VERSION, OtpModel, OtpState, OtpType, PackageType, ConnectorsFilterType, ConnectorType, Tenant, TenantPlan, TenantRole, Workspace, WorkspaceIcon, WorkspaceType, RunEnvironment, Template, TemplateStatus, TemplateType, User, UserIdentity, UserIdentityProvider, UserInvitation, UserStatus } from '@fema/shared'
import { faker } from '@faker-js/faker'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { AIProviderSchema } from '../../../src/app/ai/ai-provider-entity'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { generateApiKey } from '../../../src/app/ee/api-keys/api-key-service'
import { OAuthAppWithEncryptedSecret } from '../../../src/app/ee/oauth-apps/oauth-app.entity'
import { TenantPlanEntity } from '../../../src/app/ee/tenant/tenant-plan/tenant-plan.entity'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { ConnectorMetadataSchema } from '../../../src/app/connectors/metadata/connector-metadata-entity'
import { connectorMetadataService } from '../../../src/app/connectors/metadata/connector-metadata-service'

export const CLOUD_TENANT_ID = 'cloud-id'

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
        tenantRole: user?.tenantRole ?? faker.helpers.enumValue(TenantRole),
        externalId: user?.externalId,
        identityId: user?.identityId ?? apId(),
        tenantId: user?.tenantId ?? null,
    }
}

export const createMockOAuthApp = async (
    oAuthApp?: Partial<OAuthApp>,
): Promise<OAuthAppWithEncryptedSecret> => {
    return {
        id: oAuthApp?.id ?? apId(),
        created: oAuthApp?.created ?? faker.date.recent().toISOString(),
        updated: oAuthApp?.updated ?? faker.date.recent().toISOString(),
        tenantId: oAuthApp?.tenantId ?? apId(),
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
        workflows: template?.workflows ?? [createMockWorkflowVersion()],
        tenantId: template?.tenantId ?? apId(),
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
        activeWorkflowsLimit: plan?.activeWorkflowsLimit ?? null,
    }
}

export const createMockUserInvitation = (userInvitation: Partial<UserInvitation>): UserInvitation => {
    return {
        id: userInvitation.id ?? apId(),
        created: userInvitation.created ?? faker.date.recent().toISOString(),
        updated: userInvitation.updated ?? faker.date.recent().toISOString(),
        email: userInvitation.email ?? faker.internet.email(),
        type: userInvitation.type ?? faker.helpers.enumValue(InvitationType),
        tenantId: userInvitation.tenantId ?? apId(),
        workspaceId: userInvitation.workspaceId,
        workspaceRole: userInvitation.workspaceRole,
        tenantRole: userInvitation.tenantRole,
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
        tenantId: workspace?.tenantId ?? apId(),
        externalId: workspace?.externalId ?? apId(),
        releasesEnabled: workspace?.releasesEnabled ?? false,
        notifyWorkflowOwnerOnFailure: workspace?.notifyWorkflowOwnerOnFailure ?? false,
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

export const createMockTenantPlan = (tenantPlan?: Partial<TenantPlan>): TenantPlan => {
    return {
        id: tenantPlan?.id ?? apId(),
        created: tenantPlan?.created ?? faker.date.recent().toISOString(),
        updated: tenantPlan?.updated ?? faker.date.recent().toISOString(),
        tenantId: tenantPlan?.tenantId ?? apId(),
        tablesEnabled: tenantPlan?.tablesEnabled ?? false,
        includedCredits: tenantPlan?.includedCredits ?? 0,
        licenseKey: tenantPlan?.licenseKey ?? faker.lorem.word(),
        ssoEnabled: tenantPlan?.ssoEnabled ?? false,
        eventStreamingEnabled: tenantPlan?.eventStreamingEnabled ?? false,
        environmentsEnabled: tenantPlan?.environmentsEnabled ?? false,
        analyticsEnabled: tenantPlan?.analyticsEnabled ?? false,
        auditLogEnabled: tenantPlan?.auditLogEnabled ?? false,
        globalConnectionsEnabled: tenantPlan?.globalConnectionsEnabled ?? false,
        customRolesEnabled: tenantPlan?.customRolesEnabled ?? false,
        manageConnectorsEnabled: tenantPlan?.manageConnectorsEnabled ?? false,
        manageTemplatesEnabled: tenantPlan?.manageTemplatesEnabled ?? false,
        customAppearanceEnabled: tenantPlan?.customAppearanceEnabled ?? false,
        apiKeysEnabled: tenantPlan?.apiKeysEnabled ?? false,
        showPoweredBy: tenantPlan?.showPoweredBy ?? false,
        embeddingEnabled: tenantPlan?.embeddingEnabled ?? false,
        aiProvidersEnabled: tenantPlan?.aiProvidersEnabled ?? false,
        chatEnabled: tenantPlan?.chatEnabled ?? false,
        agentsEnabled: tenantPlan?.agentsEnabled ?? false,
        workerGroupsEnabled: tenantPlan?.workerGroupsEnabled ?? false,
        billedTeamWorkspacesLimit: tenantPlan?.billedTeamWorkspacesLimit === undefined ? 0 : tenantPlan.billedTeamWorkspacesLimit,
        usersLimit: tenantPlan?.usersLimit ?? null,
        scheduledUsersLimit: tenantPlan?.scheduledUsersLimit ?? null,
        workspaceRolesEnabled: tenantPlan?.workspaceRolesEnabled ?? false,
        plan: tenantPlan?.plan,
        secretManagersEnabled: tenantPlan?.secretManagersEnabled ?? false,
        scimEnabled: tenantPlan?.scimEnabled ?? false,
        canary: tenantPlan?.canary ?? false,
        customDomainsEnabled: false,
    }
}
export const createMockTenant = (tenant?: Partial<Tenant>): Tenant => {
    return {
        id: tenant?.id ?? apId(),
        created: tenant?.created ?? faker.date.recent().toISOString(),
        updated: tenant?.updated ?? faker.date.recent().toISOString(),
        ownerId: tenant?.ownerId ?? apId(),
        enforceAllowedAuthDomains: tenant?.enforceAllowedAuthDomains ?? false,
        federatedAuthProviders: tenant?.federatedAuthProviders ?? { saml: null },
        allowedAuthDomains: tenant?.allowedAuthDomains ?? [],
        allowedEmbedOrigins: tenant?.allowedEmbedOrigins ?? [],
        name: tenant?.name ?? faker.lorem.word(),
        primaryColor: tenant?.primaryColor ?? faker.color.rgb(),
        themeColors: tenant?.themeColors ?? null,
        logoIconUrl: tenant?.logoIconUrl ?? faker.image.urlPlaceholder(),
        fullLogoUrl: tenant?.fullLogoUrl ?? faker.image.urlPlaceholder(),
        emailAuthEnabled: tenant?.emailAuthEnabled ?? faker.datatype.boolean(),
        pinnedConnectors: tenant?.pinnedConnectors ?? [],
        favIconUrl: tenant?.favIconUrl ?? faker.image.urlPlaceholder(),
        cloudAuthEnabled: tenant?.cloudAuthEnabled ?? faker.datatype.boolean(),
        googleAuthEnabled: tenant?.googleAuthEnabled ?? true,
        ssoDomain: tenant?.ssoDomain ?? null,
        ssoDomainVerification: tenant?.ssoDomainVerification ?? null,
    }
}

export const createMockTenantWithOwner = (
    params?: CreateMockTenantWithOwnerParams,
): CreateMockTenantWithOwnerReturn => {
    const mockOwnerId = params?.owner?.id ?? apId()
    const mockTenantId = params?.tenant?.id ?? apId()

    const mockUserIdentity = createMockUserIdentity({})

    const mockOwner = createMockUser({
        identityId: mockUserIdentity.id,
        ...params?.owner,
        id: mockOwnerId,
        tenantId: mockTenantId,
        tenantRole: TenantRole.ADMIN,
    })

    const mockTenant = createMockTenant({
        ...params?.tenant,
        id: mockTenantId,
        ownerId: mockOwnerId,
    })

    return {
        mockUserIdentity,
        mockTenant,
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
        tenantId: workspaceMember?.tenantId ?? apId(),
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
        tenantId: apiKey?.tenantId ?? apId(),
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
        tenantId: signingKey?.tenantId ?? apId(),
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
        tenantId: connectorMetadata?.tenantId,
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
        tenantId: auditEvent.tenantId,
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
        workflowId: execution?.workflowId ?? apId(),
        tags: execution?.tags ?? [],
        steps: {},
        failParentOnFailure: execution?.failParentOnFailure ?? false,
        parentRunId: execution?.parentRunId ?? undefined,
        workflowVersionId: execution?.workflowVersionId ?? apId(),
        workflowVersion: execution?.workflowVersion,
        logsFileId: execution?.logsFileId ?? null,
        status: execution?.status ?? faker.helpers.enumValue(ExecutionStatus),
        startTime: execution?.startTime ?? faker.date.recent().toISOString(),
        finishTime: execution?.finishTime ?? faker.date.recent().toISOString(),
        environment:
            execution?.environment ?? faker.helpers.enumValue(RunEnvironment),
    }
}

export const createMockWorkflow = (workflow?: Partial<Workflow>): Workflow => {
    return {
        id: workflow?.id ?? apId(),
        created: workflow?.created ?? faker.date.recent().toISOString(),
        updated: workflow?.updated ?? faker.date.recent().toISOString(),
        workspaceId: workflow?.workspaceId ?? apId(),
        status: workflow?.status ?? faker.helpers.enumValue(WorkflowStatus),
        folderId: workflow?.folderId ?? null,
        operationStatus: workflow?.operationStatus ?? WorkflowOperationStatus.NONE,
        publishedVersionId: workflow?.publishedVersionId ?? null,
        externalId: workflow?.externalId ?? apId(),
    }
}

export const createMockWorkflowVersion = (
    workflowVersion?: Partial<WorkflowVersion>,
): WorkflowVersion => {
    const emptyTrigger = {
        type: WorkflowTriggerType.EMPTY,
        name: 'trigger',
        settings: {},
        valid: false,
        displayName: 'Select Trigger',
        lastUpdatedDate: dayjs().toISOString(),
    } as const

    return {
        id: workflowVersion?.id ?? apId(),
        created: workflowVersion?.created ?? faker.date.recent().toISOString(),
        updated: workflowVersion?.updated ?? faker.date.recent().toISOString(),
        displayName: workflowVersion?.displayName ?? faker.word.words(),
        workflowId: workflowVersion?.workflowId ?? apId(),
        agentIds: workflowVersion?.agentIds ?? [],
        trigger: workflowVersion?.trigger ?? emptyTrigger,
        connectionIds: workflowVersion?.connectionIds ?? [],
        state: workflowVersion?.state ?? faker.helpers.enumValue(WorkflowVersionState),
        updatedBy: workflowVersion?.updatedBy,
        valid: workflowVersion?.valid ?? faker.datatype.boolean(),
        notes: workflowVersion?.notes ?? [],
        schemaVersion: workflowVersion?.schemaVersion ?? LATEST_WORKFLOW_SCHEMA_VERSION,
        backupFiles: workflowVersion?.backupFiles ?? null,
    }
}

export const createMockConnection = (connection: Partial<Connection>, ownerId: string): Connection<ConnectionType.SECRET_TEXT> => {
    return {
        id: connection?.id ?? apId(),
        created: connection?.created ?? faker.date.recent().toISOString(),
        updated: connection?.updated ?? faker.date.recent().toISOString(),
        tenantId: connection?.tenantId ?? apId(),
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
    workflow: Workflow
    execution: Execution
    workflowVersion: WorkflowVersion
    cell: Cell
}

export const createMockSolutionAndSave = async ({ workspaceId, tenantId, userId }: { workspaceId: string, tenantId: string, userId: string }): Promise<Solution> => {
    const table = createMockTable({ workspaceId })
    const field = createMockField({ tableId: table.id, workspaceId })
    const record = createMockRecord({ tableId: table.id, workspaceId })
    const cell = createMockCell({ recordId: record.id, fieldId: field.id, workspaceId })
    const connection = createMockConnection({ workspaceIds: [workspaceId], tenantId }, userId)
    const workflow = createMockWorkflow({ workspaceId })
    const workflowVersion = createMockWorkflowVersion({ workflowId: workflow.id })
    const execution = createMockExecution({ workspaceId, workflowId: workflow.id, workflowVersionId: workflowVersion.id })
    await databaseConnection().getRepository('table').save([table])
    await databaseConnection().getRepository('field').save([field])
    await databaseConnection().getRepository('record').save([record])
    await databaseConnection().getRepository('cell').save([cell])
    await databaseConnection().getRepository('connection').save([connection])
    await databaseConnection().getRepository('workflow').save([workflow])
    await databaseConnection().getRepository('workflow_version').save([workflowVersion])
    await databaseConnection().getRepository('execution').save([execution])
    return { table, connection, workflow, execution, workflowVersion, cell }
}

export const checkIfSolutionExistsInDb = async (solution: Solution): Promise<boolean> => {
    const table = await databaseConnection().getRepository('table').findOneBy({ id: solution.table.id })
    const connection = await databaseConnection().getRepository('connection').findOneBy({ id: solution.connection.id })
    const workflow = await databaseConnection().getRepository('workflow').findOneBy({ id: solution.workflow.id })
    const execution = await databaseConnection().getRepository('execution').findOneBy({ id: solution.execution.id })
    const workflowVersion = await databaseConnection().getRepository('workflow_version').findOneBy({ id: solution.workflowVersion.id })
    const cell = await databaseConnection().getRepository('cell').findOneBy({ id: solution.cell.id })
    return table !== null && connection !== null && workflow !== null && execution !== null && workflowVersion !== null && cell !== null
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
        tenantRole: TenantRole.ADMIN,
    })
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockTenant = createMockTenant({
        ...params?.tenant,
        ownerId: mockOwner.id,
    })

    await databaseConnection().getRepository('tenant').save(mockTenant)
    const hasPlanTable = databaseConnection().hasMetadata(TenantPlanEntity)
    if (hasPlanTable) {
        const mockTenantPlan = createMockTenantPlan({
            tenantId: mockTenant.id,
            auditLogEnabled: true,
            apiKeysEnabled: true,
            customRolesEnabled: true,
            billedTeamWorkspacesLimit: null,
            includedCredits: 1000,
            ...params?.plan,
        })
        await databaseConnection().getRepository('tenant_plan').upsert(mockTenantPlan, ['tenantId'])
    }

    mockOwner.tenantId = mockTenant.id
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockWorkspace = createMockWorkspace({
        ...params?.workspace,
        ownerId: mockOwner.id,
        tenantId: mockTenant.id,
    })
    await databaseConnection().getRepository('workspace').save(mockWorkspace)

    return {
        mockUserIdentity,
        mockOwner,
        mockTenant,
        mockWorkspace,
    }
}

type MockBasicSetupWithApiKey = MockBasicSetup & { mockApiKey: ApiKey & { value: string } }
export const mockAndSaveBasicSetupWithApiKey = async (params?: MockBasicSetupParams): Promise<MockBasicSetupWithApiKey> => {
    const basicSetup = await mockAndSaveBasicSetup(params)

    const mockApiKey = createMockApiKey({
        tenantId: basicSetup.mockTenant.id,
    })
    await databaseConnection().getRepository('api_key').save(mockApiKey)

    return {
        ...basicSetup,
        mockApiKey,
    }
}

export const createMockFile = (file?: Partial<File>): File => {
    const hasExplicitWorkspaceId = file !== undefined && 'workspaceId' in file
    const hasExplicitTenantId = file !== undefined && 'tenantId' in file
    return {
        id: file?.id ?? apId(),
        created: file?.created ?? faker.date.recent().toISOString(),
        updated: file?.updated ?? faker.date.recent().toISOString(),
        tenantId: hasExplicitTenantId ? (file?.tenantId ?? null) : apId(),
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
        tenantId: workspaceRole?.tenantId ?? apId(),
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

export const createMockAIProvider = async (aiProvider?: Partial<AIProvider> & { enabledForChat?: boolean }): Promise<Omit<AIProviderSchema, 'tenant'>> => {
    return {
        id: aiProvider?.id ?? apId(),
        created: aiProvider?.created ?? faker.date.recent().toISOString(),
        updated: aiProvider?.updated ?? faker.date.recent().toISOString(),
        tenantId: aiProvider?.tenantId ?? apId(),
        provider: aiProvider?.provider ?? faker.helpers.enumValue(AIProviderName),
        displayName: aiProvider?.displayName ?? faker.lorem.word(),
        auth: await encryptUtils.encryptObject({
            apiKey: process.env.OPENAI_API_KEY || faker.string.uuid(),
        }),
        config: aiProvider?.config ?? {},
        enabledForChat: aiProvider?.enabledForChat ?? aiProvider?.provider === AIProviderName.FEMA,
    }

}

export const mockAndSaveAIProvider = async (params?: Partial<AIProvider> & { enabledForChat?: boolean }): Promise<Omit<AIProviderSchema, 'tenant'>> => {
    const mockAIProvider = await createMockAIProvider(params)
    await databaseConnection().getRepository('ai_provider').upsert(mockAIProvider, ['tenantId', 'provider'])
    return mockAIProvider
}

export const mockConnectorMetadata = async (mockLog: FastifyBaseLogger): Promise<ConnectorMetadata> => {
    const { mockTenant } = await mockAndSaveBasicSetup()
    const mockConnectorMetadata = createMockConnectorMetadata({
        tenantId: mockTenant.id,
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
    tenantId: string
    workspaceId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
}>): {
    id: string
    created: string
    updated: string
    tenantId: string
    workspaceId: string | null
    events: ApplicationEventName[]
    url: string
    scope: EventDestinationScope
} => {
    return {
        id: eventDestination?.id ?? apId(),
        created: eventDestination?.created ?? faker.date.recent().toISOString(),
        updated: eventDestination?.updated ?? faker.date.recent().toISOString(),
        tenantId: eventDestination?.tenantId ?? apId(),
        workspaceId: eventDestination?.workspaceId ?? null,
        events: eventDestination?.events ?? [faker.helpers.enumValue(ApplicationEventName)],
        url: eventDestination?.url ?? faker.internet.url(),
        scope: eventDestination?.scope ?? EventDestinationScope.TENANT,
    }
}

type CreateMockTenantWithOwnerParams = {
    tenant?: Partial<Omit<Tenant, 'ownerId'>>
    owner?: Partial<Omit<User, 'tenantId'>>
}

type CreateMockTenantWithOwnerReturn = {
    mockTenant: Tenant
    mockOwner: User
    mockUserIdentity: UserIdentity
}


type MockBasicSetup = {
    mockOwner: User
    mockTenant: Tenant
    mockWorkspace: Workspace
    mockUserIdentity: UserIdentity
}

type MockBasicSetupParams = {
    userIdentity?: Partial<UserIdentity>
    user?: Partial<User>
    plan?: Partial<TenantPlan>
    tenant?: Partial<Tenant>
    workspace?: Partial<Workspace>
}

type MockOtpWithCode = {
    otp: OtpModel
    code: string
}

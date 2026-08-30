import { generateId, assertNotNullOrUndefined } from '@fema-ipaas/core-utils'
import { LATEST_CONTEXT_VERSION, ConnectorMetadata } from '@fema-ipaas/connector-sdk'
import { Connection, ConnectionScope, ConnectionStatus, ConnectionType, ApplicationEvent, ApplicationEventName, ColorName, File, FileCompression, FileLocation, FileType, Workflow, WorkflowOperationStatus, Execution, ExecutionStatus, WorkflowStatus, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, Folder, InvitationStatus, InvitationType, LATEST_WORKFLOW_SCHEMA_VERSION, OtpModel, OtpState, OtpType, PackageType, ConnectorsFilterType, ConnectorSource, ConnectorType, DefaultProjectRole, ProjectMember, Tenant, TenantRole, Project, ProjectIcon, ProjectType, RunEnvironment, Template, TemplateStatus, TemplateType, User, UserIdentity, UserIdentityProvider, UserInvitation, UserStatus } from '@fema-ipaas/shared'
import { faker } from '@faker-js/faker'
import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { encryptUtils } from '../../../src/app/helper/encryption'
import { ConnectorMetadataSchema } from '../../../src/app/connectors/metadata/connector-metadata-entity'
import { connectorMetadataService } from '../../../src/app/connectors/metadata/connector-metadata-service'

export const CLOUD_TENANT_ID = 'cloud-id'

const HASHED_OTP_VERSION = 1

export const createMockUserIdentity = (userIdentity?: Partial<UserIdentity>): UserIdentity => {
    return {
        id: userIdentity?.id ?? generateId(),
        created: userIdentity?.created ?? faker.date.recent().toISOString(),
        updated: userIdentity?.updated ?? faker.date.recent().toISOString(),
        email: (userIdentity?.email ?? `${generateId()}@example.com`).toLowerCase().trim(),
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
        id: user?.id ?? generateId(),
        created: user?.created ?? faker.date.recent().toISOString(),
        updated: user?.updated ?? faker.date.recent().toISOString(),
        status: user?.status ?? UserStatus.ACTIVE,
        tenantRole: user?.tenantRole ?? faker.helpers.enumValue(TenantRole),
        externalId: user?.externalId,
        identityId: user?.identityId ?? generateId(),
        tenantId: user?.tenantId ?? null,
    }
}

export const createMockTemplate = (
    template?: Partial<Template>,
): Template => {
    return {
        id: template?.id ?? generateId(),
        created: template?.created ?? faker.date.recent().toISOString(),
        updated: template?.updated ?? faker.date.recent().toISOString(),
        connectors: template?.connectors ?? [],
        workflows: template?.workflows ?? [createMockWorkflowVersion()],
        tenantId: template?.tenantId ?? generateId(),
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

export const createMockUserInvitation = (userInvitation: Partial<UserInvitation>): UserInvitation => {
    return {
        id: userInvitation.id ?? generateId(),
        created: userInvitation.created ?? faker.date.recent().toISOString(),
        updated: userInvitation.updated ?? faker.date.recent().toISOString(),
        email: userInvitation.email ?? faker.internet.email(),
        type: userInvitation.type ?? faker.helpers.enumValue(InvitationType),
        tenantId: userInvitation.tenantId ?? generateId(),
        projectId: userInvitation.projectId,
        projectRole: userInvitation.projectRole,
        tenantRole: userInvitation.tenantRole,
        status: userInvitation.status ?? faker.helpers.enumValue(InvitationStatus),
    }
}

export const createMockProject = (project?: Partial<Project>): Project => {
    const icon: ProjectIcon = {
        color: faker.helpers.enumValue(ColorName),
    }
    return {
        id: project?.id ?? generateId(),
        created: project?.created ?? faker.date.recent().toISOString(),
        updated: project?.updated ?? faker.date.recent().toISOString(),
        deleted: project?.deleted ?? null,
        ownerId: project?.ownerId ?? generateId(),
        displayName: project?.displayName ?? faker.lorem.word(),
        tenantId: project?.tenantId ?? generateId(),
        externalId: project?.externalId ?? generateId(),
        releasesEnabled: project?.releasesEnabled ?? false,
        notifyWorkflowOwnerOnFailure: project?.notifyWorkflowOwnerOnFailure ?? false,
        metadata: project?.metadata ?? null,
        type: project?.type ?? ProjectType.TEAM,
        workerGroupId: project?.workerGroupId ?? null,
        executionDataRetentionDays: project?.executionDataRetentionDays ?? null,
        icon,
    }
}

export const createMockTenant = (tenant?: Partial<Tenant>): Tenant => {
    return {
        id: tenant?.id ?? generateId(),
        created: tenant?.created ?? faker.date.recent().toISOString(),
        updated: tenant?.updated ?? faker.date.recent().toISOString(),
        ownerId: tenant?.ownerId ?? generateId(),
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
    const mockOwnerId = params?.owner?.id ?? generateId()
    const mockTenantId = params?.tenant?.id ?? generateId()

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

export const createMockProjectMember = (
    projectMember?: Partial<ProjectMember>,
): ProjectMember => {
    assertNotNullOrUndefined(projectMember?.userId, 'userId')
    return {
        id: projectMember?.id ?? generateId(),
        created: projectMember?.created ?? faker.date.recent().toISOString(),
        updated: projectMember?.updated ?? faker.date.recent().toISOString(),
        role: projectMember?.role ?? DefaultProjectRole.ADMIN,
        userId: projectMember.userId,
        projectId: projectMember?.projectId ?? generateId(),
    }
}

export const createMockConnectorMetadata = (
    connectorMetadata?: Partial<Omit<ConnectorMetadataSchema, 'project'>>,
): Omit<ConnectorMetadataSchema, 'project'> => {
    return {
        id: connectorMetadata?.id ?? generateId(),
        projectUsage: 0,
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
        source: connectorMetadata?.source ?? ConnectorSource.OFFICIAL,
        archiveId: connectorMetadata?.archiveId,
        categories: connectorMetadata?.categories ?? [],
        contextInfo: connectorMetadata?.contextInfo ?? { version: LATEST_CONTEXT_VERSION },
    }
}

export const createAuditEvent = (auditEvent: Partial<ApplicationEvent>) => {
    return {
        id: auditEvent.id ?? generateId(),
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
        id: otp?.id ?? generateId(),
        created: otp?.created ?? faker.date.recent().toISOString(),
        updated:
            otp?.updated ??
            faker.date
                .between({ from: twentyMinutesAgo.toDate(), to: now.toDate() })
                .toISOString(),
        type: otp?.type ?? faker.helpers.enumValue(OtpType),
        identityId: otp?.identityId ?? generateId(),
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
        id: execution?.id ?? generateId(),
        created: execution?.created ?? faker.date.recent().toISOString(),
        updated: execution?.updated ?? faker.date.recent().toISOString(),
        projectId: execution?.projectId ?? generateId(),
        workflowId: execution?.workflowId ?? generateId(),
        tags: execution?.tags ?? [],
        steps: {},
        failParentOnFailure: execution?.failParentOnFailure ?? false,
        parentRunId: execution?.parentRunId ?? undefined,
        workflowVersionId: execution?.workflowVersionId ?? generateId(),
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
        id: workflow?.id ?? generateId(),
        created: workflow?.created ?? faker.date.recent().toISOString(),
        updated: workflow?.updated ?? faker.date.recent().toISOString(),
        projectId: workflow?.projectId ?? generateId(),
        status: workflow?.status ?? faker.helpers.enumValue(WorkflowStatus),
        folderId: workflow?.folderId ?? null,
        operationStatus: workflow?.operationStatus ?? WorkflowOperationStatus.NONE,
        publishedVersionId: workflow?.publishedVersionId ?? null,
        externalId: workflow?.externalId ?? generateId(),
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
        id: workflowVersion?.id ?? generateId(),
        created: workflowVersion?.created ?? faker.date.recent().toISOString(),
        updated: workflowVersion?.updated ?? faker.date.recent().toISOString(),
        displayName: workflowVersion?.displayName ?? faker.word.words(),
        workflowId: workflowVersion?.workflowId ?? generateId(),
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
        id: connection?.id ?? generateId(),
        created: connection?.created ?? faker.date.recent().toISOString(),
        updated: connection?.updated ?? faker.date.recent().toISOString(),
        tenantId: connection?.tenantId ?? generateId(),
        projectIds: connection?.projectIds ?? [],
        connectorName: connection?.connectorName ?? faker.lorem.word(),
        displayName: connection?.displayName ?? faker.lorem.word(),
        type: ConnectionType.SECRET_TEXT,
        scope: ConnectionScope.PROJECT,
        status: ConnectionStatus.ACTIVE,
        ownerId,
        value: {
            type: ConnectionType.SECRET_TEXT,
            secret_text: faker.lorem.word(),
        },
        metadata: connection?.metadata ?? {},
        externalId: connection?.externalId ?? generateId(),
        owner: null,
        connectorVersion: connection?.connectorVersion ?? '0.0.0',
        preSelectForNewProjects: connection?.preSelectForNewProjects ?? false,
    }
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

    mockOwner.tenantId = mockTenant.id
    await databaseConnection().getRepository('user').save(mockOwner)

    const mockProject = createMockProject({
        ...params?.project,
        ownerId: mockOwner.id,
        tenantId: mockTenant.id,
    })
    await databaseConnection().getRepository('project').save(mockProject)

    return {
        mockUserIdentity,
        mockOwner,
        mockTenant,
        mockProject,
    }
}

export const createMockFile = (file?: Partial<File>): File => {
    const hasExplicitProjectId = file !== undefined && 'projectId' in file
    const hasExplicitTenantId = file !== undefined && 'tenantId' in file
    return {
        id: file?.id ?? generateId(),
        created: file?.created ?? faker.date.recent().toISOString(),
        updated: file?.updated ?? faker.date.recent().toISOString(),
        tenantId: hasExplicitTenantId ? (file?.tenantId ?? null) : generateId(),
        projectId: hasExplicitProjectId ? (file?.projectId ?? null) : generateId(),
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
        id: folder?.id ?? generateId(),
        created: folder?.created ?? faker.date.recent().toISOString(),
        updated: folder?.updated ?? faker.date.recent().toISOString(),
        projectId: folder?.projectId ?? generateId(),
        displayName: folder?.displayName ?? faker.lorem.word(),
        displayOrder: folder?.displayOrder ?? faker.number.int({ min: 0, max: 100 }),
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
    mockProject: Project
    mockUserIdentity: UserIdentity
}

type MockBasicSetupParams = {
    userIdentity?: Partial<UserIdentity>
    user?: Partial<User>
    tenant?: Partial<Tenant>
    project?: Partial<Project>
}

type MockOtpWithCode = {
    otp: OtpModel
    code: string
}

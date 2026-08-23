import { ApId, BaseModelSchema, DateOrString, Nullable } from '@fema/core-utils'
import { z } from 'zod'
import { FederatedAuthnProviderConfig, FederatedAuthnProviderConfigWithoutSensitiveData } from '../../core/federated-authn'
import { SsoDomainVerification } from './sso-domain-verification'

export const TenantUsage = z.object({
    creditsUsed: z.number(),
    creditsRemaining: Nullable(z.number()),
    creditsNextResetAt: Nullable(z.string()),
    appSumoAiCreditsUsed: Nullable(z.number()),
    appSumoAiCreditsRemaining: Nullable(z.number()),
    activeWorkflows: z.number(),
    teamWorkspaces: z.number(),
    users: z.number(),
    activeUsers: z.number(),
    invitedSeats: z.number(),
})

export type TenantUsage = z.infer<typeof TenantUsage>

export enum PlanName {
    FREE = 'free',
    PLUS = 'plus',
    PLUS_ANNUAL = 'plus_annual',
    PLUS_CHAT = 'plus_chat',
    TEAM = 'team',
    TEAM_ANNUAL = 'team_annual',
    ENTERPRISE = 'enterprise',
    APPSUMO = 'appsumo',
    FREE_LEGACY = 'free_legacy',
}

export enum AiCreditsAutoTopUpState {
    ENABLED = 'enabled',
    DISABLED = 'disabled',
}

export enum ConsumableFeatureId {
    FEMA_CREDITS = 'apCredits',
    APP_SUMO_AI_CREDITS = 'appSumoAiCredits',
}

export enum UnconsumableFeatureId {
    TEAM_WORKSPACES_LIMIT = 'teamWorkspacesLimit',
    USERS_LIMIT = 'usersLimit',
    ACTIVE_WORKFLOWS_LIMIT = 'activeWorkflowsLimit',
}

export enum FeatureFlagId {
    BILLING_ENFORCED = 'billingEnforced',
    TABLES_ENABLED = 'tablesEnabled',
    EVENT_STREAMING_ENABLED = 'eventStreamingEnabled',
    ENVIRONMENTS_ENABLED = 'environmentsEnabled',
    ANALYTICS_ENABLED = 'analyticsEnabled',
    SHOW_POWERED_BY = 'showPoweredBy',
    AUDIT_LOG_ENABLED = 'auditLogEnabled',
    EMBEDDING_ENABLED = 'embeddingEnabled',
    AI_PROVIDERS_ENABLED = 'aiProvidersEnabled',
    CHAT_ENABLED = 'chatEnabled',
    AGENTS_ENABLED = 'agentsEnabled',
    WORKER_GROUPS_ENABLED = 'workerGroupsEnabled',
    MANAGE_CONNECTORS_ENABLED = 'manageConnectorsEnabled',
    MANAGE_TEMPLATES_ENABLED = 'manageTemplatesEnabled',
    CUSTOM_APPEARANCE_ENABLED = 'customAppearanceEnabled',
    WORKSPACE_ROLES_ENABLED = 'workspaceRolesEnabled',
    GLOBAL_CONNECTIONS_ENABLED = 'globalConnectionsEnabled',
    CUSTOM_ROLES_ENABLED = 'customRolesEnabled',
    API_KEYS_ENABLED = 'apiKeysEnabled',
    SSO_ENABLED = 'ssoEnabled',
    SECRET_MANAGERS_ENABLED = 'secretManagersEnabled',
    SCIM_ENABLED = 'scimEnabled',
}

export type FeatureId = ConsumableFeatureId | UnconsumableFeatureId | FeatureFlagId

export function isConsumableFeatureId(value: string): value is ConsumableFeatureId {
    return Object.values<string>(ConsumableFeatureId).includes(value)
}


export const TenantPlan = z.object({
    ...BaseModelSchema,
    plan: Nullable(z.string()),
    tenantId: z.string(),
    includedCredits: z.number(),

    tablesEnabled: z.boolean(),
    eventStreamingEnabled: z.boolean(),

    environmentsEnabled: z.boolean(),
    analyticsEnabled: z.boolean(),
    showPoweredBy: z.boolean(),
    auditLogEnabled: z.boolean(),
    embeddingEnabled: z.boolean(),
    aiProvidersEnabled: z.boolean(),
    chatEnabled: z.boolean(),
    agentsEnabled: z.boolean(),
    workerGroupsEnabled: z.boolean(),
    manageConnectorsEnabled: z.boolean(),
    manageTemplatesEnabled: z.boolean(),
    customAppearanceEnabled: z.boolean(),
    billedTeamWorkspacesLimit: Nullable(z.number()),
    usersLimit: Nullable(z.number()),
    scheduledUsersLimit: Nullable(z.number()),
    workspaceRolesEnabled: z.boolean(),
    globalConnectionsEnabled: z.boolean(),
    customRolesEnabled: z.boolean(),
    apiKeysEnabled: z.boolean(),
    ssoEnabled: z.boolean(),
    secretManagersEnabled: z.boolean(),
    scimEnabled: z.boolean(),
    licenseKey: Nullable(z.string()),
    licenseExpiresAt: Nullable(DateOrString),

    workspacesLimit: Nullable(z.number()),
    activeWorkflowsLimit: Nullable(z.number()),

    /** @deprecated use workerGroupId instead — will be removed in 0.83.0 */
    dedicatedWorkers: Nullable(z.object({
        trustedEnvironment: z.boolean(),
    })),
    /** @deprecated use workerGroupId instead — will be removed in 0.83.0 */
    canary: z.boolean(),
    /** @deprecated custom domains have been removed; column kept for backwards compatibility with existing DBs */
    customDomainsEnabled: z.boolean(),
    workerGroupId: Nullable(z.string()),
})
export type TenantPlan = z.infer<typeof TenantPlan>

export const TenantPlanLimits = TenantPlan.omit({ id: true, tenantId: true, created: true, updated: true })
export type TenantPlanLimits = z.infer<typeof TenantPlanLimits>
export type TenantPlanWithOnlyLimits = TenantPlanLimits

export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const hexColor = z.string().regex(HEX_COLOR_PATTERN, 'invalidHexColor')

export const TenantThemeColors = z.object({
    avatar: hexColor.optional(),
    'blue-link': hexColor.optional(),
    danger: hexColor.optional(),
    selection: hexColor.optional(),
    primary: z.object({
        dark: hexColor.optional(),
        light: hexColor.optional(),
        medium: hexColor.optional(),
    }).optional(),
    warn: z.object({
        default: hexColor.optional(),
        light: hexColor.optional(),
        dark: hexColor.optional(),
    }).optional(),
    success: z.object({
        default: hexColor.optional(),
        light: hexColor.optional(),
    }).optional(),
})
export type TenantThemeColors = z.infer<typeof TenantThemeColors>

export const CONNECTOR_SELECTOR_BUILTIN_TABS = ['EXPLORE', 'APPS', 'UTILITY', 'AI_AND_AGENTS', 'APPROVALS'] as const

export const ConnectorSelectorTabSection = z.object({
    id: z.string(),
    title: z.string().min(1).max(40),
    connectorNames: z.array(z.string()),
})
export type ConnectorSelectorTabSection = z.infer<typeof ConnectorSelectorTabSection>

export const ConnectorSelectorTabConfig = z.object({
    id: z.string(),
    kind: z.enum(['BUILTIN', 'CUSTOM']),
    builtinTab: z.enum(CONNECTOR_SELECTOR_BUILTIN_TABS).optional(),
    title: z.string().max(40).optional(),
    icon: z.string().optional(),
    hidden: z.boolean(),
    connectorNames: z.array(z.string()).optional(),
    sections: z.array(ConnectorSelectorTabSection).optional(),
}).refine(
    (tab) => tab.kind !== 'CUSTOM' || (tab.title?.trim().length ?? 0) > 0,
    { message: 'Custom tabs must have a name', path: ['title'] },
)
export type ConnectorSelectorTabConfig = z.infer<typeof ConnectorSelectorTabConfig>

export const ConnectorSelectorConfig = z.object({
    tabs: z.array(ConnectorSelectorTabConfig),
})
export type ConnectorSelectorConfig = z.infer<typeof ConnectorSelectorConfig>

export const Tenant = z.object({
    ...BaseModelSchema,
    ownerId: ApId,
    name: z.string(),
    primaryColor: z.string(),
    themeColors: Nullable(TenantThemeColors),
    logoIconUrl: z.string(),
    fullLogoUrl: z.string(),
    favIconUrl: z.string(),
    cloudAuthEnabled: z.boolean(),
    googleAuthEnabled: z.boolean(),
    enforceAllowedAuthDomains: z.boolean(),
    allowedAuthDomains: z.array(z.string()),
    allowedEmbedOrigins: z.array(z.string()),
    ssoDomain: Nullable(z.string()),
    ssoDomainVerification: Nullable(SsoDomainVerification),
    federatedAuthProviders: FederatedAuthnProviderConfig,
    emailAuthEnabled: z.boolean(),
    pinnedConnectors: z.array(z.string()),
    connectorSelectorConfig: Nullable(ConnectorSelectorConfig),
})
export type Tenant = z.infer<typeof Tenant>
export type TenantWithoutFederatedAuth = Omit<Tenant, 'federatedAuthProviders'>

export const TenantWithoutSensitiveData = z.object({
    federatedAuthProviders: Nullable(FederatedAuthnProviderConfigWithoutSensitiveData),
    plan: TenantPlanLimits,
    usage: TenantUsage.optional(),
    billingEnforced: z.boolean().optional(),
    id: z.string(),
    created: DateOrString,
    updated: DateOrString,
    ownerId: ApId,
    name: z.string(),
    primaryColor: z.string(),
    themeColors: Nullable(TenantThemeColors),
    logoIconUrl: z.string(),
    fullLogoUrl: z.string(),
    favIconUrl: z.string(),
    cloudAuthEnabled: z.boolean(),
    googleAuthEnabled: z.boolean(),
    enforceAllowedAuthDomains: z.boolean(),
    allowedAuthDomains: z.array(z.string()),
    allowedEmbedOrigins: z.array(z.string()),
    ssoDomain: Nullable(z.string()),
    ssoDomainVerification: Nullable(SsoDomainVerification),
    emailAuthEnabled: z.boolean(),
    pinnedConnectors: z.array(z.string()),
    connectorSelectorConfig: Nullable(ConnectorSelectorConfig),
})
export type TenantWithoutSensitiveData = z.infer<typeof TenantWithoutSensitiveData>

export const AutoTopUpConfig = z.object({
    featureId: z.enum(ConsumableFeatureId),
    enabled: z.boolean(),
    threshold: z.number(),
    quantity: z.number(),
    maxMonthlyTopUps: Nullable(z.number()),
})
export type AutoTopUpConfig = z.infer<typeof AutoTopUpConfig>

const BillableFeatureShape = {
    pricePerUnit: z.number(),
    billingUnits: z.number(),
    interval: Nullable(z.string()),
}

const ConsumableBillableFeatureShape = {
    ...BillableFeatureShape,
    autoTopUp: Nullable(AutoTopUpConfig),
}

export const CreditsBillableFeature = z.object({
    featureId: z.literal(ConsumableFeatureId.FEMA_CREDITS),
    ...ConsumableBillableFeatureShape,
})
export type CreditsBillableFeature = z.infer<typeof CreditsBillableFeature>

export const AppSumoCreditsBillableFeature = z.object({
    featureId: z.literal(ConsumableFeatureId.APP_SUMO_AI_CREDITS),
    ...ConsumableBillableFeatureShape,
})
export type AppSumoCreditsBillableFeature = z.infer<typeof AppSumoCreditsBillableFeature>

export const SeatsBillableFeature = z.object({
    featureId: z.literal(UnconsumableFeatureId.USERS_LIMIT),
    ...BillableFeatureShape,
})
export type SeatsBillableFeature = z.infer<typeof SeatsBillableFeature>

export type ConsumableBillableFeature = CreditsBillableFeature | AppSumoCreditsBillableFeature

export const WorkspaceCreditUsage = z.object({
    workspaceId: z.string(),
    workspaceName: z.string(),
    creditsUsed: z.number(),
    aiCreditsUsed: z.number(),
})
export type WorkspaceCreditUsage = z.infer<typeof WorkspaceCreditUsage>

export const TenantBillingInformation = z.object({
    plan: TenantPlan,
    usage: TenantUsage,
    creditsResetInterval: Nullable(z.string()),
    planInterval: Nullable(z.string()),
    autumnPlanName: Nullable(z.string()),
    scheduledPlanName: Nullable(z.string()),
    nextBillingDate: z.string(),
    nextBillingAmount: z.number(),
    cancelAt: Nullable(z.string()),
    trialEndsAt: Nullable(z.string()),
    creditsFeature: Nullable(CreditsBillableFeature),
    appSumoCreditsFeature: Nullable(AppSumoCreditsBillableFeature),
    seatsFeature: Nullable(SeatsBillableFeature),
    billingPortalAvailable: z.boolean(),
    billingEnforced: z.boolean(),
    billingUnavailable: z.boolean(),
    includedSeats: Nullable(z.number()),
    additionalSeats: Nullable(z.number()),
})
export type TenantBillingInformation = z.infer<typeof TenantBillingInformation>

import { BaseModelSchema, DateOrString, EntityId, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { FederatedAuthnProviderConfig, FederatedAuthnProviderConfigWithoutSensitiveData } from '../../core/federated-authn'
import { SsoDomainVerification } from './sso-domain-verification'

export const TenantPlan = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    usersLimit: Nullable(z.number()),
    workspacesLimit: Nullable(z.number()),
    activeWorkflowsLimit: Nullable(z.number()),
    workerGroupId: Nullable(z.string()),
})
export type TenantPlan = z.infer<typeof TenantPlan>

export const TenantPlanLimits = TenantPlan.omit({ id: true, tenantId: true, created: true, updated: true })
export type TenantPlanLimits = z.infer<typeof TenantPlanLimits>

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
    ownerId: EntityId,
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
    id: z.string(),
    created: DateOrString,
    updated: DateOrString,
    ownerId: EntityId,
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

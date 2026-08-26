import { EntityId, Nullable, OptionalArrayFromQuery, OptionalBooleanFromQuery, SAFE_STRING_PATTERN, tryCatchSync, UploadedFile } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { FederatedAuthnProviderConfig } from '../../core/federated-authn'
import { ConnectorSelectorConfig, TenantThemeColors } from './tenant.model'

export const MAX_EMBED_ORIGIN_LENGTH = 300

const ALLOWED_EMBED_ORIGIN_PROTOCOLS = new Set(['http:', 'https:'])
const WILDCARD_EMBED_ORIGIN_PATTERN = /^https?:\/\/\*\.[^*\s/?#]+$/

export const allowedEmbedOriginSchema = z.string()
    .max(MAX_EMBED_ORIGIN_LENGTH, 'invalidEmbedOrigin')
    .refine((value) => {
        const isWildcard = WILDCARD_EMBED_ORIGIN_PATTERN.test(value)
        const probe = isWildcard ? value.replace('://*.', '://wildcard.') : value
        try {
            const url = new URL(probe)
            return ALLOWED_EMBED_ORIGIN_PROTOCOLS.has(url.protocol) && url.origin === probe
        }
        catch {
            return false
        }
    }, 'invalidEmbedOrigin')

export const Base64EncodedFile = z.object({
    base64: z.string(),
    mimetype: z.string(),
})

export type Base64EncodedFile = z.infer<typeof Base64EncodedFile>

export const CreateTenantRequest = z.object({
    name: z.string().regex(new RegExp(SAFE_STRING_PATTERN)).min(1).max(100),
})

export type CreateTenantRequest = z.infer<typeof CreateTenantRequest>

// The branding form submits as multipart (logo uploads), where every field arrives as a string
const jsonFromMultipart = (value: unknown): unknown => {
    if (typeof value !== 'string') {
        return value
    }
    const { data, error } = tryCatchSync<unknown>(() => JSON.parse(value))
    return error ? value : data
}

const NullableThemeColorsFromMultipart = z.preprocess(jsonFromMultipart, Nullable(TenantThemeColors))

const NullableConnectorSelectorConfigFromMultipart = z.preprocess(jsonFromMultipart, Nullable(ConnectorSelectorConfig))

export const UpdateTenantRequestBody = z.object({
    name: z.string().regex(new RegExp(SAFE_STRING_PATTERN)).optional(),
    primaryColor: z.string().optional(),
    themeColors: NullableThemeColorsFromMultipart,
    logoIcon: z.optional(UploadedFile),
    fullLogo: z.optional(UploadedFile),
    favIcon: z.optional(UploadedFile),
    federatedAuthProviders: FederatedAuthnProviderConfig.optional(),
    cloudAuthEnabled: OptionalBooleanFromQuery,
    googleAuthEnabled: OptionalBooleanFromQuery,
    emailAuthEnabled: OptionalBooleanFromQuery,
    allowedAuthDomains: OptionalArrayFromQuery(z.string()),
    enforceAllowedAuthDomains: OptionalBooleanFromQuery,
    pinnedConnectors: OptionalArrayFromQuery(z.string()),
    connectorSelectorConfig: NullableConnectorSelectorConfigFromMultipart.optional(),
    allowedEmbedOrigins: z.array(allowedEmbedOriginSchema)
        .optional(),
})

export type UpdateTenantRequestBody = z.infer<typeof UpdateTenantRequestBody>

export const AdminRetryRunsRequestBody = z.object({
    runIds: z.array(EntityId).optional(),
    createdAfter: z.string(),
    createdBefore: z.string(),
})

export type AdminRetryRunsRequestBody = z.infer<typeof AdminRetryRunsRequestBody>



export const AddAllowedEmbedOriginsRequestBody = z.object({
    allowedEmbedOrigins: z.array(allowedEmbedOriginSchema)
        .min(1, 'invalidEmbedOrigin'),
})

export type AddAllowedEmbedOriginsRequestBody = z.infer<typeof AddAllowedEmbedOriginsRequestBody>

export const AddAllowedEmbedOriginsResponse = z.object({
    allowedEmbedOrigins: z.array(z.string()),
})

export type AddAllowedEmbedOriginsResponse = z.infer<typeof AddAllowedEmbedOriginsResponse>

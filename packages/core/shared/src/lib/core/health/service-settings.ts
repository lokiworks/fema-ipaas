import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'
import { OptionalServiceKind, ServiceCheckResult } from './system-overview'

export enum ServiceConfigSource {
    ENVIRONMENT = 'ENVIRONMENT',
    SAVED = 'SAVED',
    NONE = 'NONE',
}

export enum ServiceClearBlock {
    FILES_IN_OBJECT_STORAGE = 'FILES_IN_OBJECT_STORAGE',
}

function isHttpAddress(value: string): boolean {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    }
    catch {
        return false
    }
}

const HttpAddress = z.string().trim().min(1, formErrors.required).max(2048).refine(isHttpAddress, 'invalidHttpAddress')

export const SmtpServiceConfig = z.object({
    host: z.string().trim().min(1, formErrors.required).max(253),
    port: z.number('portRange').int('portRange').min(1, 'portRange').max(65535, 'portRange'),
    username: z.string().trim().max(254).optional(),
    password: z.string().max(512).optional(),
    senderEmail: z.string().trim().min(1, formErrors.required).max(254).refine((value) => value.includes('@'), 'invalidEmail'),
    senderName: z.string().trim().max(60).optional(),
})

export const ObjectStorageServiceConfig = z.object({
    endpoint: z.string().trim().max(2048).refine((value) => value.length === 0 || isHttpAddress(value), 'invalidHttpAddress').optional(),
    region: z.string().trim().max(64).optional(),
    bucket: z.string().trim().min(1, formErrors.required).max(255),
    accessKeyId: z.string().trim().min(1, formErrors.required).max(256),
    secretAccessKey: z.string().max(512).optional(),
})

export const RegistryServiceConfig = z.object({
    url: HttpAddress,
})

export const ServiceSettingDraft = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal(OptionalServiceKind.SMTP), config: SmtpServiceConfig }),
    z.object({ kind: z.literal(OptionalServiceKind.OBJECT_STORAGE), config: ObjectStorageServiceConfig }),
    z.object({ kind: z.literal(OptionalServiceKind.CONNECTOR_REGISTRY), config: RegistryServiceConfig }),
    z.object({ kind: z.literal(OptionalServiceKind.TEMPLATE_REGISTRY), config: RegistryServiceConfig }),
])

export const TestServiceSettingRequest = z.object({
    draft: ServiceSettingDraft,
    recipient: z.string().trim().min(1).max(320).optional(),
})

export const ServiceSettingView = z.object({
    kind: z.enum(OptionalServiceKind),
    source: z.enum(ServiceConfigSource),
    values: z.record(z.string(), z.union([z.string(), z.number()])),
    secretConfigured: z.boolean(),
    updated: Nullable(z.string()),
    updatedBy: Nullable(z.string()),
    canClear: z.boolean(),
    clearBlock: Nullable(z.enum(ServiceClearBlock)),
})

export const ServiceSettingsOverview = z.array(ServiceSettingView)

export const SaveServiceSettingResponse = z.object({
    saved: z.boolean(),
    check: ServiceCheckResult,
    setting: Nullable(ServiceSettingView),
})

export type SmtpServiceConfig = z.infer<typeof SmtpServiceConfig>
export type ObjectStorageServiceConfig = z.infer<typeof ObjectStorageServiceConfig>
export type RegistryServiceConfig = z.infer<typeof RegistryServiceConfig>
export type ServiceSettingDraft = z.infer<typeof ServiceSettingDraft>
export type TestServiceSettingRequest = z.infer<typeof TestServiceSettingRequest>
export type ServiceSettingView = z.infer<typeof ServiceSettingView>
export type ServiceSettingsOverview = z.infer<typeof ServiceSettingsOverview>
export type SaveServiceSettingResponse = z.infer<typeof SaveServiceSettingResponse>

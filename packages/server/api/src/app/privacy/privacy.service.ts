import { ApplicationError, ErrorCode, generateId, isNil, TenantId, UserId } from '@fema-ipaas/core-utils'
import {
    Execution,
    LogPrivacy,
    PayloadLevel,
    privacyMasking,
    PrivacySettings,
    RawViewRole,
    RevealExecutionPayloadResponse,
    TenantRole,
    UpdatePrivacySettingsRequestBody,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { PrivacySettingsEntity } from './privacy-settings.entity'

export const privacySettingsRepo = repoFactory(PrivacySettingsEntity)

export const privacyService = (log: FastifyBaseLogger) => ({
    async get({ tenantId }: TenantScope): Promise<PrivacySettings> {
        const existing = await privacySettingsRepo().findOneBy({ tenantId })
        return isNil(existing) ? defaults({ tenantId }) : existing
    },

    async update({ tenantId, request }: UpdateParams): Promise<PrivacySettings> {
        const instanceLimit = system.getNumberOrThrow(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS)
        if (request.logRetentionDays > instanceLimit) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Log retention cannot exceed the instance limit of ${instanceLimit} days` },
            })
        }
        const existing = await privacySettingsRepo().findOneBy({ tenantId })
        if (isNil(existing)) {
            await privacySettingsRepo().insert({ id: generateId(), tenantId, ...request })
        }
        else {
            await privacySettingsRepo().update({ id: existing.id, tenantId }, request)
        }
        logPrivacyCache.delete(tenantId)
        log.info({ tenant: { id: tenantId } }, '[privacyService#update] Privacy settings updated')
        return this.get({ tenantId })
    },

    async maskExecution({ execution, tenantId }: MaskExecutionParams): Promise<MaskedExecution> {
        const settings = await this.get({ tenantId })
        if (isNil(execution.steps)) {
            return execution
        }
        const redactPayload = settings.payloadLevel !== PayloadLevel.FULL
        const { steps, maskedCount } = Object.entries(execution.steps).reduce<MaskedSteps>((acc, [stepName, stepOutput]) => {
            const masked = maskStep({ stepOutput, settings, redactPayload })
            return { steps: { ...acc.steps, [stepName]: masked.value }, maskedCount: acc.maskedCount + masked.maskedCount }
        }, { steps: {}, maskedCount: 0 })
        return { ...execution, steps, privacyMaskedFields: maskedCount, payloadRedacted: redactPayload }
    },

    async logPrivacyFor({ tenantId, displayLogsFileId }: TenantScope & { displayLogsFileId: string }): Promise<LogPrivacy> {
        const cached = logPrivacyCache.get(tenantId)
        const settings = !isNil(cached) && cached.expiresAt > Date.now()
            ? cached.settings
            : await this.get({ tenantId })
        if (isNil(cached) || cached.expiresAt <= Date.now()) {
            logPrivacyCache.set(tenantId, { settings, expiresAt: Date.now() + LOG_PRIVACY_CACHE_MS })
        }
        return { payloadLevel: settings.payloadLevel, maskRules: settings.maskRules, displayLogsFileId }
    },

    async assertCanReveal({ tenantId, userId, reason }: AssertCanRevealParams): Promise<void> {
        const settings = await this.get({ tenantId })
        if (settings.payloadLevel !== PayloadLevel.FULL) {
            denied('Raw payloads are not recorded for this tenant')
        }
        const role = await rawViewRoleOf({ tenantId, userId, log })
        if (!settings.rawViewRoles.includes(role)) {
            denied('You are not allowed to view raw payloads')
        }
        if (settings.requireRawViewReason && (isNil(reason) || reason.trim().length < MIN_REASON_LENGTH)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'A reason is required to view raw payloads' },
            })
        }
    },

    revealStep({ execution, stepName }: { execution: Execution, stepName: string }): RevealExecutionPayloadResponse {
        const step = execution.steps?.[stepName]
        if (isNil(step) || !isRecord(step)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityId: stepName, entityType: 'Step' },
            })
        }
        return { stepName, input: step.input, output: step.output }
    },
})

function maskStep({ stepOutput, settings, redactPayload }: MaskStepParams): { value: unknown, maskedCount: number } {
    if (!isRecord(stepOutput)) {
        return { value: stepOutput, maskedCount: 0 }
    }
    if (redactPayload) {
        return { value: { ...stepOutput, input: null, output: null }, maskedCount: 0 }
    }
    const input = privacyMasking.maskDeep({ value: stepOutput.input, rules: settings.maskRules, maskAll: false })
    const output = privacyMasking.maskDeep({ value: stepOutput.output, rules: settings.maskRules, maskAll: false })
    return {
        value: { ...stepOutput, input: input.value, output: output.value },
        maskedCount: input.maskedCount + output.maskedCount,
    }
}

async function rawViewRoleOf({ tenantId, userId, log }: { tenantId: TenantId, userId: UserId, log: FastifyBaseLogger }): Promise<RawViewRole> {
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    if (tenant.ownerId === userId) {
        return RawViewRole.OWNER
    }
    const user = await userService(log).getOneOrFail({ id: userId })
    return user.tenantRole === TenantRole.ADMIN ? RawViewRole.ADMIN : RawViewRole.MEMBER
}

function defaults({ tenantId }: TenantScope): PrivacySettings {
    const now = new Date(0).toISOString()
    return {
        id: `default-${tenantId}`,
        created: now,
        updated: now,
        tenantId,
        logRetentionDays: Math.min(DEFAULT_LOG_RETENTION_DAYS, system.getNumberOrThrow(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS)),
        payloadLevel: PayloadLevel.FULL,
        rawPayloadRetentionDays: DEFAULT_RAW_RETENTION_DAYS,
        maskRules: privacyMasking.defaultMaskRules(),
        rawViewRoles: [RawViewRole.OWNER, RawViewRole.ADMIN],
        requireRawViewReason: true,
    }
}

function denied(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const logPrivacyCache = new Map<TenantId, { settings: PrivacySettings, expiresAt: number }>()
const LOG_PRIVACY_CACHE_MS = 60_000
const DEFAULT_LOG_RETENTION_DAYS = 30
const MIN_REASON_LENGTH = 4

type TenantScope = {
    tenantId: TenantId
}

type UpdateParams = TenantScope & {
    request: UpdatePrivacySettingsRequestBody
}

type MaskExecutionParams = {
    execution: Execution
    tenantId: TenantId
}

type AssertCanRevealParams = TenantScope & {
    userId: UserId
    reason: string | undefined
}

type MaskStepParams = {
    stepOutput: unknown
    settings: PrivacySettings
    redactPayload: boolean
}

export type MaskedExecution = Omit<Execution, 'steps'> & {
    steps: Record<string, unknown> | null
}

type MaskedSteps = {
    steps: Record<string, unknown>
    maskedCount: number
}

export const DEFAULT_RAW_RETENTION_DAYS = 3

import { versionUtil } from '@fema-ipaas/server-utils'
import { ExecutionMode, Flag, FlagId } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { turnstile } from '../authentication/lib/turnstile'
import { repoFactory } from '../core/db/repo-factory'
import { domainHelper } from '../helper/domain-helper'
import { emailService } from '../helper/email/email-service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { FlagEntity } from './flag.entity'
import { defaultTheme } from './theme'

const flagRepo = repoFactory(FlagEntity)

export const flagService = (log: FastifyBaseLogger) => ({
    save: async (flag: FlagType): Promise<Flag> => {
        return flagRepo().save({
            id: flag.id,
            value: flag.value,
        })
    },
    async getOne(flagId: FlagId): Promise<Flag | null> {
        return flagRepo().findOneBy({ id: flagId })
    },
    async getAll(): Promise<Flag[]> {
        const flags = await flagRepo().findBy({
            id: In([
                FlagId.SHOW_POWERED_BY_IN_FORM,
                FlagId.CLOUD_AUTH_ENABLED,
                FlagId.CURRENT_VERSION,
                FlagId.EMAIL_AUTH_ENABLED,
                FlagId.EXECUTION_DATA_RETENTION_DAYS,
                FlagId.ENVIRONMENT,
                FlagId.PUBLIC_URL,
                FlagId.PRIVACY_POLICY_URL,
                FlagId.CONNECTORS_SYNC_MODE,
                FlagId.PRIVATE_CONNECTORS_ENABLED,
                FlagId.EXECUTION_TIME_SECONDS,
                FlagId.SHOW_COMMUNITY,
                FlagId.TELEMETRY_ENABLED,
                FlagId.TERMS_OF_SERVICE_URL,
                FlagId.THEME,
                FlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
                FlagId.USER_CREATED,
                FlagId.WEBHOOK_URL_PREFIX,
                FlagId.ALLOW_NPM_PACKAGES_IN_CODE_STEP,
                FlagId.MAX_FIELDS_PER_TABLE,
                FlagId.MAX_RECORDS_PER_TABLE,
                FlagId.MAX_FILE_SIZE_MB,
            ]),
        })
        const now = dayjs().toISOString()
        const created = now
        const updated = now
        const currentVersion = versionUtil.getCurrentRelease()
        flags.push(
            {
                id: FlagId.ENVIRONMENT,
                value: system.get(AppSystemProp.ENVIRONMENT),
                created,
                updated,
            },
            {
                id: FlagId.FRONTEND_SENTRY_DSN,
                value: system.get(AppSystemProp.FRONTEND_SENTRY_DSN) ?? null,
                created,
                updated,
            },
            {
                id: FlagId.SHOW_WORKSPACE_MEMBERS,
                value: false,
                created,
                updated,
            },
            {
                id: FlagId.SHOW_POWERED_BY_IN_FORM,
                value: true,
                created,
                updated,
            },
            {
                id: FlagId.CONNECTORS_SYNC_MODE,
                value: system.get(AppSystemProp.CONNECTORS_SYNC_MODE),
                created,
                updated,
            },
            {
                id: FlagId.ENABLE_WORKFLOW_ON_PUBLISH,
                value: system.getBoolean(AppSystemProp.ENABLE_WORKFLOW_ON_PUBLISH) ?? true,
                created,
                updated,
            },
            {
                id: FlagId.EXECUTION_DATA_RETENTION_DAYS,
                value: system.getNumber(AppSystemProp.EXECUTION_DATA_RETENTION_DAYS),
                created,
                updated,
            },
            {
                id: FlagId.CLOUD_AUTH_ENABLED,
                value: system.getBoolean(AppSystemProp.CLOUD_AUTH_ENABLED) ?? true,
                created,
                updated,
            },
            {
                id: FlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
                value: null,
                created,
                updated,
            },
            {
                id: FlagId.EMAIL_AUTH_ENABLED,
                value: true,
                created,
                updated,
            },
            {
                id: FlagId.THEME,
                value: defaultTheme,
                created,
                updated,
            },
            {
                id: FlagId.SHOW_COMMUNITY,
                value: true,
                created,
                updated,
            },
            {
                id: FlagId.PRIVATE_CONNECTORS_ENABLED,
                value: false,
                created,
                updated,
            },
            {
                id: FlagId.PRIVACY_POLICY_URL,
                value: 'https://github.com/lokiworks/fema-ipaas/privacy',
                created,
                updated,
            },
            {
                id: FlagId.TERMS_OF_SERVICE_URL,
                value: 'https://github.com/lokiworks/fema-ipaas/terms',
                created,
                updated,
            },
            {
                id: FlagId.TELEMETRY_ENABLED,
                value: system.getBoolean(AppSystemProp.TELEMETRY_ENABLED) ?? true,
                created,
                updated,
            },
            {
                id: FlagId.AGENTS_ENABLED,
                value: system.getBoolean(AppSystemProp.AGENTS_ENABLED) ?? false,
                created,
                updated,
            },
            {
                id: FlagId.PUBLIC_URL,
                value: await domainHelper.getPublicUrl({
                    path: '',
                }),
                created,
                updated,
            },
            {
                id: FlagId.EXECUTION_TIME_SECONDS,
                value: system.getNumberOrThrow(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: FlagId.TRIGGER_TIMEOUT_SECONDS,
                value: system.getNumberOrThrow(AppSystemProp.TRIGGER_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: FlagId.EXECUTION_MEMORY_LIMIT_KB,
                value: system.getNumber(AppSystemProp.SANDBOX_MEMORY_LIMIT),
                created,
                updated,
            },
            {
                id: FlagId.EXECUTION_LOG_SIZE_LIMIT_MB,
                value: system.getNumber(AppSystemProp.MAX_EXECUTION_LOG_SIZE_MB),
                created,
                updated,
            },
            {
                id: FlagId.PAUSED_WORKFLOW_TIMEOUT_DAYS,
                value: system.getNumber(AppSystemProp.PAUSED_WORKFLOW_TIMEOUT_DAYS),
                created,
                updated,
            },
            {
                id: FlagId.WEBHOOK_TIMEOUT_SECONDS,
                value: system.getNumber(AppSystemProp.WEBHOOK_TIMEOUT_SECONDS),
                created,
                updated,
            },
            {
                id: FlagId.CURRENT_VERSION,
                value: currentVersion,
                created,
                updated,
            },
            {
                id: FlagId.ALLOW_NPM_PACKAGES_IN_CODE_STEP,
                value: system.get(AppSystemProp.EXECUTION_MODE) !== ExecutionMode.SANDBOX_CODE_ONLY,
                created,
                updated,
            },
            {
                id: FlagId.MAX_RECORDS_PER_TABLE,
                value: system.getNumber(AppSystemProp.MAX_RECORDS_PER_TABLE),
                created,
                updated,
            },
            {
                id: FlagId.MAX_FIELDS_PER_TABLE,
                value: system.getNumber(AppSystemProp.MAX_FIELDS_PER_TABLE),
                created,
                updated,
            },
            {
                id: FlagId.MAX_FILE_SIZE_MB,
                value: system.getNumber(AppSystemProp.MAX_FILE_SIZE_MB),
                created,
                updated,
            },
            {
                id: FlagId.WORKSPACE_RATE_LIMITER_ENABLED,
                value: system.getBoolean(AppSystemProp.WORKSPACE_RATE_LIMITER_ENABLED) ?? false,
                created,
                updated,
            },
            {
                id: FlagId.DEFAULT_CONCURRENT_JOBS_LIMIT,
                value: system.getNumber(AppSystemProp.DEFAULT_CONCURRENT_JOBS_LIMIT),
                created,
                updated,
            },
            {
                id: FlagId.SMTP_CONFIGURED,
                value: emailService(log).isConfigured(),
                created,
                updated,
            },
            {
                id: FlagId.TURNSTILE_SITE_KEY,
                value: turnstile.siteKey() ?? null,
                created,
                updated,
            },
        )

        if (system.isApp()) {
            flags.push(
                {
                    id: FlagId.WEBHOOK_URL_PREFIX,
                    value: await domainHelper.getPublicApiUrl({
                        path: 'v1/webhooks',
                    }),
                    created,
                    updated,
                },
            )
        }
        return flags
    },

})




export type FlagType =
    | BaseFlagStructure<FlagId.PUBLIC_URL, string>
    | BaseFlagStructure<FlagId.TELEMETRY_ENABLED, boolean>
    | BaseFlagStructure<FlagId.USER_CREATED, boolean>
    | BaseFlagStructure<FlagId.WEBHOOK_URL_PREFIX, string>

type BaseFlagStructure<K extends FlagId, V> = {
    id: K
    value: V
}

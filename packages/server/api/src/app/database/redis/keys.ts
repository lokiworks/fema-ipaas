import { TenantId, WorkspaceId } from '@fema/core-utils'

export const getTenantPlanNameKey = (tenantId: TenantId): string => `tenant_plan:plan:${tenantId}`
export const getCreditsBalanceKey = (tenantId: TenantId): string => `tenant_plan:credits:${tenantId}`
export const getAppSumoAiCreditsBalanceKey = (tenantId: TenantId): string => `tenant_plan:appsumo-ai-credits:${tenantId}`
export const getBillingEnforcedKey = (tenantId: TenantId): string => `tenant_plan:billing-enforced:${tenantId}`
export const getBillingOverviewKey = (tenantId: TenantId): string => `tenant_plan:billing-overview:v2:${tenantId}`
export const getEntitlementsForceRefreshKey = (tenantId: TenantId): string => `tenant_plan:entitlements-force-refresh:${tenantId}`
export const getEntitlementsRefreshKey = (tenantId: TenantId): string => `tenant_plan:entitlements-refresh:${tenantId}`
export const getCustomerStateRefreshKey = (tenantId: TenantId): string => `tenant_plan:customer-state-refresh:${tenantId}`
export const getCustomerStateMissKey = (tenantId: TenantId): string => `tenant_plan:customer-state-miss:${tenantId}`
export const getEnrollAttemptKey = (tenantId: TenantId): string => `tenant_plan:autumn-enroll-attempt:${tenantId}`
export const getAutumnEnrollLockKey = (tenantId: TenantId): string => `autumn_enroll_${tenantId}`
export const getFreeLegacyCompAttemptKey = (tenantId: TenantId): string => `tenant_plan:free-legacy-comp-attempt:${tenantId}`
export const getBillingOverviewFetchLockKey = (tenantId: TenantId): string => `billing_overview_fetch_${tenantId}`
export const getCustomerStateFetchLockKey = (tenantId: TenantId): string => `customer_state_fetch_${tenantId}`
export const getWorkspaceConcurrencyPoolKey = (workspaceId: WorkspaceId): string => `workspace:concurrency-pool:${workspaceId}` // gets pool id for the workspace
export const getConcurrencyPoolLimitKey = (poolId: string): string => `concurrency-pool:limit:${poolId}` // gets limit value for the pool
export const getConcurrencyPoolSetKey = (poolId: string): string => `active_jobs_set:pool:${poolId}`

export const BILLING_ENFORCED_TTL_SECONDS = 24 * 60 * 60
export const TENANT_PLAN_NAME_TTL_SECONDS = 24 * 60 * 60
export const AUTUMN_ENROLL_LOCK_TIMEOUT_SECONDS = 60

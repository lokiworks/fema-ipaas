import { ExecutionType, RunContext, ServerContext, StoreScope } from '@fema-ipaas/connector-sdk'

export type ComponentStore = {
    put<T>(key: string, value: T, scope?: StoreScope): Promise<T>
    get<T>(key: string, scope?: StoreScope): Promise<T | null>
    delete(key: string, scope?: StoreScope): Promise<void>
}

export type ComponentExecutionContext<Input> = {
    input: Input
    executionType: ExecutionType
    resumePayload?: unknown
    run: RunContext
    server: ServerContext
    store: ComponentStore
    workspaceId: string
    tenantId: string
    step: {
        name: string
        displayName: string
    }
}

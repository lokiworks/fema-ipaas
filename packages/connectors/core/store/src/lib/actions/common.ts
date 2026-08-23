import { Property, StoreScope } from "@fema/connector-sdk"

export enum ConnectorStoreScope {
    WORKSPACE = 'COLLECTION',
    FLOW = 'FLOW',
    RUN = 'RUN',
}

const testRunId = 'test-run-id-CbVidYfEuCRpUanfEb3RU';
export function getScopeAndKey(params: Params): { scope: StoreScope, key: string } {
    switch (params.scope) {
        case ConnectorStoreScope.WORKSPACE:
            return { scope: StoreScope.WORKSPACE, key: params.key }
        case ConnectorStoreScope.FLOW:
            return { scope: StoreScope.FLOW, key: params.key }
        case ConnectorStoreScope.RUN:
            // Use a consistent test run ID when testing to allow store operations to work together
            {
                const runId = params.isTestMode ? testRunId : params.runId
                return { scope: StoreScope.FLOW, key: `run_${runId}/${params.key}` }
            }
    }
}

type Params = {
    runId: string
    key: string
    scope: ConnectorStoreScope
    isTestMode: boolean
}

export const common = {
    store_scope: Property.StaticDropdown({
        displayName: 'Store Scope',
        description: 'The storage scope of the value.',
        required: true,
        options: {
            options: [
                {
                    label: 'Workspace',
                    value: ConnectorStoreScope.WORKSPACE,
                },
                {
                    label: 'Flow',
                    value: ConnectorStoreScope.FLOW,
                },
                {
                    label: 'Run',
                    value: ConnectorStoreScope.RUN,
                },
            ],
        },
        defaultValue: ConnectorStoreScope.WORKSPACE,
    })
}
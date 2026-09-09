import { Property, StoreScope } from "@fema-ipaas/connector-sdk"

export enum ConnectorStoreScope {
    PROJECT = 'COLLECTION',
    WORKFLOW = 'WORKFLOW',
    RUN = 'RUN',
}

const testRunId = 'test-run-id-CbVidYfEuCRpUanfEb3RU';
export function getScopeAndKey(params: Params): { scope: StoreScope, key: string } {
    switch (params.scope) {
        case ConnectorStoreScope.PROJECT:
            return { scope: StoreScope.PROJECT, key: params.key }
        case ConnectorStoreScope.WORKFLOW:
            return { scope: StoreScope.WORKFLOW, key: params.key }
        case ConnectorStoreScope.RUN:
            // Use a consistent test run ID when testing to allow store operations to work together
            {
                const runId = params.isTestMode ? testRunId : params.runId
                return { scope: StoreScope.WORKFLOW, key: `run_${runId}/${params.key}` }
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
                    label: 'Project',
                    value: ConnectorStoreScope.PROJECT,
                },
                {
                    label: 'Workflow',
                    value: ConnectorStoreScope.WORKFLOW,
                },
                {
                    label: 'Run',
                    value: ConnectorStoreScope.RUN,
                },
            ],
        },
        defaultValue: ConnectorStoreScope.PROJECT,
    })
}
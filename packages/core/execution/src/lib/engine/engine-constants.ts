import { FlowVersionState } from '../flows/flow-version'

export const DEFAULT_MCP_DATA = {
    flowId: 'mcp-flow-id',
    flowVersionId: 'mcp-flow-version-id',
    flowVersionState: FlowVersionState.LOCKED,
    executionId: 'mcp-execution-id',
    triggerConnectorName: 'mcp-trigger-connector-name',
}

export const ERROR_MESSAGES_TO_REDACT = [
    'HttpClient#sendRequest',
]
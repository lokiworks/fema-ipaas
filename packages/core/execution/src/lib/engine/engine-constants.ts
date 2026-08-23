import { WorkflowVersionState } from '../workflows/workflow-version'

export const DEFAULT_MCP_DATA = {
    workflowId: 'mcp-workflow-id',
    workflowVersionId: 'mcp-workflow-version-id',
    workflowVersionState: WorkflowVersionState.LOCKED,
    executionId: 'mcp-execution-id',
    triggerConnectorName: 'mcp-trigger-connector-name',
}

export const ERROR_MESSAGES_TO_REDACT = [
    'HttpClient#sendRequest',
]
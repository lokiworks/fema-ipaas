export const routesThatRequireProjectId = {
  home: '/home',
  runs: '/runs',
  singleRun: '/runs/:runId',
  issues: '/issues',
  singleIssue: '/issues/:issueId',
  agentApprovals: '/agent-approvals',
  releases: '/releases',
  singleRelease: '/releases/:releaseId',
  mappingTables: '/mapping-tables',
  dataStores: '/data-stores',
  mcpServices: '/mcp-services',
  singleMcpService: '/mcp-services/:serviceId',
  aiUsage: '/ai-usage',
  workflows: '/workflows',
  singleWorkflow: '/workflows/:workflowId',
  workflowSnapshot: '/workflows/:workflowId/v/:versionId',
  connections: '/connections',
  singleConnection: '/connections/:connectionId',
  variables: '/variables',
  settings: '/settings',
};

export const WORKSPACE_HOME_ROUTE = '/';
export const NEW_WORKFLOW_QUERY_PARAM = 'newWorkflow';
export const NEW_CONNECTION_QUERY_PARAM = 'newConnection';

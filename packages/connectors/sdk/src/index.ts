export * from './lib';

// Foundation symbols re-exported so connectors depend only on framework/common — never
// on core-*/shared directly (enforced by the community-connector import boundary lint).
export {
  isNil,
  isEmpty,
  isString,
  isNotUndefined,
  assertNotNullOrUndefined,
  generateId,
  chunk,
  unique,
  pickBy,
  spreadIfDefined,
  kebabCase,
  camelCase,
  startCase,
  tryCatch,
  dataMapping,
  MappingSpec,
  MappingTransformType,
  MappingMissingBehavior,
  llmWire,
  LlmProvider,
  mcpWire,
  MCP_PROTOCOL_VERSION,
} from '@fema-ipaas/core-utils';
export type {
  SeekPage,
  MappingTableData,
  LlmConfig,
  LlmContent,
  LlmMessage,
  LlmTool,
  LlmResponse,
  LlmUsage,
  McpTool,
  McpToolResult,
} from '@fema-ipaas/core-utils';

export {
  ConnectorCategory,
  ConnectionType,
  MarkdownVariant,
  OAuth2GrantType,
  WebhookHandshakeStrategy,
  ExecutionType,
  ExecutionToolStatus,
  normalizeToolOutputToExecuteResponse,
  // mcp
  // forms
  ChatFormResponse,
  FileResponseInterface,
  HumanInputFormResult,
  HumanInputFormResultTypes,
  createKeyForFormInput,
  // tables
  // workflow contracts
  WorkflowStatus,
  WorkflowTriggerType,
  Project,
  StopResponse,
  USE_DRAFT_QUERY_PARAM_NAME,
  RAW_PAYLOAD_HEADER,
  PARENT_RUN_ID_HEADER,
  FAIL_PARENT_ON_FAILURE_HEADER,
} from '@fema-ipaas/connector-types';
export type {
  BasicAuthConnectionValue,
  CustomAuthConnectionValue,
  PopulatedWorkflowSummary,
  ExecuteToolResponse,
  PopulatedWorkflow,
} from '@fema-ipaas/connector-types';

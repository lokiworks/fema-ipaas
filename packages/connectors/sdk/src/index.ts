export * from './lib';

// Foundation symbols re-exported so connectors depend only on framework/common — never
// on core-*/shared directly (enforced by the community-connector import boundary lint).
export {
  isNil,
  isEmpty,
  isString,
  isNotUndefined,
  assertNotNullOrUndefined,
  apId,
  chunk,
  unique,
  pickBy,
  spreadIfDefined,
  kebabCase,
  camelCase,
  startCase,
  tryCatch,
} from '@fema/core-utils';
export type { SeekPage } from '@fema/core-utils';

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
  // flow contracts
  FlowStatus,
  FlowTriggerType,
  Project,
  StopResponse,
  USE_DRAFT_QUERY_PARAM_NAME,
  RAW_PAYLOAD_HEADER,
  PARENT_RUN_ID_HEADER,
  FAIL_PARENT_ON_FAILURE_HEADER,
} from '@fema/connector-types';
export type {
  BasicAuthConnectionValue,
  CustomAuthConnectionValue,
  PopulatedFlowSummary,
  ExecuteToolResponse,
  PopulatedFlow,
} from '@fema/connector-types';

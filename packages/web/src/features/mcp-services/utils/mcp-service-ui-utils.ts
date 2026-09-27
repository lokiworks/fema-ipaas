import { isNil } from '@fema-ipaas/core-utils';
import {
  McpAvailabilityMode,
  McpClientContextKey,
  McpCredentialMode,
  McpServiceIssue,
  McpServiceIssueCode,
  McpServiceTool,
  McpToolParam,
  McpToolParamMode,
  McpToolSource,
  McpToolTriggerKind,
  McpWorkflowToolCandidate,
  mcpServiceUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function buildToolDraft({
  source,
  sourceParams,
  titleHint,
  taken,
}: {
  source: McpToolSource;
  sourceParams: McpToolParam[];
  titleHint: string;
  taken: string[];
}): McpServiceTool {
  return {
    id: crypto.randomUUID(),
    name: toolNameFor({ displayName: titleHint, taken }),
    title: titleHint.slice(0, 30),
    description: '',
    source,
    params: sourceParams,
  };
}

function workflowCandidateBlockedReason(
  candidate: Pick<McpWorkflowToolCandidate, 'published' | 'triggerKind'>,
): string | null {
  if (!candidate.published) {
    return t('Not published');
  }
  if (
    candidate.triggerKind !== McpToolTriggerKind.SUBFLOW &&
    candidate.triggerKind !== McpToolTriggerKind.WEBHOOK
  ) {
    return t('Its trigger is not a callable-workflow (or webhook) trigger');
  }
  return null;
}

function toolNameFor({
  displayName,
  taken,
}: {
  displayName: string;
  taken: string[];
}): string {
  return mcpServiceUtils.uniqueName({
    base: mcpServiceUtils.toSnakeName(displayName),
    taken,
  });
}

function paramModeLabel(mode: McpToolParamMode): string {
  switch (mode) {
    case McpToolParamMode.AI:
      return t('AI-inferred');
    case McpToolParamMode.FIXED:
      return t('Fixed value');
    case McpToolParamMode.REFERENCE:
      return t('Reference value');
    case McpToolParamMode.CLIENT_CONTEXT:
      return t('Client context');
  }
}

function contextKeyLabel(key: McpClientContextKey): string {
  switch (key) {
    case McpClientContextKey.USER_EMAIL:
      return t('Caller email');
    case McpClientContextKey.USER_ID:
      return t('Caller ID');
    case McpClientContextKey.USER_NAME:
      return t('Caller name');
    case McpClientContextKey.CLIENT_NAME:
      return t('Client name');
  }
}

function credentialModeLabel(mode: McpCredentialMode): string {
  switch (mode) {
    case McpCredentialMode.DEVELOPER:
      return t('Fixed connection set by the developer');
    case McpCredentialMode.CONSUMER:
      return t('Configured by whoever obtains the service');
    case McpCredentialMode.USER:
      return t('Authorized by the calling user on first use');
  }
}

function credentialModeDescription(mode: McpCredentialMode): string {
  switch (mode) {
    case McpCredentialMode.DEVELOPER:
      return t(
        'Every call uses the connection you choose here. Good for read-only queries or a shared service account.',
      );
    case McpCredentialMode.CONSUMER:
      return t(
        'Each team that obtains this service chooses its own connection.',
      );
    case McpCredentialMode.USER:
      return t(
        'The first time a user calls a tool that needs this connector, the client prompts them to pick their own account here.',
      );
  }
}

function toolErrors({
  tool,
  siblingNames,
}: {
  tool: Pick<McpServiceTool, 'name' | 'title' | 'description' | 'params'>;
  siblingNames: string[];
}): ToolFieldErrors {
  const name = tool.name.trim();
  const errors: ToolFieldErrors = {};
  if (!name) {
    errors.name = 'required';
  } else if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    errors.name = 'mcpToolNameInvalidPattern';
  } else if (name.length > 64) {
    errors.name = 'mcpToolNameTooLong';
  } else if (siblingNames.includes(name)) {
    errors.name = 'mcpToolNameDuplicateInService';
  }
  if (!tool.title.trim()) {
    errors.title = 'required';
  }
  if (!tool.description.trim()) {
    errors.description = 'required';
  }
  const paramNames = tool.params.map((param) => param.name);
  const paramErrors: Record<string, string> = {};
  for (const param of tool.params) {
    const value = (param.value ?? '').trim();
    if (param.mode === McpToolParamMode.FIXED && !value) {
      paramErrors[param.name] = 'mcpToolParamFixedValueRequired';
      continue;
    }
    if (param.mode === McpToolParamMode.REFERENCE) {
      if (!value) {
        paramErrors[param.name] = 'mcpToolParamReferenceValueRequired';
        continue;
      }
      const refs = mcpServiceUtils.referencedParams(value);
      if (refs.length === 0) {
        paramErrors[param.name] = 'mcpToolParamReferenceNeedsTarget';
        continue;
      }
      if (refs.includes(param.name)) {
        paramErrors[param.name] = 'mcpToolParamReferenceSelf';
        continue;
      }
      const missing = refs.find((ref) => !paramNames.includes(ref));
      if (missing) {
        paramErrors[param.name] = 'mcpToolParamReferenceMissingTarget';
        continue;
      }
      const refersToReference = refs.some((ref) => {
        const referenced = tool.params.find(
          (candidate) => candidate.name === ref,
        );
        return referenced?.mode === McpToolParamMode.REFERENCE;
      });
      if (refersToReference) {
        paramErrors[param.name] = 'mcpToolParamReferenceChained';
      }
    }
  }
  if (Object.keys(paramErrors).length > 0) {
    errors.params = paramErrors;
  }
  return errors;
}

function hasToolErrors(errors: ToolFieldErrors): boolean {
  return Boolean(
    errors.name ??
      errors.title ??
      errors.description ??
      (errors.params && Object.keys(errors.params).length > 0),
  );
}

function issueMessage(issue: McpServiceIssue): string {
  const toolLabel = issue.toolName ?? '';
  switch (issue.code) {
    case McpServiceIssueCode.NO_TOOLS:
      return t(
        'No tools yet. AI assistants that connect will see no capabilities.',
      );
    case McpServiceIssueCode.TOOL_NAME_INVALID:
      return t(
        'Tool "{name}" has a name that does not follow the naming rules',
        {
          name: toolLabel,
        },
      );
    case McpServiceIssueCode.TOOL_NAME_DUPLICATE:
      return t('Tool "{name}" has the same name as another tool', {
        name: toolLabel,
      });
    case McpServiceIssueCode.TOOL_DESCRIPTION_MISSING:
      return t('Tool "{name}" has no description', { name: toolLabel });
    case McpServiceIssueCode.TOOL_DESCRIPTION_SHORT:
      return t(
        'Tool "{name}" has a very short description; the AI may not pick it correctly',
        { name: toolLabel },
      );
    case McpServiceIssueCode.TOOL_PARAM_INCOMPLETE:
      return t('Tool "{name}" has params that are not fully filled in', {
        name: toolLabel,
      });
    case McpServiceIssueCode.TOOL_PARAMS_OUT_OF_SYNC:
      return t(
        'Tool "{name}" has params that no longer match its source; open it and save once to sync',
        { name: toolLabel },
      );
    case McpServiceIssueCode.SOURCE_WORKFLOW_MISSING:
      return t('Tool "{name}": the source workflow was deleted', {
        name: toolLabel,
      });
    case McpServiceIssueCode.SOURCE_WORKFLOW_NOT_PUBLISHED:
      return t('Tool "{name}": the source workflow is not published', {
        name: toolLabel,
      });
    case McpServiceIssueCode.SOURCE_WORKFLOW_WRONG_TRIGGER:
      return t(
        'Tool "{name}": the source workflow no longer starts with a callable-workflow trigger',
        { name: toolLabel },
      );
    case McpServiceIssueCode.SOURCE_WORKFLOW_DISABLED:
      return t(
        'Tool "{name}": the source workflow is turned off, calls will fail',
        {
          name: toolLabel,
        },
      );
    case McpServiceIssueCode.SOURCE_CONNECTOR_MISSING:
      return t(
        'Tool "{name}": the source connector no longer exists or was removed',
        {
          name: toolLabel,
        },
      );
    case McpServiceIssueCode.SOURCE_ACTION_MISSING:
      return t('Tool "{name}": this action no longer exists on the connector', {
        name: toolLabel,
      });
    case McpServiceIssueCode.FIXED_CONNECTION_MISSING:
      return t('{connector}: choose a fixed connection', {
        connector: issue.connectorName ?? '',
      });
    case McpServiceIssueCode.FIXED_CONNECTION_NOT_USABLE:
      return t(
        '{connector}: this connection was not shared with the service owner',
        {
          connector: issue.connectorName ?? '',
        },
      );
    case McpServiceIssueCode.FIXED_CONNECTION_BROKEN:
      return t('{connector}: this connection is broken, calls will fail', {
        connector: issue.connectorName ?? '',
      });
    case McpServiceIssueCode.AVAILABILITY_EMPTY:
      return t(
        'Availability is set to specific members, but nobody is selected yet',
      );
    default:
      return issue.detail ?? issue.code;
  }
}

function issueTargetTab(
  issue: McpServiceIssue,
): 'tools' | 'connections' | 'availability' | null {
  if (!isNil(issue.toolId)) {
    return 'tools';
  }
  switch (issue.code) {
    case McpServiceIssueCode.FIXED_CONNECTION_MISSING:
    case McpServiceIssueCode.FIXED_CONNECTION_NOT_USABLE:
    case McpServiceIssueCode.FIXED_CONNECTION_BROKEN:
      return 'connections';
    case McpServiceIssueCode.AVAILABILITY_EMPTY:
      return 'availability';
    default:
      return null;
  }
}

function availabilityModeLabel(mode: McpAvailabilityMode): string {
  return mode === McpAvailabilityMode.ALL
    ? t('Everyone')
    : t('Specific members');
}

export const mcpServiceUiUtils = {
  buildToolDraft,
  workflowCandidateBlockedReason,
  toolNameFor,
  paramModeLabel,
  contextKeyLabel,
  credentialModeLabel,
  credentialModeDescription,
  toolErrors,
  hasToolErrors,
  issueMessage,
  issueTargetTab,
  availabilityModeLabel,
};

export type ToolFieldErrors = {
  name?: string;
  title?: string;
  description?: string;
  params?: Record<string, string>;
};

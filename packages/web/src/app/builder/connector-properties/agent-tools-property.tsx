import { useFormContext, useWatch } from 'react-hook-form';

import {
  AgentToolsEditor,
  AgentToolsState,
  agentToolsUtils,
} from '@/features/mcp-servers';
import { authenticationSession } from '@/lib/authentication-session';

export function AgentToolsProperty({
  inputName,
  disabled,
}: {
  inputName: string;
  disabled: boolean;
}) {
  const form = useFormContext();
  const prefix = inputName.slice(
    0,
    inputName.length - AGENT_TOOLS_TARGET.propertyName.length,
  );
  const [mcpServers, allowedTools, confirmTools, confirmWrites] = useWatch({
    control: form.control,
    name: [
      `${prefix}mcpServers`,
      `${prefix}allowedTools`,
      `${prefix}confirmTools`,
      `${prefix}confirmWrites`,
    ],
  });
  const state = agentToolsUtils.stateOfInput({
    mcpServers,
    allowedTools,
    confirmTools,
  });
  const handleChange = (next: AgentToolsState) => {
    const input = agentToolsUtils.entriesToInput({ state: next });
    const options = { shouldDirty: true, shouldValidate: true };
    form.setValue(`${prefix}mcpServers`, input.mcpServers, options);
    form.setValue(`${prefix}allowedTools`, input.allowedTools, options);
    form.setValue(`${prefix}confirmTools`, input.confirmTools, options);
  };
  return (
    <AgentToolsEditor
      state={state}
      confirmWrites={confirmWrites !== false}
      projectId={authenticationSession.getProjectId() ?? ''}
      disabled={disabled}
      onChange={handleChange}
    />
  );
}

export const AGENT_TOOLS_TARGET = {
  connectorName: '@fema-ipaas/connector-ai',
  actionName: 'run_agent',
  propertyName: 'mcpServers',
  hiddenPropertyNames: ['allowedTools', 'confirmTools'],
};

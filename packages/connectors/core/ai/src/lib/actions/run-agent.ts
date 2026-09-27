import {
  createAction,
  ExecutionType,
  Property,
  StoreScope,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { aiAuth } from '../auth';
import { agentLoop, AgentState } from '../common/agent-loop';
import { approvalClient } from '../common/approval-client';
import { agentToolbox, ConnectedServer } from '../common/agent-toolbox';
import { mcpClient } from '../common/mcp-client';
import { modelClient } from '../common/model-client';
import { textUtils } from '../common/text';

export const runAgent = createAction({
  auth: aiAuth,
  name: 'run_agent',
  displayName: 'AI agent',
  description: 'Let the model work towards a goal by calling tools of MCP servers',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Runs a tool-using agent: the model of the connection works towards the instructions and may call the tools of the listed MCP servers, limited to the allowed tools and a maximum number of steps. Tool calls can have side effects.',
    idempotent: false,
  },
  props: {
    instructions: Property.LongText({
      displayName: 'Instructions',
      description: 'The goal of the agent and the rules it must follow',
      required: true,
    }),
    input: Property.LongText({
      displayName: 'Input',
      description: 'Data for this run, e.g. the record to process',
      required: false,
    }),
    mcpServers: Property.Array({
      displayName: 'MCP servers',
      description: 'Servers whose tools the agent may call',
      required: false,
      properties: {
        url: Property.ShortText({
          displayName: 'Server URL',
          description: 'The Streamable HTTP endpoint of the MCP server',
          required: true,
        }),
        authorization: Property.ShortText({
          displayName: 'Authorization',
          description:
            "Optional Authorization header value. You can reference a connection, e.g. {{connections['my-mcp'].props.token}}",
          required: false,
        }),
      },
    }),
    allowedTools: Property.Array({
      displayName: 'Allowed tools',
      description: 'When set, only these tool names are offered to the model',
      required: false,
    }),
    maxSteps: Property.Number({
      displayName: 'Max steps',
      description: 'How many rounds of tool calls the agent may make before it stops (1 to 20)',
      required: false,
      defaultValue: 6,
    }),
    confirmWrites: Property.Checkbox({
      displayName: 'Ask before write actions',
      description:
        'Pause the run and ask a person before calling tools whose names look like writes (create, send, update, delete…). Turning this off lets the agent change other systems on its own.',
      required: false,
      defaultValue: true,
    }),
    confirmTools: Property.Array({
      displayName: 'Always ask before these tools',
      description: 'Tool names that always need a person to approve the call',
      required: false,
    }),
    approvalTimeoutHours: Property.StaticDropdown({
      displayName: 'Approval timeout',
      description: 'Calls nobody approves in time are rejected automatically',
      required: false,
      defaultValue: 4,
      options: {
        disabled: false,
        options: [
          { label: '1 hour', value: 1 },
          { label: '4 hours', value: 4 },
          { label: '24 hours', value: 24 },
        ],
      },
    }),
  },
  async run(context) {
    const config = modelClient.configOf(context.auth.props);
    const servers = await Promise.all(
      parseServers(context.propsValue.mcpServers).map(connectServer),
    );
    const toolbox = agentToolbox.build({
      servers,
      allowedTools: parseToolNames(context.propsValue.allowedTools),
    });
    const confirmTools = parseToolNames(context.propsValue.confirmTools);
    const settings = {
      config,
      system: textUtils.asText(context.propsValue.instructions),
      toolbox,
      maxSteps: textUtils.clamp({
        value: context.propsValue.maxSteps,
        min: 1,
        max: MAX_STEPS_LIMIT,
        fallback: DEFAULT_MAX_STEPS,
      }),
      needsApproval: (toolName: string) =>
        approvalClient.needsApproval({
          toolName,
          confirmWrites: context.propsValue.confirmWrites !== false,
          confirmTools,
        }),
    };
    const stateKey = `agent-state:${context.run.id}:${context.step.name}`;
    const saved =
      context.executionType === ExecutionType.RESUME
        ? await context.store.get<SavedState>(stateKey, StoreScope.WORKFLOW)
        : null;
    if (context.executionType === ExecutionType.RESUME && saved === null) {
      throw new Error('The saved agent state is missing, so the run cannot continue');
    }
    const input = textUtils.asText(context.propsValue.input);
    const result =
      saved === null
        ? await agentLoop.run({ ...settings, input: textUtils.isBlank(input) ? DEFAULT_INPUT : input })
        : await agentLoop.resume({
            ...settings,
            state: saved.state,
            decision: approvalClient.parseDecision(
              context.executionType === ExecutionType.RESUME ? context.resumePayload.body : null,
            ),
          });
    const reported = saved?.reportedUsage ?? { inputTokens: 0, outputTokens: 0 };
    const usage = result.kind === 'DONE' ? result.usage : result.state.usage;
    const unreported = {
      inputTokens: Math.max(0, usage.inputTokens - reported.inputTokens),
      outputTokens: Math.max(0, usage.outputTokens - reported.outputTokens),
    };
    if (unreported.inputTokens + unreported.outputTokens > 0) {
      await modelClient.reportUsage({
        context,
        feature: 'AGENT',
        provider: config.provider,
        model: config.model,
        usage: unreported,
      });
    }
    if (result.kind === 'NEEDS_APPROVAL') {
      const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' });
      await context.store.put<SavedState>(
        stateKey,
        { state: compact(result.state), reportedUsage: usage },
        StoreScope.WORKFLOW,
      );
      const approvalId = await approvalClient.request({
        apiUrl: context.server.apiUrl,
        token: context.server.token,
        body: {
          executionId: context.run.id,
          stepName: context.step.name,
          waitpointId: waitpoint.id,
          tool: result.call.name,
          arguments: result.call.arguments,
          message: textUtils.truncate({ text: result.message, limit: MESSAGE_LIMIT }),
          timeoutHours: Number(context.propsValue.approvalTimeoutHours ?? DEFAULT_TIMEOUT_HOURS),
        },
      });
      context.run.waitForWaitpoint(waitpoint.id);
      return {
        status: 'WAITING_FOR_APPROVAL',
        approvalId,
        tool: result.call.name,
        steps: result.state.steps,
      };
    }
    await context.store.delete(stateKey, StoreScope.WORKFLOW);
    if (result.error !== null) {
      throw result.error;
    }
    return {
      answer: result.answer,
      steps: result.steps,
      usage: result.usage,
      stoppedEarly: result.stoppedEarly,
    };
  },
});

function compact(state: AgentState): AgentState {
  if (JSON.stringify(state).length <= MAX_STATE_CHARS) {
    return state;
  }
  return {
    ...state,
    messages: state.messages.map((message) => ({
      ...message,
      content: message.content.map((block) =>
        block.type === 'tool_result'
          ? { ...block, content: textUtils.truncate({ text: block.content, limit: COMPACT_RESULT_LIMIT }) }
          : block,
      ),
    })),
  };
}

async function connectServer(server: ServerInput): Promise<ConnectedServer> {
  const { data, error } = await tryCatch(async () => {
    const session = await mcpClient.connect(server);
    const tools = await mcpClient.listTools({ session });
    return { session, tools };
  });
  if (error !== null) {
    throw new Error(`Could not load the tools of MCP server ${server.url}: ${error.message}`);
  }
  return data;
}

function parseServers(value: unknown): ServerInput[] {
  const parsed = ServerList.safeParse(value ?? []);
  if (!parsed.success) {
    throw new Error('Each MCP server needs a URL');
  }
  return parsed.data.flatMap((server) =>
    textUtils.isBlank(server.url)
      ? []
      : [{ url: server.url.trim(), authorization: server.authorization ?? undefined }],
  );
}

function parseToolNames(value: unknown): string[] {
  const parsed = AllowedToolList.safeParse(value ?? []);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.flatMap((item) => {
    const name = textUtils.asText(item).trim();
    return name.length > 0 ? [name] : [];
  });
}

const DEFAULT_MAX_STEPS = 6;
const DEFAULT_TIMEOUT_HOURS = 4;
const MESSAGE_LIMIT = 2000;
const MAX_STATE_CHARS = 400_000;
const COMPACT_RESULT_LIMIT = 2000;
const MAX_STEPS_LIMIT = 20;
const DEFAULT_INPUT = 'Start the task.';

const ServerList = z.array(
  z.object({
    url: z.string(),
    authorization: z.string().nullish(),
  }),
);

const AllowedToolList = z.array(z.union([z.string(), z.number()]));

type SavedState = {
  state: AgentState;
  reportedUsage: { inputTokens: number; outputTokens: number };
};

type ServerInput = {
  url: string;
  authorization: string | undefined;
};

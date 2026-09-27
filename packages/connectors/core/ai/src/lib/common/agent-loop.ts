import {
  LlmConfig,
  LlmContent,
  LlmMessage,
  LlmUsage,
  llmWire,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import { AgentToolbox } from './agent-toolbox';
import { mcpClient } from './mcp-client';
import { modelClient } from './model-client';
import { textUtils } from './text';

export const agentLoop = {
  run,
  resume,
};

async function run({
  config,
  system,
  input,
  toolbox,
  maxSteps,
  needsApproval,
}: AgentRunParams): Promise<AgentResult> {
  return turn({
    config,
    system,
    toolbox,
    maxSteps,
    needsApproval,
    messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
    steps: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    round: 0,
  });
}

async function resume({
  config,
  system,
  toolbox,
  maxSteps,
  needsApproval,
  state,
  decision,
}: AgentResumeParams): Promise<AgentResult> {
  const [call, ...rest] = state.pending.calls;
  if (call === undefined) {
    return finishBatch({ config, system, toolbox, maxSteps, needsApproval, state, results: state.pending.results });
  }
  const decided = decision.approved
    ? await executeCall({ call, toolbox })
    : executedCall({ call, text: rejectionText(decision), isError: true });
  return processBatch({
    config,
    system,
    toolbox,
    maxSteps,
    needsApproval,
    state: { ...state, pending: { ...state.pending, calls: rest, results: [...state.pending.results, decided] } },
  });
}

async function turn({
  config,
  system,
  toolbox,
  maxSteps,
  needsApproval,
  messages,
  steps,
  usage,
  round,
}: TurnParams): Promise<AgentResult> {
  const { data: response, error } = await tryCatch(() =>
    modelClient.call({
      config,
      system,
      messages,
      tools: toolbox.tools,
      maxTokens: AGENT_MAX_TOKENS,
    }),
  );
  if (error !== null) {
    return done({ answer: '', steps, usage, stoppedEarly: false, error });
  }
  const totalUsage = {
    inputTokens: usage.inputTokens + response.usage.inputTokens,
    outputTokens: usage.outputTokens + response.usage.outputTokens,
  };
  const calls = response.content.flatMap((block) => (block.type === 'tool_call' ? [block] : []));
  const answer = llmWire.textOf(response);
  if (calls.length === 0 || round >= maxSteps) {
    return done({ answer, steps, usage: totalUsage, stoppedEarly: calls.length > 0, error: null });
  }
  return processBatch({
    config,
    system,
    toolbox,
    maxSteps,
    needsApproval,
    state: {
      messages,
      steps,
      usage: totalUsage,
      round,
      pending: {
        assistant: response.content.filter((block) => block.type !== 'text' || block.text.length > 0),
        calls,
        results: [],
      },
    },
  });
}

async function processBatch({ state, ...rest }: BatchParams): Promise<AgentResult> {
  const [call, ...remaining] = state.pending.calls;
  if (call === undefined) {
    return finishBatch({ ...rest, state, results: state.pending.results });
  }
  const route = rest.toolbox.routes.get(call.name);
  if (route !== undefined && route.allowed && rest.needsApproval(route.name)) {
    return {
      kind: 'NEEDS_APPROVAL',
      state,
      call: { id: call.id, name: call.name, arguments: call.arguments },
      message: textOf(state.pending.assistant),
    };
  }
  const executed = await executeCall({ call, toolbox: rest.toolbox });
  return processBatch({
    ...rest,
    state: { ...state, pending: { ...state.pending, calls: remaining, results: [...state.pending.results, executed] } },
  });
}

async function finishBatch({ state, results, ...rest }: BatchParams & { results: ExecutedCall[] }): Promise<AgentResult> {
  return turn({
    ...rest,
    messages: [
      ...state.messages,
      { role: 'assistant', content: state.pending.assistant },
      { role: 'user', content: results.map((item) => item.block) },
    ],
    steps: [...state.steps, ...results.map((item) => item.step)],
    usage: state.usage,
    round: state.round + 1,
  });
}

function done(outcome: AgentOutcome): AgentResult {
  return { kind: 'DONE', ...outcome };
}

function rejectionText(decision: AgentDecision): string {
  if (decision.expired) {
    return 'Nobody approved this call in time, so it was not run. Continue without it or explain what is needed.';
  }
  return `A person rejected this call${decision.comment ? `: ${decision.comment}` : ''}. Do not retry it; continue without it or explain what is needed.`;
}

function textOf(content: LlmContent[]): string {
  return content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim();
}

async function executeCall({
  call,
  toolbox,
}: {
  call: ToolCall;
  toolbox: AgentToolbox;
}): Promise<ExecutedCall> {
  const route = toolbox.routes.get(call.name);
  if (route === undefined) {
    return executedCall({ call, text: `Tool ${call.name} does not exist`, isError: true });
  }
  if (!route.allowed) {
    return executedCall({
      call,
      text: `Tool ${call.name} is not in the allowed tools of this step`,
      isError: true,
    });
  }
  const { data, error } = await tryCatch(() =>
    mcpClient.callTool({ session: route.session, name: route.name, args: call.arguments }),
  );
  if (error !== null) {
    return executedCall({ call, text: error.message, isError: true });
  }
  const text =
    data.text.length > 0 || data.structured === null ? data.text : JSON.stringify(data.structured);
  return executedCall({ call, text, isError: data.isError });
}

function executedCall({
  call,
  text,
  isError,
}: {
  call: ToolCall;
  text: string;
  isError: boolean;
}): ExecutedCall {
  const content = text.length > 0 ? text : EMPTY_RESULT;
  return {
    block: {
      type: 'tool_result',
      toolCallId: call.id,
      content: textUtils.truncate({ text: content, limit: MODEL_RESULT_LIMIT }),
      isError,
    },
    step: {
      tool: call.name,
      arguments: call.arguments,
      result: textUtils.truncate({ text: content, limit: STEP_RESULT_LIMIT }),
      isError,
    },
  };
}

const AGENT_MAX_TOKENS = 4096;
const MODEL_RESULT_LIMIT = 20000;
const STEP_RESULT_LIMIT = 2000;
const EMPTY_RESULT = '(no output)';

export type ToolCall = Extract<LlmContent, { type: 'tool_call' }>;

export type ExecutedCall = {
  block: LlmContent;
  step: AgentStep;
};

type LoopSettings = {
  config: LlmConfig;
  system: string;
  toolbox: AgentToolbox;
  maxSteps: number;
  needsApproval: (toolName: string) => boolean;
};

type TurnParams = LoopSettings & {
  messages: LlmMessage[];
  steps: AgentStep[];
  usage: LlmUsage;
  round: number;
};

type BatchParams = LoopSettings & {
  state: AgentState;
};

export type AgentRunParams = LoopSettings & {
  input: string;
};

export type AgentResumeParams = LoopSettings & {
  state: AgentState;
  decision: AgentDecision;
};

export type AgentDecision = {
  approved: boolean;
  expired: boolean;
  comment: string | null;
};

export type AgentState = {
  messages: LlmMessage[];
  steps: AgentStep[];
  usage: LlmUsage;
  round: number;
  pending: {
    assistant: LlmContent[];
    calls: ToolCall[];
    results: ExecutedCall[];
  };
};

export type AgentResult =
  | ({ kind: 'DONE' } & AgentOutcome)
  | {
      kind: 'NEEDS_APPROVAL';
      state: AgentState;
      call: { id: string; name: string; arguments: Record<string, unknown> };
      message: string;
    };

export type AgentStep = {
  tool: string;
  arguments: Record<string, unknown>;
  result: string;
  isError: boolean;
};

export type AgentOutcome = {
  answer: string;
  steps: AgentStep[];
  usage: LlmUsage;
  stoppedEarly: boolean;
  error: Error | null;
};

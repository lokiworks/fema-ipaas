import {
  AuthenticationType,
  httpClient,
  HttpMethod,
} from '@fema-ipaas/connector-common';
import { z } from 'zod';

export const approvalClient = {
  request,
  parseDecision,
  needsApproval,
};

async function request({
  apiUrl,
  token,
  body,
}: RequestParams): Promise<string> {
  const response = await httpClient.sendRequest<unknown>({
    method: HttpMethod.POST,
    url: `${apiUrl.replace(/\/$/, '')}/v1/worker/agent-approvals`,
    authentication: { type: AuthenticationType.BEARER_TOKEN, token },
    body,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const parsed = CreatedApproval.safeParse(response.body);
  if (!parsed.success) {
    throw new Error('The platform did not accept the approval request');
  }
  return parsed.data.id;
}

function parseDecision(body: unknown): Decision {
  const parsed = DecisionShape.safeParse(body);
  if (!parsed.success) {
    throw new Error('The run was resumed without an approval decision');
  }
  return parsed.data;
}

function needsApproval({
  toolName,
  confirmWrites,
  confirmTools,
}: {
  toolName: string;
  confirmWrites: boolean;
  confirmTools: string[];
}): boolean {
  const words = toolName
    .split(/[_\-.\s]|(?=[A-Z])/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0);
  return (
    confirmTools.includes(toolName) ||
    (confirmWrites && words.some((word) => WRITE_VERBS.includes(word)))
  );
}

const REQUEST_TIMEOUT_MS = 10_000;
const WRITE_VERBS = ['create', 'add', 'send', 'update', 'delete', 'remove', 'post', 'put', 'patch', 'write', 'set', 'insert', 'upsert', 'cancel', 'approve', 'submit', 'transfer', 'pay', 'publish', 'reply', 'invite', 'assign'];

const CreatedApproval = z.object({ id: z.string() });

const DecisionShape = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
  expired: z.boolean(),
  comment: z.string().nullable(),
});

type RequestParams = {
  apiUrl: string;
  token: string;
  body: {
    executionId: string;
    stepName: string;
    waitpointId: string;
    tool: string;
    arguments: Record<string, unknown>;
    message: string;
    timeoutHours: number;
  };
};

export type Decision = z.infer<typeof DecisionShape>;

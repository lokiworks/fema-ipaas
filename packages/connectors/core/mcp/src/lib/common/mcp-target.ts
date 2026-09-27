import { z } from 'zod';

export const mcpTarget = {
  fromAuth,
};

function fromAuth(auth: unknown): McpTarget {
  const oauth = OAuthAuthValue.safeParse(auth);
  if (oauth.success) {
    return {
      url: oauth.data.props.url.trim(),
      transport: transportOf(oauth.data.props.transport),
      authType: McpAuthType.OAUTH2,
      authorization: oauth.data.access_token.length > 0 ? `Bearer ${oauth.data.access_token}` : undefined,
    };
  }
  const custom = CustomAuthValue.safeParse(auth);
  if (!custom.success) {
    throw new Error('The MCP server connection is missing its server address');
  }
  const token = custom.data.props.token?.trim() ?? '';
  const authType = custom.data.props.authType === McpAuthType.NONE || token.length === 0 ? McpAuthType.NONE : McpAuthType.BEARER;
  return {
    url: custom.data.props.url.trim(),
    transport: transportOf(custom.data.props.transport),
    authType,
    authorization: authType === McpAuthType.BEARER ? token : undefined,
  };
}

function transportOf(value: string | null | undefined): McpTransport {
  return value === McpTransport.SSE ? McpTransport.SSE : McpTransport.STREAMABLE_HTTP;
}

export enum McpTransport {
  STREAMABLE_HTTP = 'streamable_http',
  SSE = 'sse',
}

export enum McpAuthType {
  NONE = 'none',
  BEARER = 'bearer',
  OAUTH2 = 'oauth2',
}

const OAuthAuthValue = z.object({
  access_token: z.string(),
  props: z.object({
    url: z.string().min(1),
    transport: z.string().nullish(),
  }),
});

const CustomAuthValue = z.object({
  props: z.object({
    url: z.string().min(1),
    transport: z.string().nullish(),
    authType: z.string().nullish(),
    token: z.string().nullish(),
  }),
});

export type McpTarget = {
  url: string;
  transport: McpTransport;
  authType: McpAuthType;
  authorization: string | undefined;
};

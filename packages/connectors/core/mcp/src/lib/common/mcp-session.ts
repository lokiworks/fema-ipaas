import { mcpClient, McpSession } from './mcp-client';
import { mcpTarget } from './mcp-target';

export const mcpSession = {
  run,
};

async function run<T>({ auth, fn }: { auth: unknown; fn: (session: McpSession) => Promise<T> }): Promise<T> {
  const target = mcpTarget.fromAuth(auth);
  const session = await mcpClient.connect({ target }).catch((error: unknown) => {
    throw new Error(mcpClient.describeFailure({ url: target.url, error }));
  });
  try {
    return await fn(session).catch((error: unknown) => {
      throw new Error(mcpClient.describeFailure({ url: target.url, error }));
    });
  }
  finally {
    await mcpClient.close({ session });
  }
}

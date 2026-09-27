import { createAction, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { mcpAuth } from '../auth';
import { mcpClient } from '../common/mcp-client';

export const callTool = createAction({
  auth: mcpAuth,
  name: 'call_tool',
  displayName: 'Call tool',
  description: 'Call one tool of the MCP server and use its result',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Calls a tool of the connected MCP server with the given arguments and returns its text and structured result. The step fails when the tool reports an error. Tools can have side effects.',
    idempotent: false,
  },
  props: {
    tool: Property.Dropdown({
      auth: mcpAuth,
      displayName: 'Tool',
      description: 'The tool to call, as listed by the MCP server',
      required: true,
      refreshers: ['auth'],
      options: async ({ auth }) => {
        if (!auth) {
          return {
            disabled: true,
            placeholder: 'Connect an MCP server first',
            options: [],
          };
        }
        const { data, error } = await tryCatch(async () => {
          const session = await mcpClient.connect({
            url: auth.props.url,
            authorization: auth.props.token,
          });
          return mcpClient.listTools({ session });
        });
        if (error !== null) {
          return { disabled: true, placeholder: error.message, options: [] };
        }
        return {
          disabled: false,
          options: data.map((tool) => ({
            label: tool.name,
            value: tool.name,
            description: tool.description,
          })),
        };
      },
    }),
    arguments: Property.Json({
      displayName: 'Arguments',
      description: "The tool's arguments as a JSON object, following the tool's input schema",
      required: false,
      defaultValue: {},
    }),
  },
  async run(context) {
    const name = context.propsValue.tool;
    const session = await mcpClient.connect({
      url: context.auth.props.url,
      authorization: context.auth.props.token,
    });
    const result = await mcpClient.callTool({
      session,
      name,
      args: parseArguments(context.propsValue.arguments),
    });
    if (result.isError) {
      throw new Error(
        result.text.length > 0 ? result.text : `Tool ${name} returned an error`,
      );
    }
    return result;
  },
});

function parseArguments(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  const candidate = typeof value === 'string' ? safeJson(value) : value;
  const parsed = ArgumentsObject.safeParse(candidate);
  if (!parsed.success) {
    throw new Error('Arguments must be a JSON object');
  }
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

const ArgumentsObject = z.record(z.string(), z.unknown());

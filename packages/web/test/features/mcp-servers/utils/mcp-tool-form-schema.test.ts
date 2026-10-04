import { describe, expect, it } from 'vitest';

import {
  ToolArgumentsMode,
  ToolFieldIssueCode,
  ToolFieldKind,
  mcpToolFormUtils,
} from '@/features/mcp-servers/utils/mcp-tool-form-schema';

const ticketSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Ticket title', minLength: 3 },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    estimate: { type: 'integer', minimum: 1, maximum: 40 },
    ratio: { type: 'number' },
    urgent: { type: 'boolean' },
    labels: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    assignee: {
      type: 'object',
      properties: {
        id: { type: 'string', title: 'Employee id' },
        department: { type: 'string' },
      },
      required: ['id'],
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, size: { type: 'number' } },
        required: ['url'],
      },
    },
    extra: { type: 'object' },
    either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  },
  required: ['title', 'assignee'],
};

function nodes() {
  return mcpToolFormUtils.parseSchema(ticketSchema);
}

describe('mcpToolFormUtils.parseSchema', () => {
  it('maps every schema type to a field kind and keeps required, description and title', () => {
    const byKey = Object.fromEntries(nodes().map((node) => [node.key, node]));
    expect(byKey['title']).toMatchObject({
      kind: ToolFieldKind.STRING,
      required: true,
      description: 'Ticket title',
    });
    expect(byKey['priority']).toMatchObject({
      kind: ToolFieldKind.ENUM,
      options: [
        { value: 'low', label: 'low' },
        { value: 'normal', label: 'normal' },
        { value: 'high', label: 'high' },
      ],
    });
    expect(byKey['estimate'].kind).toBe(ToolFieldKind.INTEGER);
    expect(byKey['ratio'].kind).toBe(ToolFieldKind.NUMBER);
    expect(byKey['urgent'].kind).toBe(ToolFieldKind.BOOLEAN);
    expect(byKey['labels']).toMatchObject({
      kind: ToolFieldKind.ARRAY,
      item: { kind: ToolFieldKind.STRING },
    });
    expect(byKey['assignee'].kind).toBe(ToolFieldKind.OBJECT);
    expect(
      byKey['assignee'].properties?.map((property) => property.key),
    ).toEqual(['id', 'department']);
    expect(byKey['assignee'].properties?.[0]).toMatchObject({
      label: 'Employee id',
      required: true,
    });
    expect(byKey['attachments'].item?.kind).toBe(ToolFieldKind.OBJECT);
  });

  it('falls back to JSON for free-form objects and unions', () => {
    const byKey = Object.fromEntries(nodes().map((node) => [node.key, node]));
    expect(byKey['extra'].kind).toBe(ToolFieldKind.JSON);
    expect(byKey['either'].kind).toBe(ToolFieldKind.JSON);
  });

  it('treats a nullable type as the type itself', () => {
    const parsed = mcpToolFormUtils.parseSchema({
      type: 'object',
      properties: {
        note: { type: ['string', 'null'] },
        count: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      },
    });
    expect(parsed.map((node) => node.kind)).toEqual([
      ToolFieldKind.STRING,
      ToolFieldKind.INTEGER,
    ]);
  });

  it('falls back to JSON beyond the nesting depth', () => {
    const level = (inner: unknown) => ({
      type: 'object',
      properties: { next: inner },
    });
    const deep = level(
      level(
        level(
          level({ type: 'object', properties: { leaf: { type: 'string' } } }),
        ),
      ),
    );
    const parsed = mcpToolFormUtils.parseSchema(deep);
    const third = parsed[0].properties?.[0].properties?.[0];
    const fourth = third?.properties?.[0];
    expect(third?.kind).toBe(ToolFieldKind.OBJECT);
    expect(fourth?.kind).toBe(ToolFieldKind.JSON);
  });

  it('returns no fields when the schema has no properties', () => {
    expect(mcpToolFormUtils.parseSchema(undefined)).toEqual([]);
    expect(mcpToolFormUtils.parseSchema({})).toEqual([]);
  });
});

describe('mcpToolFormUtils.resolve in form mode', () => {
  it('builds typed arguments and leaves optional empties out', () => {
    const parsed = nodes();
    const state = mcpToolFormUtils.initialState(parsed);
    const filled = {
      ...state,
      drafts: {
        ...state.drafts,
        title: '新员工电脑申请',
        priority: 'high',
        estimate: '8',
        urgent: 'true',
        labels: ['it', 'onboarding'],
        assignee: { id: 'E1004', department: '' },
        attachments: [{ url: 'https://a/b.png', size: '12.5' }],
      },
    };
    const result = mcpToolFormUtils.resolve({ nodes: parsed, state: filled });
    expect(result).toEqual({
      ok: true,
      payload: {
        title: '新员工电脑申请',
        priority: 'high',
        estimate: 8,
        urgent: true,
        labels: ['it', 'onboarding'],
        assignee: { id: 'E1004' },
        attachments: [{ url: 'https://a/b.png', size: 12.5 }],
      },
    });
  });

  it('names the field of every problem, including nested and list positions', () => {
    const parsed = nodes();
    const state = mcpToolFormUtils.initialState(parsed);
    const broken = {
      ...state,
      drafts: {
        ...state.drafts,
        title: 'ab',
        estimate: '99',
        ratio: 'abc',
        labels: ['a', 'b', 'c', 'd'],
        assignee: { id: '', department: '' },
        attachments: [{ url: '', size: '' }],
        extra: '{oops',
      },
    };
    const result = mcpToolFormUtils.resolve({ nodes: parsed, state: broken });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const found = result.issues.map((issue) => `${issue.path}:${issue.code}`);
    expect(found).toEqual(
      expect.arrayContaining([
        `ratio:${ToolFieldIssueCode.NOT_A_NUMBER}`,
        `assignee.id:${ToolFieldIssueCode.REQUIRED}`,
        `attachments[1].url:${ToolFieldIssueCode.REQUIRED}`,
        `extra:${ToolFieldIssueCode.INVALID_JSON}`,
        `title:${ToolFieldIssueCode.TOO_SHORT}`,
        `estimate:${ToolFieldIssueCode.TOO_LARGE}`,
        `labels:${ToolFieldIssueCode.TOO_MANY_ITEMS}`,
      ]),
    );
  });

  it('rejects a required field left empty', () => {
    const parsed = nodes();
    const result = mcpToolFormUtils.resolve({
      nodes: parsed,
      state: mcpToolFormUtils.initialState(parsed),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(['title', 'assignee.id']),
      );
    }
  });

  it('starts from the default values of the schema', () => {
    const parsed = mcpToolFormUtils.parseSchema({
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 10 },
        mode: { type: 'string', enum: ['a', 'b'], default: 'b' },
        strict: { type: 'boolean', default: false },
      },
    });
    const state = mcpToolFormUtils.initialState(parsed);
    expect(state.drafts).toEqual({ limit: '10', mode: 'b', strict: 'false' });
  });
});

describe('mcpToolFormUtils.switchMode', () => {
  it('carries the form into the JSON editor and back without losing data', () => {
    const parsed = nodes();
    const state = mcpToolFormUtils.initialState(parsed);
    const filled = {
      ...state,
      drafts: {
        ...state.drafts,
        title: '申请',
        assignee: { id: 'E1', department: 'IT' },
        labels: ['x'],
      },
    };
    const asJson = mcpToolFormUtils.switchMode({
      nodes: parsed,
      state: filled,
      mode: ToolArgumentsMode.JSON,
    });
    expect(JSON.parse(asJson.jsonText)).toEqual({
      title: '申请',
      assignee: { id: 'E1', department: 'IT' },
      labels: ['x'],
    });
    const back = mcpToolFormUtils.switchMode({
      nodes: parsed,
      state: asJson,
      mode: ToolArgumentsMode.FORM,
    });
    expect(back.mode).toBe(ToolArgumentsMode.FORM);
    expect(back.drafts['title']).toBe('申请');
    expect(back.drafts['assignee']).toEqual({ id: 'E1', department: 'IT' });
    expect(back.drafts['labels']).toEqual(['x']);
  });

  it('keeps fields the schema does not describe, so switching never drops them', () => {
    const parsed = nodes();
    const state = mcpToolFormUtils.initialState(parsed);
    const edited = {
      ...mcpToolFormUtils.switchMode({
        nodes: parsed,
        state,
        mode: ToolArgumentsMode.JSON,
      }),
      jsonText: '{"title":"abc","assignee":{"id":"E1"},"traceId":"t-1"}',
    };
    const form = mcpToolFormUtils.switchMode({
      nodes: parsed,
      state: edited,
      mode: ToolArgumentsMode.FORM,
    });
    const result = mcpToolFormUtils.resolve({ nodes: parsed, state: form });
    expect(result.payload).toMatchObject({ traceId: 't-1', title: 'abc' });
  });

  it('refuses to leave the JSON editor while the JSON is broken', () => {
    const parsed = nodes();
    const state = {
      ...mcpToolFormUtils.initialState(parsed),
      mode: ToolArgumentsMode.JSON,
      jsonText: '{"title": ',
    };
    const next = mcpToolFormUtils.switchMode({
      nodes: parsed,
      state,
      mode: ToolArgumentsMode.FORM,
    });
    expect(next.mode).toBe(ToolArgumentsMode.JSON);
    expect(next.switchError?.code).toBe(ToolFieldIssueCode.JSON_SYNTAX);
  });

  it('refuses a JSON value that is not an object', () => {
    const parsed = nodes();
    const state = {
      ...mcpToolFormUtils.initialState(parsed),
      mode: ToolArgumentsMode.JSON,
      jsonText: '[1,2]',
    };
    const next = mcpToolFormUtils.switchMode({
      nodes: parsed,
      state,
      mode: ToolArgumentsMode.FORM,
    });
    expect(next.switchError?.code).toBe(ToolFieldIssueCode.JSON_NOT_OBJECT);
  });
});

describe('mcpToolFormUtils.resolve in JSON mode', () => {
  function jsonState(text: string) {
    return {
      ...mcpToolFormUtils.initialState(nodes()),
      mode: ToolArgumentsMode.JSON,
      jsonText: text,
    };
  }

  it('accepts valid arguments', () => {
    const result = mcpToolFormUtils.resolve({
      nodes: nodes(),
      state: jsonState('{"title":"申请电脑","assignee":{"id":"E1"}}'),
    });
    expect(result.ok).toBe(true);
  });

  it('reports a syntax error with the reason', () => {
    const result = mcpToolFormUtils.resolve({
      nodes: nodes(),
      state: jsonState('{"title": }'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe(ToolFieldIssueCode.JSON_SYNTAX);
      expect(result.issues[0].params['detail']).toBeTruthy();
    }
  });

  it('checks the schema and names the field with the wrong type', () => {
    const result = mcpToolFormUtils.resolve({
      nodes: nodes(),
      state: jsonState(
        '{"title":123,"estimate":"8","urgent":"yes","priority":"urgent","assignee":{"id":7},"labels":"x"}',
      ),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const found = result.issues.map((issue) => `${issue.path}:${issue.code}`);
    expect(found).toEqual(
      expect.arrayContaining([
        `title:${ToolFieldIssueCode.NOT_A_STRING}`,
        `estimate:${ToolFieldIssueCode.NOT_A_NUMBER}`,
        `urgent:${ToolFieldIssueCode.NOT_A_BOOLEAN}`,
        `priority:${ToolFieldIssueCode.NOT_AN_OPTION}`,
        `assignee.id:${ToolFieldIssueCode.NOT_A_STRING}`,
        `labels:${ToolFieldIssueCode.NOT_AN_ARRAY}`,
      ]),
    );
  });

  it('reports missing required fields by name', () => {
    const result = mcpToolFormUtils.resolve({
      nodes: nodes(),
      state: jsonState('{}'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(['title', 'assignee']),
      );
    }
  });
});

describe('mcpToolFormUtils.messageOf', () => {
  it('names the field in the message', () => {
    expect(
      mcpToolFormUtils.messageOf({
        code: ToolFieldIssueCode.REQUIRED,
        path: 'assignee.id',
        params: {},
      }),
    ).toBe('assignee.id is required');
    expect(
      mcpToolFormUtils.messageOf({
        code: ToolFieldIssueCode.TOO_LARGE,
        path: 'estimate',
        params: { max: '40' },
      }),
    ).toBe('estimate must be at most 40');
    expect(
      mcpToolFormUtils.messageOf({
        code: ToolFieldIssueCode.TOO_MANY_ITEMS,
        path: 'labels',
        params: { max: '3' },
      }),
    ).toBe('labels allows at most 3 items');
  });
});

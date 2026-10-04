import { t } from 'i18next';

function parseSchema(
  inputSchema: Record<string, unknown> | undefined | null,
): ToolFieldNode[] {
  const root = isRecord(inputSchema) ? inputSchema : {};
  return nodesOfObject({ schema: root, depth: 0 });
}

function nodesOfObject({
  schema,
  depth,
}: {
  schema: Record<string, unknown>;
  depth: number;
}): ToolFieldNode[] {
  const properties = isRecord(schema['properties']) ? schema['properties'] : {};
  const required = requiredNamesOf(schema);
  const nodes = Object.entries(properties).map(([key, value]) =>
    nodeOf({
      schema: isRecord(value) ? value : {},
      key,
      required: required.includes(key),
      depth,
    }),
  );
  return [
    ...nodes.filter((node) => node.required),
    ...nodes.filter((node) => !node.required),
  ];
}

function nodeOf({
  schema,
  key,
  required,
  depth,
}: {
  schema: Record<string, unknown>;
  key: string;
  required: boolean;
  depth: number;
}): ToolFieldNode {
  const resolved = unwrapNullable(schema);
  const base = {
    key,
    required,
    label: typeof schema['title'] === 'string' ? schema['title'] : key,
    description:
      typeof schema['description'] === 'string'
        ? schema['description']
        : undefined,
    defaultValue: schema['default'],
    constraints: constraintsOf(resolved),
    format:
      typeof resolved['format'] === 'string' ? resolved['format'] : undefined,
  };
  const options = optionsOf(resolved);
  if (options !== null) {
    return { ...base, kind: ToolFieldKind.ENUM, options };
  }
  const type = typeOf(resolved);
  if (type === 'string') {
    return { ...base, kind: ToolFieldKind.STRING };
  }
  if (type === 'number' || type === 'integer') {
    return {
      ...base,
      kind: type === 'integer' ? ToolFieldKind.INTEGER : ToolFieldKind.NUMBER,
    };
  }
  if (type === 'boolean') {
    return { ...base, kind: ToolFieldKind.BOOLEAN };
  }
  if (type === 'array' && depth < MAX_NESTING_DEPTH) {
    const itemSchema = isRecord(resolved['items']) ? resolved['items'] : null;
    if (itemSchema !== null) {
      const item = nodeOf({
        schema: itemSchema,
        key: '',
        required: true,
        depth: depth + 1,
      });
      return { ...base, kind: ToolFieldKind.ARRAY, item };
    }
  }
  if (
    type === 'object' &&
    depth < MAX_NESTING_DEPTH &&
    isRecord(resolved['properties']) &&
    Object.keys(resolved['properties']).length > 0
  ) {
    return {
      ...base,
      kind: ToolFieldKind.OBJECT,
      properties: nodesOfObject({ schema: resolved, depth: depth + 1 }),
    };
  }
  return { ...base, kind: ToolFieldKind.JSON };
}

function unwrapNullable(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const variants = ['anyOf', 'oneOf']
    .map((name) => schema[name])
    .find((value) => Array.isArray(value));
  if (!Array.isArray(variants)) {
    return schema;
  }
  const nonNull = variants.filter(
    (variant) => !(isRecord(variant) && variant['type'] === 'null'),
  );
  const only = nonNull[0];
  return nonNull.length === 1 && variants.length === 2 && isRecord(only)
    ? { ...only, ...omitKeys({ value: schema, keys: ['anyOf', 'oneOf'] }) }
    : schema;
}

function omitKeys({
  value,
  keys,
}: {
  value: Record<string, unknown>;
  keys: string[];
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

function typeOf(schema: Record<string, unknown>): string | null {
  const type = schema['type'];
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    const nonNull = type.filter(
      (item): item is string => typeof item === 'string' && item !== 'null',
    );
    return nonNull.length === 1 ? nonNull[0] : null;
  }
  return null;
}

function optionsOf(schema: Record<string, unknown>): ToolFieldOption[] | null {
  const values = schema['enum'];
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const scalars = values.filter(isScalar);
  if (scalars.length !== values.length) {
    return null;
  }
  return scalars.map((value) => ({ value, label: String(value) }));
}

function constraintsOf(schema: Record<string, unknown>): ToolFieldConstraints {
  return {
    minLength: numberOf(schema['minLength']),
    maxLength: numberOf(schema['maxLength']),
    pattern:
      typeof schema['pattern'] === 'string' ? schema['pattern'] : undefined,
    minimum: numberOf(schema['minimum']),
    maximum: numberOf(schema['maximum']),
    minItems: numberOf(schema['minItems']),
    maxItems: numberOf(schema['maxItems']),
  };
}

function requiredNamesOf(schema: Record<string, unknown>): string[] {
  const required = schema['required'];
  return Array.isArray(required)
    ? required.filter((value): value is string => typeof value === 'string')
    : [];
}

function emptyDraft(node: ToolFieldNode): ToolDraft {
  switch (node.kind) {
    case ToolFieldKind.ARRAY:
      return [];
    case ToolFieldKind.OBJECT:
      return Object.fromEntries(
        (node.properties ?? []).map((property) => [
          property.key,
          initialDraft(property),
        ]),
      );
    default:
      return '';
  }
}

function initialDraft(node: ToolFieldNode): ToolDraft {
  if (node.defaultValue === undefined) {
    return emptyDraft(node);
  }
  return draftOf({ node, value: node.defaultValue });
}

function initialDrafts(nodes: ToolFieldNode[]): Record<string, ToolDraft> {
  return Object.fromEntries(
    nodes.map((node) => [node.key, initialDraft(node)]),
  );
}

function draftOf({
  node,
  value,
}: {
  node: ToolFieldNode;
  value: unknown;
}): ToolDraft {
  if (value === undefined || value === null) {
    return emptyDraft(node);
  }
  switch (node.kind) {
    case ToolFieldKind.ARRAY: {
      const item = node.item;
      return Array.isArray(value) && item !== undefined
        ? value.map((entry) => draftOf({ node: item, value: entry }))
        : JSON.stringify(value);
    }
    case ToolFieldKind.OBJECT:
      return isRecord(value)
        ? Object.fromEntries(
            (node.properties ?? []).map((property) => [
              property.key,
              draftOf({ node: property, value: value[property.key] }),
            ]),
          )
        : emptyDraft(node);
    case ToolFieldKind.JSON:
      return JSON.stringify(value, null, 2);
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

function draftsOf({
  nodes,
  payload,
}: {
  nodes: ToolFieldNode[];
  payload: Record<string, unknown>;
}): { drafts: Record<string, ToolDraft>; extra: Record<string, unknown> } {
  const known = nodes.map((node) => node.key);
  return {
    drafts: Object.fromEntries(
      nodes.map((node) => [
        node.key,
        draftOf({ node, value: payload[node.key] }),
      ]),
    ),
    extra: Object.fromEntries(
      Object.entries(payload).filter(([key]) => !known.includes(key)),
    ),
  };
}

function payloadOf({
  nodes,
  drafts,
  extra,
}: {
  nodes: ToolFieldNode[];
  drafts: Record<string, ToolDraft>;
  extra: Record<string, unknown>;
}): { payload: Record<string, unknown>; issues: ToolFieldIssue[] } {
  const built = nodes.map((node) =>
    valueOf({ node, draft: drafts[node.key] ?? '', path: node.key }),
  );
  const entries = nodes.flatMap((node, index) => {
    const value = built[index].value;
    return value === undefined ? [] : [[node.key, value] as const];
  });
  return {
    payload: { ...extra, ...Object.fromEntries(entries) },
    issues: built.flatMap((item) => item.issues),
  };
}

function valueOf({
  node,
  draft,
  path,
}: {
  node: ToolFieldNode;
  draft: ToolDraft;
  path: string;
}): { value: unknown; issues: ToolFieldIssue[] } {
  switch (node.kind) {
    case ToolFieldKind.ARRAY:
      return arrayValueOf({ node, draft, path });
    case ToolFieldKind.OBJECT:
      return objectValueOf({ node, draft, path });
    default:
      return scalarValueOf({
        node,
        text: typeof draft === 'string' ? draft : '',
        path,
      });
  }
}

function arrayValueOf({
  node,
  draft,
  path,
}: {
  node: ToolFieldNode;
  draft: ToolDraft;
  path: string;
}): { value: unknown; issues: ToolFieldIssue[] } {
  const item = node.item;
  const list = Array.isArray(draft) ? draft : [];
  if (item === undefined || list.length === 0) {
    return { value: node.required ? [] : undefined, issues: [] };
  }
  const built = list.map((entry, index) =>
    valueOf({ node: item, draft: entry, path: `${path}[${index + 1}]` }),
  );
  return {
    value: built.map((entry) => entry.value),
    issues: built.flatMap((entry) => entry.issues),
  };
}

function objectValueOf({
  node,
  draft,
  path,
}: {
  node: ToolFieldNode;
  draft: ToolDraft;
  path: string;
}): { value: unknown; issues: ToolFieldIssue[] } {
  const record = isDraftRecord(draft) ? draft : {};
  const properties = node.properties ?? [];
  const built = properties.map((property) =>
    valueOf({
      node: property,
      draft: record[property.key] ?? '',
      path: `${path}.${property.key}`,
    }),
  );
  const entries = properties.flatMap((property, index) => {
    const value = built[index].value;
    return value === undefined ? [] : [[property.key, value] as const];
  });
  const issues = built.flatMap((entry) => entry.issues);
  if (entries.length === 0 && !node.required) {
    return { value: undefined, issues };
  }
  return { value: Object.fromEntries(entries), issues };
}

function scalarValueOf({
  node,
  text,
  path,
}: {
  node: ToolFieldNode;
  text: string;
  path: string;
}): { value: unknown; issues: ToolFieldIssue[] } {
  const trimmed = node.kind === ToolFieldKind.STRING ? text : text.trim();
  if (trimmed.length === 0) {
    return {
      value: undefined,
      issues: node.required
        ? [{ code: ToolFieldIssueCode.REQUIRED, path, params: {} }]
        : [],
    };
  }
  switch (node.kind) {
    case ToolFieldKind.NUMBER:
    case ToolFieldKind.INTEGER: {
      const parsed = Number(trimmed);
      return Number.isNaN(parsed)
        ? {
            value: trimmed,
            issues: [
              { code: ToolFieldIssueCode.NOT_A_NUMBER, path, params: {} },
            ],
          }
        : { value: parsed, issues: [] };
    }
    case ToolFieldKind.BOOLEAN:
      return { value: trimmed === 'true', issues: [] };
    case ToolFieldKind.ENUM: {
      const option = (node.options ?? []).find(
        (candidate) => String(candidate.value) === trimmed,
      );
      return option === undefined
        ? {
            value: trimmed,
            issues: [
              { code: ToolFieldIssueCode.NOT_AN_OPTION, path, params: {} },
            ],
          }
        : { value: option.value, issues: [] };
    }
    case ToolFieldKind.JSON: {
      const parsed = parseJson(trimmed);
      return parsed.ok
        ? { value: parsed.value, issues: [] }
        : {
            value: trimmed,
            issues: [
              { code: ToolFieldIssueCode.INVALID_JSON, path, params: {} },
            ],
          };
    }
    default:
      return { value: text, issues: [] };
  }
}

function validatePayload({
  nodes,
  payload,
}: {
  nodes: ToolFieldNode[];
  payload: Record<string, unknown>;
}): ToolFieldIssue[] {
  return nodes.flatMap((node) =>
    validateValue({ node, value: payload[node.key], path: node.key }),
  );
}

function validateValue({
  node,
  value,
  path,
}: {
  node: ToolFieldNode;
  value: unknown;
  path: string;
}): ToolFieldIssue[] {
  if (value === undefined || value === null) {
    return node.required
      ? [{ code: ToolFieldIssueCode.REQUIRED, path, params: {} }]
      : [];
  }
  switch (node.kind) {
    case ToolFieldKind.STRING:
      return typeof value === 'string'
        ? stringIssues({ node, value, path })
        : [{ code: ToolFieldIssueCode.NOT_A_STRING, path, params: {} }];
    case ToolFieldKind.NUMBER:
    case ToolFieldKind.INTEGER:
      return numberIssues({ node, value, path });
    case ToolFieldKind.BOOLEAN:
      return typeof value === 'boolean'
        ? []
        : [{ code: ToolFieldIssueCode.NOT_A_BOOLEAN, path, params: {} }];
    case ToolFieldKind.ENUM:
      return (node.options ?? []).some((option) => option.value === value)
        ? []
        : [{ code: ToolFieldIssueCode.NOT_AN_OPTION, path, params: {} }];
    case ToolFieldKind.ARRAY:
      return arrayIssues({ node, value, path });
    case ToolFieldKind.OBJECT:
      return isRecord(value)
        ? (node.properties ?? []).flatMap((property) =>
            validateValue({
              node: property,
              value: value[property.key],
              path: `${path}.${property.key}`,
            }),
          )
        : [{ code: ToolFieldIssueCode.NOT_AN_OBJECT, path, params: {} }];
    case ToolFieldKind.JSON:
      return [];
  }
}

function stringIssues({
  node,
  value,
  path,
}: {
  node: ToolFieldNode;
  value: string;
  path: string;
}): ToolFieldIssue[] {
  const { minLength, maxLength, pattern } = node.constraints;
  const required = node.required && value.length === 0;
  return [
    ...(required
      ? [{ code: ToolFieldIssueCode.REQUIRED, path, params: {} }]
      : []),
    ...(minLength !== undefined && value.length < minLength && !required
      ? [
          {
            code: ToolFieldIssueCode.TOO_SHORT,
            path,
            params: { min: String(minLength) },
          },
        ]
      : []),
    ...(maxLength !== undefined && value.length > maxLength
      ? [
          {
            code: ToolFieldIssueCode.TOO_LONG,
            path,
            params: { max: String(maxLength) },
          },
        ]
      : []),
    ...(pattern !== undefined && !matchesPattern({ pattern, value })
      ? [{ code: ToolFieldIssueCode.PATTERN_MISMATCH, path, params: {} }]
      : []),
  ];
}

function numberIssues({
  node,
  value,
  path,
}: {
  node: ToolFieldNode;
  value: unknown;
  path: string;
}): ToolFieldIssue[] {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return [{ code: ToolFieldIssueCode.NOT_A_NUMBER, path, params: {} }];
  }
  const { minimum, maximum } = node.constraints;
  return [
    ...(node.kind === ToolFieldKind.INTEGER && !Number.isInteger(value)
      ? [{ code: ToolFieldIssueCode.NOT_AN_INTEGER, path, params: {} }]
      : []),
    ...(minimum !== undefined && value < minimum
      ? [
          {
            code: ToolFieldIssueCode.TOO_SMALL,
            path,
            params: { min: String(minimum) },
          },
        ]
      : []),
    ...(maximum !== undefined && value > maximum
      ? [
          {
            code: ToolFieldIssueCode.TOO_LARGE,
            path,
            params: { max: String(maximum) },
          },
        ]
      : []),
  ];
}

function arrayIssues({
  node,
  value,
  path,
}: {
  node: ToolFieldNode;
  value: unknown;
  path: string;
}): ToolFieldIssue[] {
  if (!Array.isArray(value)) {
    return [{ code: ToolFieldIssueCode.NOT_AN_ARRAY, path, params: {} }];
  }
  const { minItems, maxItems } = node.constraints;
  const item = node.item;
  return [
    ...(minItems !== undefined && value.length < minItems
      ? [
          {
            code: ToolFieldIssueCode.TOO_FEW_ITEMS,
            path,
            params: { min: String(minItems) },
          },
        ]
      : []),
    ...(maxItems !== undefined && value.length > maxItems
      ? [
          {
            code: ToolFieldIssueCode.TOO_MANY_ITEMS,
            path,
            params: { max: String(maxItems) },
          },
        ]
      : []),
    ...(item === undefined
      ? []
      : value.flatMap((entry, index) =>
          validateValue({
            node: item,
            value: entry,
            path: `${path}[${index + 1}]`,
          }),
        )),
  ];
}

function matchesPattern({
  pattern,
  value,
}: {
  pattern: string;
  value: string;
}): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}

function resolveForm({
  nodes,
  drafts,
  extra,
}: {
  nodes: ToolFieldNode[];
  drafts: Record<string, ToolDraft>;
  extra: Record<string, unknown>;
}): ToolArgumentsResult {
  const built = payloadOf({ nodes, drafts, extra });
  const parseIssuePaths = new Set(built.issues.map((issue) => issue.path));
  const constraintIssues = validatePayload({
    nodes,
    payload: built.payload,
  }).filter((issue) => !parseIssuePaths.has(issue.path));
  const issues = [...built.issues, ...constraintIssues];
  return issues.length === 0
    ? { ok: true, payload: built.payload }
    : { ok: false, issues, payload: built.payload };
}

function resolveJson({
  nodes,
  text,
}: {
  nodes: ToolFieldNode[];
  text: string;
}): ToolArgumentsResult {
  const trimmed = text.trim();
  const parsed = trimmed.length === 0 ? parseJson('{}') : parseJson(trimmed);
  if (!parsed.ok) {
    return {
      ok: false,
      issues: [
        {
          code: ToolFieldIssueCode.JSON_SYNTAX,
          path: '',
          params: { detail: parsed.detail },
        },
      ],
      payload: {},
    };
  }
  if (!isRecord(parsed.value)) {
    return {
      ok: false,
      issues: [
        { code: ToolFieldIssueCode.JSON_NOT_OBJECT, path: '', params: {} },
      ],
      payload: {},
    };
  }
  const issues = validatePayload({ nodes, payload: parsed.value });
  return issues.length === 0
    ? { ok: true, payload: parsed.value }
    : { ok: false, issues, payload: parsed.value };
}

function initialState(nodes: ToolFieldNode[]): ToolArgumentsState {
  return {
    mode: ToolArgumentsMode.FORM,
    drafts: initialDrafts(nodes),
    extra: {},
    jsonText: '{}',
    switchError: null,
  };
}

function switchMode({
  nodes,
  state,
  mode,
}: {
  nodes: ToolFieldNode[];
  state: ToolArgumentsState;
  mode: ToolArgumentsMode;
}): ToolArgumentsState {
  if (mode === state.mode) {
    return state;
  }
  if (mode === ToolArgumentsMode.JSON) {
    const built = payloadOf({
      nodes,
      drafts: state.drafts,
      extra: state.extra,
    });
    return {
      ...state,
      mode,
      jsonText: JSON.stringify(built.payload, null, 2),
      switchError: null,
    };
  }
  const trimmed = state.jsonText.trim();
  const parsed = trimmed.length === 0 ? parseJson('{}') : parseJson(trimmed);
  if (!parsed.ok) {
    return {
      ...state,
      switchError: {
        code: ToolFieldIssueCode.JSON_SYNTAX,
        path: '',
        params: { detail: parsed.detail },
      },
    };
  }
  if (!isRecord(parsed.value)) {
    return {
      ...state,
      switchError: {
        code: ToolFieldIssueCode.JSON_NOT_OBJECT,
        path: '',
        params: {},
      },
    };
  }
  const { drafts, extra } = draftsOf({ nodes, payload: parsed.value });
  return { mode, drafts, extra, jsonText: state.jsonText, switchError: null };
}

function resolve({
  nodes,
  state,
}: {
  nodes: ToolFieldNode[];
  state: ToolArgumentsState;
}): ToolArgumentsResult {
  return state.mode === ToolArgumentsMode.FORM
    ? resolveForm({ nodes, drafts: state.drafts, extra: state.extra })
    : resolveJson({ nodes, text: state.jsonText });
}

function fieldLabelOf(path: string): string {
  return path.length === 0 ? t('Arguments') : path;
}

function messageOf(issue: ToolFieldIssue): string {
  const field = fieldLabelOf(issue.path);
  const params = { field, ...issue.params };
  switch (issue.code) {
    case ToolFieldIssueCode.REQUIRED:
      return t('{field} is required', params);
    case ToolFieldIssueCode.NOT_A_NUMBER:
      return t('{field} must be a number', params);
    case ToolFieldIssueCode.NOT_AN_INTEGER:
      return t('{field} must be a whole number', params);
    case ToolFieldIssueCode.NOT_A_STRING:
      return t('{field} must be text', params);
    case ToolFieldIssueCode.NOT_A_BOOLEAN:
      return t('{field} must be true or false', params);
    case ToolFieldIssueCode.NOT_AN_OBJECT:
      return t('{field} must be an object', params);
    case ToolFieldIssueCode.NOT_AN_ARRAY:
      return t('{field} must be a list', params);
    case ToolFieldIssueCode.NOT_AN_OPTION:
      return t('{field} must be one of the listed values', params);
    case ToolFieldIssueCode.TOO_SHORT:
      return t('{field} needs at least {min} characters', params);
    case ToolFieldIssueCode.TOO_LONG:
      return t('{field} allows at most {max} characters', params);
    case ToolFieldIssueCode.PATTERN_MISMATCH:
      return t('{field} does not match the required format', params);
    case ToolFieldIssueCode.TOO_SMALL:
      return t('{field} must be at least {min}', params);
    case ToolFieldIssueCode.TOO_LARGE:
      return t('{field} must be at most {max}', params);
    case ToolFieldIssueCode.TOO_FEW_ITEMS:
      return t('{field} needs at least {min} items', params);
    case ToolFieldIssueCode.TOO_MANY_ITEMS:
      return t('{field} allows at most {max} items', params);
    case ToolFieldIssueCode.INVALID_JSON:
      return t('{field} is not valid JSON', params);
    case ToolFieldIssueCode.JSON_SYNTAX:
      return t('The JSON is not valid: {detail}', params);
    case ToolFieldIssueCode.JSON_NOT_OBJECT:
      return t('The arguments must be a JSON object', params);
  }
}

function parseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; detail: string } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDraftRecord(value: ToolDraft): value is Record<string, ToolDraft> {
  return typeof value === 'object' && !Array.isArray(value);
}

export const mcpToolFormUtils = {
  parseSchema,
  initialState,
  initialDraft,
  emptyDraft,
  switchMode,
  resolve,
  messageOf,
  fieldLabelOf,
};

export const MAX_NESTING_DEPTH = 3;

export enum ToolFieldKind {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ENUM = 'ENUM',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  JSON = 'JSON',
}

export enum ToolArgumentsMode {
  FORM = 'FORM',
  JSON = 'JSON',
}

export enum ToolFieldIssueCode {
  REQUIRED = 'REQUIRED',
  NOT_A_NUMBER = 'NOT_A_NUMBER',
  NOT_AN_INTEGER = 'NOT_AN_INTEGER',
  NOT_A_STRING = 'NOT_A_STRING',
  NOT_A_BOOLEAN = 'NOT_A_BOOLEAN',
  NOT_AN_OBJECT = 'NOT_AN_OBJECT',
  NOT_AN_ARRAY = 'NOT_AN_ARRAY',
  NOT_AN_OPTION = 'NOT_AN_OPTION',
  TOO_SHORT = 'TOO_SHORT',
  TOO_LONG = 'TOO_LONG',
  PATTERN_MISMATCH = 'PATTERN_MISMATCH',
  TOO_SMALL = 'TOO_SMALL',
  TOO_LARGE = 'TOO_LARGE',
  TOO_FEW_ITEMS = 'TOO_FEW_ITEMS',
  TOO_MANY_ITEMS = 'TOO_MANY_ITEMS',
  INVALID_JSON = 'INVALID_JSON',
  JSON_SYNTAX = 'JSON_SYNTAX',
  JSON_NOT_OBJECT = 'JSON_NOT_OBJECT',
}

export type ToolFieldOption = {
  value: string | number | boolean;
  label: string;
};

export type ToolFieldConstraints = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

export type ToolFieldNode = {
  kind: ToolFieldKind;
  key: string;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  format?: string;
  constraints: ToolFieldConstraints;
  options?: ToolFieldOption[];
  item?: ToolFieldNode;
  properties?: ToolFieldNode[];
};

export type ToolDraft = string | ToolDraft[] | { [key: string]: ToolDraft };

export type ToolFieldIssue = {
  code: ToolFieldIssueCode;
  path: string;
  params: Record<string, string>;
};

export type ToolArgumentsState = {
  mode: ToolArgumentsMode;
  drafts: Record<string, ToolDraft>;
  extra: Record<string, unknown>;
  jsonText: string;
  switchError: ToolFieldIssue | null;
};

export type ToolArgumentsResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; issues: ToolFieldIssue[]; payload: Record<string, unknown> };

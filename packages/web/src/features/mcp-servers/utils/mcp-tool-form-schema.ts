import { z } from 'zod';

function fieldKindOf(schema: Record<string, unknown>): McpToolFormFieldKind {
  const type = schema['type'];
  if (type === 'string') {
    return 'string';
  }
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  return 'json';
}

function buildToolFormFields(
  inputSchema: Record<string, unknown> | undefined | null,
): McpToolFormField[] {
  const propertiesValue = inputSchema?.['properties'];
  const properties = isRecord(propertiesValue) ? propertiesValue : {};
  const requiredValue = inputSchema?.['required'];
  const required = Array.isArray(requiredValue)
    ? requiredValue.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  return Object.entries(properties).map(([key, value]) => {
    const propertySchema = isRecord(value) ? value : {};
    return {
      key,
      kind: fieldKindOf(propertySchema),
      required: required.includes(key),
      label:
        typeof propertySchema['title'] === 'string'
          ? propertySchema['title']
          : key,
      description:
        typeof propertySchema['description'] === 'string'
          ? propertySchema['description']
          : undefined,
    };
  });
}

function fieldSchema(field: McpToolFormField) {
  const withRequired = z
    .string()
    .min(field.required ? 1 : 0, 'mcpToolTryFieldRequired');
  if (field.kind === 'number') {
    return withRequired.refine(
      (value) => value.trim().length === 0 || !Number.isNaN(Number(value)),
      'mcpToolTryFieldMustBeNumber',
    );
  }
  if (field.kind === 'json') {
    return withRequired.refine(
      (value) => value.trim().length === 0 || isValidJson(value),
      'mcpToolTryFieldMustBeJson',
    );
  }
  return withRequired;
}

function buildToolFormSchema(fields: McpToolFormField[]) {
  return z.object(
    Object.fromEntries(fields.map((field) => [field.key, fieldSchema(field)])),
  );
}

function parseToolFormValues({
  fields,
  values,
}: {
  fields: McpToolFormField[];
  values: Record<string, string>;
}): Record<string, unknown> {
  const entries = fields
    .map((field) => [field, values[field.key]?.trim() ?? ''] as const)
    .filter(([, value]) => value.length > 0)
    .map(
      ([field, value]) =>
        [field.key, parseFieldValue({ field, value })] as const,
    );
  return Object.fromEntries(entries);
}

function parseFieldValue({
  field,
  value,
}: {
  field: McpToolFormField;
  value: string;
}): unknown {
  if (field.kind === 'number') {
    return Number(value);
  }
  if (field.kind === 'boolean') {
    return value === 'true';
  }
  if (field.kind === 'json') {
    return JSON.parse(value);
  }
  return value;
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const mcpToolFormUtils = {
  buildToolFormFields,
  buildToolFormSchema,
  parseToolFormValues,
};

export type McpToolFormFieldKind = 'string' | 'number' | 'boolean' | 'json';

export type McpToolFormField = {
  key: string;
  kind: McpToolFormFieldKind;
  required: boolean;
  label: string;
  description?: string;
};

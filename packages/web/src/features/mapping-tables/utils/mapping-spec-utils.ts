import {
  dataMapping,
  generateId,
  isNil,
  MappingItemRow,
  MappingRow,
  MappingSpec,
  MappingTableData,
  MappingTargetField,
  MappingTargetItemField,
  MappingTransformType,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { templatePreview } from './template-preview';

function parse(value: unknown): MappingSpec {
  const parsed = MappingSpec.safeParse(
    typeof value === 'string' ? safeJson(value) : value,
  );
  return parsed.success ? parsed.data : { fields: [] };
}

function buildEntries(spec: MappingSpec): MappingEntry[] {
  const schemaFields = spec.destination?.fields ?? [];
  const named = schemaFields.map<MappingEntry>((field) => ({
    key: `field-${field.name}`,
    field,
    row: spec.fields.find((row) => row.target.trim() === field.name) ?? null,
  }));
  const extras = spec.fields
    .filter(
      (row) =>
        spec.destination === undefined ||
        !schemaFields.some((field) => field.name === row.target.trim()),
    )
    .map<MappingEntry>((row) => ({ key: `row-${row.id}`, field: null, row }));
  return [...named, ...extras];
}

function hasSource(row: MappingRow): boolean {
  const hasText = (candidate: unknown) =>
    typeof candidate === 'string'
      ? candidate.trim().length > 0
      : candidate !== undefined && candidate !== null;
  return (
    hasText(row.source) ||
    hasText(row.constant) ||
    row.each !== undefined ||
    row.transforms.some(
      (transform) =>
        transform.type === MappingTransformType.DEFAULT &&
        (transform.arg ?? '').trim().length > 0,
    )
  );
}

function eachRowsFor(itemFields: MappingTargetItemField[]): MappingItemRow[] {
  return itemFields.length > 0
    ? itemFields.map((field) => ({
        id: generateId(),
        target: field.name,
        itemPath: '',
        transforms: [],
      }))
    : [{ id: generateId(), target: '', itemPath: '', transforms: [] }];
}

function trailOf({
  row,
  sampleData,
  tableData,
}: {
  row: MappingRow | null;
  sampleData: Record<string, unknown>;
  tableData: MappingTableData[];
}): TrailStep[] {
  if (row === null || row.each !== undefined || row.transforms.length === 0) {
    return [];
  }
  const start = templatePreview.resolveTemplate({
    template: row.source,
    sampleData,
  });
  if (start === undefined || start === '') {
    return [];
  }
  return row.transforms.reduce<TrailStep[]>(
    (steps, transform) => {
      const last = steps[steps.length - 1];
      if (last === undefined || last.failed) {
        return steps;
      }
      const result = dataMapping.applyTransform({
        value: last.value,
        transform,
        tables: tableData,
      });
      return [
        ...steps,
        {
          label: transformLabel(transform.type),
          value: result.value,
          failed: result.issue !== null,
        },
      ];
    },
    [{ label: t('Source'), value: start, failed: false }],
  );
}

function transformLabel(type: MappingTransformType): string {
  switch (type) {
    case MappingTransformType.TRIM:
      return t('Trim spaces');
    case MappingTransformType.NUMBER:
      return t('To number');
    case MappingTransformType.STRING:
      return t('To text');
    case MappingTransformType.DATE:
      return t('Date format');
    case MappingTransformType.DEFAULT:
      return t('Default when empty');
    case MappingTransformType.LOOKUP:
      return t('Look up mapping table');
    case MappingTransformType.ROUND:
      return t('Round');
    case MappingTransformType.UPPER:
      return t('Upper case');
    case MappingTransformType.LOWER:
      return t('Lower case');
    case MappingTransformType.SPLIT:
      return t('Split into list');
  }
}

function argPlaceholder(type: MappingTransformType): string {
  switch (type) {
    case MappingTransformType.DATE:
      return 'YYYY-MM-DD';
    case MappingTransformType.DEFAULT:
      return t('Default value');
    case MappingTransformType.ROUND:
      return '2';
    case MappingTransformType.SPLIT:
      return ',';
    default:
      return '';
  }
}

function defaultArg(type: MappingTransformType): string | undefined {
  switch (type) {
    case MappingTransformType.DATE:
      return 'YYYY-MM-DD';
    case MappingTransformType.ROUND:
      return '2';
    case MappingTransformType.SPLIT:
      return ',';
    default:
      return undefined;
  }
}

function previewText(value: unknown): string {
  if (value === undefined) {
    return t('No sample value yet');
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function rowPreviewText({
  row,
  value,
  sampleData,
}: {
  row: MappingRow;
  value: unknown;
  sampleData: Record<string, unknown>;
}): string {
  if (!isNil(value)) {
    return previewText(value);
  }
  return templatePreview.hasSampleFor({ template: row.source, sampleData })
    ? t('Empty in the sample data, the output keeps it as null')
    : t('No sample value yet');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const TRANSFORMS_WITH_ARG = [
  MappingTransformType.DATE,
  MappingTransformType.DEFAULT,
  MappingTransformType.ROUND,
  MappingTransformType.SPLIT,
];

export const mappingSpecUtils = {
  parse,
  buildEntries,
  hasSource,
  eachRowsFor,
  trailOf,
  transformLabel,
  argPlaceholder,
  defaultArg,
  previewText,
  rowPreviewText,
  TRANSFORMS_WITH_ARG,
};

export type MappingEntry = {
  key: string;
  field: MappingTargetField | null;
  row: MappingRow | null;
};

export type TrailStep = {
  label: string;
  value: unknown;
  failed: boolean;
};

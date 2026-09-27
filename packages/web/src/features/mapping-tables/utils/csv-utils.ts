import { MappingTableRow } from '@fema-ipaas/shared';

function parse({
  text,
  labels,
}: {
  text: string;
  labels?: [string, string];
}): ParsedCsv {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], hasHeader: false };
  }
  const delimiter = detectDelimiter(lines[0]);
  const cells = lines.map((line) => splitLine({ line, delimiter }));
  const hasHeader = looksLikeHeader({ cells: cells[0], labels });
  const rows = (hasHeader ? cells.slice(1) : cells).map((row) => ({
    k: (row[0] ?? '').trim(),
    v: row[1] ?? '',
  }));
  return { rows, hasHeader };
}

function serialize({
  rows,
  keyLabel,
  valueLabel,
}: {
  rows: MappingTableRow[];
  keyLabel: string;
  valueLabel: string;
}): string {
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    '\uFEFF' + [keyLabel, valueLabel].map(escape).join(','),
    ...rows.map((row) => [row.k, row.v].map(escape).join(',')),
  ].join('\n');
}

function merge({
  current,
  incoming,
  mode,
}: {
  current: MappingTableRow[];
  incoming: MappingTableRow[];
  mode: ImportMode;
}): ImportPreview {
  const lastByKey = incoming.reduce<Map<string, MappingTableRow>>(
    (acc, row) => new Map(acc).set(row.k, row),
    new Map(),
  );
  const outcomes = incoming.map((row): ImportOutcome => {
    if (row.k.length === 0) {
      return {
        row,
        status: ImportRowStatus.SKIPPED,
        reason: ImportSkipReason.EMPTY_KEY,
      };
    }
    if (row.k.length > MAX_KEY_LENGTH || row.v.length > MAX_VALUE_LENGTH) {
      return {
        row,
        status: ImportRowStatus.SKIPPED,
        reason: ImportSkipReason.TOO_LONG,
      };
    }
    if (lastByKey.get(row.k) !== row) {
      return {
        row,
        status: ImportRowStatus.SKIPPED,
        reason: ImportSkipReason.DUPLICATE,
      };
    }
    const existing = current.find((candidate) => candidate.k === row.k);
    if (existing === undefined) {
      return { row, status: ImportRowStatus.ADDED, reason: null };
    }
    return {
      row,
      status:
        existing.v === row.v
          ? ImportRowStatus.UNCHANGED
          : ImportRowStatus.UPDATED,
      reason: null,
    };
  });
  const accepted = outcomes
    .filter((outcome) => outcome.status !== ImportRowStatus.SKIPPED)
    .map((outcome) => outcome.row);
  const result =
    mode === ImportMode.REPLACE
      ? accepted
      : [
          ...current.filter(
            (row) => !accepted.some((candidate) => candidate.k === row.k),
          ),
          ...accepted,
        ];
  const removed =
    mode === ImportMode.REPLACE
      ? current.filter(
          (row) => !accepted.some((candidate) => candidate.k === row.k),
        )
      : [];
  return { outcomes, result, removed };
}

function detectDelimiter(line: string): string {
  return (
    ['\t', '，', ';', ','].find((candidate) => line.includes(candidate)) ?? ','
  );
}

function splitLine({
  line,
  delimiter,
}: {
  line: string;
  delimiter: string;
}): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && line.startsWith(delimiter, index)) {
      cells.push(current);
      current = '';
      index += delimiter.length - 1;
    } else {
      current += char;
    }
  }
  return [...cells, current];
}

function looksLikeHeader({
  cells,
  labels,
}: {
  cells: string[];
  labels?: [string, string];
}): boolean {
  const [first = '', second = ''] = cells.map((cell) => cell.trim());
  if (labels && first === labels[0] && second === labels[1]) {
    return true;
  }
  return HEADER_WORDS.test(`${first} ${second}`.toLowerCase());
}

const HEADER_WORDS =
  /\b(key|value|code|name|id)\b|原值|映射值|编码|编号|代码|名称|部门/;
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 200;

export enum ImportMode {
  MERGE = 'MERGE',
  REPLACE = 'REPLACE',
}

export enum ImportRowStatus {
  ADDED = 'ADDED',
  UPDATED = 'UPDATED',
  UNCHANGED = 'UNCHANGED',
  SKIPPED = 'SKIPPED',
}

export enum ImportSkipReason {
  EMPTY_KEY = 'EMPTY_KEY',
  TOO_LONG = 'TOO_LONG',
  DUPLICATE = 'DUPLICATE',
}

export const mappingCsv = {
  parse,
  serialize,
  merge,
};

export type ParsedCsv = {
  rows: MappingTableRow[];
  hasHeader: boolean;
};

export type ImportOutcome = {
  row: MappingTableRow;
  status: ImportRowStatus;
  reason: ImportSkipReason | null;
};

export type ImportPreview = {
  outcomes: ImportOutcome[];
  result: MappingTableRow[];
  removed: MappingTableRow[];
};

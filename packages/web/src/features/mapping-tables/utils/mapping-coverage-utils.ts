import {
  CoverageObservation,
  dataMapping,
  MappingCoverageSource,
  mappingCoverage,
  MappingSpec,
  MappingTableData,
  TableCoverage,
  UncoveredKey,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { templatePreview } from './template-preview';

function fromRuns(sources: MappingCoverageSource[]): CoverageEntry[] {
  return sources.map((source) => ({
    id: `runs-${source.workflowId}-${source.stepName}-${source.tableId}`,
    origin: CoverageOrigin.RUNS,
    tableId: source.tableId,
    tableName: source.tableName,
    title: `${source.workflowDisplayName} · ${source.stepDisplayName}`,
    runsScanned: source.runsScanned,
    runsWithoutPayload: source.runsWithoutPayload,
    total: source.total,
    hit: source.hit,
    maskedSkipped: source.maskedSkipped,
    uncovered: source.uncovered,
  }));
}

function sampleCoverage({
  spec,
  sampleData,
  tables,
}: {
  spec: MappingSpec;
  sampleData: Record<string, unknown>;
  tables: MappingTableData[];
}): TableCoverage[] {
  const observations = spec.fields
    .map((row) => ({
      ...row,
      source: templatePreview.resolveTemplate({
        template: row.source,
        sampleData,
      }),
    }))
    .flatMap((row) => dataMapping.lookupKeys({ row, tables }))
    .filter((found) => tables.some((table) => table.id === found.tableId))
    .map(
      (found): CoverageObservation => ({
        tableId: found.tableId,
        key: found.key,
      }),
    );
  return mappingCoverage.tally({ observations, tables });
}

function fromSample({
  coverage,
  tables,
}: {
  coverage: TableCoverage[];
  tables: MappingTableData[];
}): CoverageEntry[] {
  return coverage.map((entry) => ({
    id: `sample-${entry.tableId}`,
    origin: CoverageOrigin.SAMPLE,
    tableId: entry.tableId,
    tableName: tables.find((table) => table.id === entry.tableId)?.name ?? '',
    title: t('Sample data of the upstream steps'),
    runsScanned: null,
    runsWithoutPayload: 0,
    total: entry.total,
    hit: entry.hit,
    maskedSkipped: entry.maskedSkipped,
    uncovered: entry.uncovered,
  }));
}

function uncoveredKeys({
  entries,
  tableId,
}: {
  entries: CoverageEntry[];
  tableId: string;
}): string[] {
  return [
    ...new Set(
      entries
        .filter((entry) => entry.tableId === tableId)
        .flatMap((entry) => entry.uncovered.map((found) => found.key)),
    ),
  ];
}

function percent(entry: Pick<CoverageEntry, 'total' | 'hit'>): number | null {
  const rate = mappingCoverage.hitRate(entry);
  return rate === null ? null : Math.floor(rate * 100);
}

function summary(entry: CoverageEntry): string {
  const rate = percent(entry);
  if (rate === null) {
    return t('No lookups seen yet');
  }
  return t('Hit rate {rate}% ({hit} of {total} lookups)', {
    rate,
    hit: entry.hit,
    total: entry.total,
  });
}

export enum CoverageOrigin {
  RUNS = 'RUNS',
  SAMPLE = 'SAMPLE',
}

export const mappingCoverageUtils = {
  fromRuns,
  fromSample,
  sampleCoverage,
  uncoveredKeys,
  percent,
  summary,
};

export type CoverageEntry = {
  id: string;
  origin: CoverageOrigin;
  tableId: string;
  tableName: string;
  title: string;
  runsScanned: number | null;
  runsWithoutPayload: number;
  total: number;
  hit: number;
  maskedSkipped: number;
  uncovered: UncoveredKey[];
};

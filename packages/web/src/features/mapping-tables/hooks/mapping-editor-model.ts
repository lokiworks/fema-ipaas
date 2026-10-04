import {
  dataMapping,
  generateId,
  MappingCoverageSource,
  MappingResult,
  MappingRow,
  MappingSpec,
  MappingTableData,
  MappingTransformType,
} from '@fema-ipaas/core-utils';
import { useMemo, useState } from 'react';

import {
  AppliedSuggestion,
  AutoMappingTarget,
} from '../components/auto-mapping-dialog';
import { TableOption } from '../components/mapping-rows';
import { autoMapping } from '../utils/auto-mapping';
import {
  CoverageEntry,
  mappingCoverageUtils,
} from '../utils/mapping-coverage-utils';
import { MappingEntry, mappingSpecUtils } from '../utils/mapping-spec-utils';
import { templatePreview } from '../utils/template-preview';

import { mappingTablesHooks } from './mapping-tables-hooks';

export function useMappingModel({
  value,
  onChange,
  sampleData,
  projectId,
  runCoverage,
}: {
  value: unknown;
  onChange: (value: MappingSpec) => void;
  sampleData: Record<string, unknown>;
  projectId: string | null;
  runCoverage: MappingCoverageSource[];
}): MappingModel {
  const spec = mappingSpecUtils.parse(value);
  const [showAll, setShowAll] = useState(false);
  const { data: tableSummaries } =
    mappingTablesHooks.useMappingTables(projectId);
  const lookupIds = dataMapping.lookupTableIds(spec);
  const { data: tables } = mappingTablesHooks.useMappingTablesData(lookupIds);
  const tableData = useMemo<MappingTableData[]>(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        name: table.name,
        rows: table.rows,
        missingBehavior: table.missingBehavior,
        defaultValue: table.defaultValue ?? null,
      })),
    [tables],
  );
  const preview = useMemo(() => {
    const resolved: MappingSpec = {
      ...spec,
      fields: spec.fields.map((row) => {
        const source = templatePreview.resolveTemplate({
          template: row.source,
          sampleData,
        });
        return {
          ...row,
          source,
          transforms:
            source === undefined && row.constant === undefined
              ? row.transforms.filter(
                  (transform) => transform.type !== MappingTransformType.LOOKUP,
                )
              : row.transforms,
        };
      }),
    };
    return dataMapping.evaluate({ spec: resolved, tables: tableData });
  }, [spec, sampleData, tableData]);
  const coverage = useMemo(
    () => [
      ...mappingCoverageUtils.fromRuns(runCoverage),
      ...mappingCoverageUtils.fromSample({
        coverage: mappingCoverageUtils.sampleCoverage({
          spec,
          sampleData,
          tables: tableData,
        }),
        tables: tableData,
      }),
    ],
    [runCoverage, spec, sampleData, tableData],
  );
  const entries = mappingSpecUtils.buildEntries(spec);
  const visible = entries.filter(
    (entry) =>
      showAll ||
      entry.field === null ||
      entry.field.required ||
      (entry.row !== null && mappingSpecUtils.hasSource(entry.row)),
  );
  const mappedCount = entries.filter(
    (entry) =>
      (spec.destination === undefined || entry.field !== null) &&
      entry.row !== null &&
      mappingSpecUtils.hasSource(entry.row),
  ).length;
  const tableOptions: TableOption[] = tableSummaries ?? [];

  const patchSpec = (patch: Partial<MappingSpec>) =>
    onChange({ ...spec, ...patch });
  const updateEntry = ({
    entry,
    patch,
  }: {
    entry: MappingEntry;
    patch: Partial<MappingRow>;
  }) => {
    if (entry.row !== null) {
      const rowId = entry.row.id;
      patchSpec({
        fields: spec.fields.map((row) =>
          row.id === rowId ? { ...row, ...patch } : row,
        ),
      });
      return;
    }
    patchSpec({
      fields: [
        ...spec.fields,
        {
          id: generateId(),
          target: entry.field?.name ?? '',
          source: '',
          transforms: [],
          ...patch,
        },
      ],
    });
  };
  const autoTargets: AutoMappingTarget[] =
    spec.destination === undefined
      ? spec.fields
          .filter(
            (row) =>
              row.target.trim().length > 0 && !mappingSpecUtils.hasSource(row),
          )
          .map((row) => ({
            name: row.target.trim(),
            label: '',
            type: undefined,
          }))
      : entries.flatMap((entry) =>
          entry.field !== null &&
          (entry.row === null || !mappingSpecUtils.hasSource(entry.row))
            ? [
                {
                  name: entry.field.name,
                  label: entry.field.label ?? '',
                  type: entry.field.type,
                },
              ]
            : [],
        );

  return {
    spec,
    preview,
    entries,
    visible,
    hiddenCount: entries.length - visible.length,
    mappedCount,
    problems: preview.issues.length,
    tableOptions,
    tableData,
    coverage,
    showAll,
    autoTargets,
    setShowAll,
    patchSpec,
    updateEntry,
    removeRow: (id) =>
      patchSpec({ fields: spec.fields.filter((row) => row.id !== id) }),
    addRow: () =>
      patchSpec({
        fields: [
          ...spec.fields,
          { id: generateId(), target: '', source: '', transforms: [] },
        ],
      }),
    applySuggestions: (suggestions) =>
      patchSpec({
        fields: suggestions.reduce<MappingRow[]>((rows, suggestion) => {
          const existing = rows.find(
            (row) => row.target.trim() === suggestion.target,
          );
          const patch = {
            source: autoMapping.sourceTemplate(suggestion.sourcePath),
            transforms: suggestion.transforms,
          };
          return existing
            ? rows.map((row) =>
                row.id === existing.id ? { ...row, ...patch } : row,
              )
            : [
                ...rows,
                { id: generateId(), target: suggestion.target, ...patch },
              ];
        }, spec.fields),
      }),
  };
}

export type MappingModel = {
  spec: MappingSpec;
  preview: MappingResult;
  entries: MappingEntry[];
  visible: MappingEntry[];
  hiddenCount: number;
  mappedCount: number;
  problems: number;
  tableOptions: TableOption[];
  tableData: MappingTableData[];
  coverage: CoverageEntry[];
  showAll: boolean;
  autoTargets: AutoMappingTarget[];
  setShowAll: (showAll: boolean) => void;
  patchSpec: (patch: Partial<MappingSpec>) => void;
  updateEntry: (params: {
    entry: MappingEntry;
    patch: Partial<MappingRow>;
  }) => void;
  removeRow: (id: string) => void;
  addRow: () => void;
  applySuggestions: (suggestions: AppliedSuggestion[]) => void;
};

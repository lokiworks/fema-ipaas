import {
  dataMapping,
  generateId,
  MappingFieldType,
  MappingIssue,
  MappingIssueSeverity,
  MappingItemRow,
  MappingMissingBehavior,
  MappingRow,
  MappingSpec,
  MappingTableData,
  MappingTargetField,
  MappingTargetItemField,
  MappingTransform,
  MappingTransformType,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  ListTree,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { mappingTablesHooks } from '../hooks/mapping-tables-hooks';
import { autoMapping } from '../utils/auto-mapping';
import { mappingIssueText } from '../utils/mapping-issue-text';
import { TargetOption } from '../utils/target-schema';
import { templatePreview } from '../utils/template-preview';

import { AutoMappingButton, AutoMappingTarget } from './auto-mapping-dialog';

export function MappingEditor({
  value,
  onChange,
  disabled,
  sampleData,
  targetOptions,
  renderSourceInput,
}: {
  value: unknown;
  onChange: (value: MappingSpec) => void;
  disabled: boolean;
  sampleData: Record<string, unknown>;
  targetOptions: TargetOption[];
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
}) {
  const spec = parseSpec(value);
  const projectId = authenticationSession.getProjectId();
  const [showAll, setShowAll] = useState(false);
  const { data: tableSummaries } =
    mappingTablesHooks.useMappingTables(projectId);
  const lookupIds = dataMapping.lookupTableIds(spec);
  const { data: tables } = mappingTablesHooks.useMappingTablesData(lookupIds);
  const tableData: MappingTableData[] = (tables ?? []).map((table) => ({
    id: table.id,
    name: table.name,
    rows: table.rows,
    missingBehavior: table.missingBehavior,
    defaultValue: table.defaultValue ?? null,
  }));
  const preview = useMemo(() => {
    const resolved: MappingSpec = {
      ...spec,
      fields: spec.fields.map((row) => ({
        ...row,
        source: templatePreview.resolveTemplate({
          template: row.source,
          sampleData,
        }),
      })),
    };
    return dataMapping.evaluate({ spec: resolved, tables: tableData });
  }, [spec, sampleData, tableData]);
  const entries = buildEntries(spec);
  const visible = entries.filter(
    (entry) =>
      showAll ||
      entry.field === null ||
      entry.field.required ||
      (entry.row !== null && hasSource(entry.row)),
  );
  const hiddenCount = entries.length - visible.length;
  const mappedCount = entries.filter(
    (entry) => entry.row !== null && hasSource(entry.row),
  ).length;
  const problems = preview.issues.length;
  const tableOptions = tableSummaries ?? [];

  const patchSpec = (patch: Partial<MappingSpec>) =>
    onChange({ ...spec, ...patch });
  const updateEntry = ({
    entry,
    patch,
  }: {
    entry: Entry;
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
  const removeRow = (id: string) =>
    patchSpec({ fields: spec.fields.filter((row) => row.id !== id) });
  const addRow = () =>
    patchSpec({
      fields: [
        ...spec.fields,
        { id: generateId(), target: '', source: '', transforms: [] },
      ],
    });
  const autoTargets: AutoMappingTarget[] =
    spec.target === undefined
      ? spec.fields
          .filter((row) => row.target.trim().length > 0 && !hasSource(row))
          .map((row) => ({
            name: row.target.trim(),
            label: '',
            type: undefined,
          }))
      : entries.flatMap((entry) =>
          entry.field !== null && (entry.row === null || !hasSource(entry.row))
            ? [
                {
                  name: entry.field.name,
                  label: entry.field.label ?? '',
                  type: entry.field.type,
                },
              ]
            : [],
        );

  return (
    <div className="@container flex flex-col gap-3">
      <TargetPicker
        value={spec.target}
        options={targetOptions}
        disabled={disabled}
        onChange={(target) => patchSpec({ target })}
      />
      <div
        className={cn(
          'text-xs text-muted-foreground',
          problems > 0 && 'text-destructive',
        )}
        data-testid="mapping-summary"
      >
        {spec.target
          ? t('{mapped} of {total} fields mapped · {problems} problems', {
              mapped: mappedCount,
              total: entries.filter((entry) => entry.field !== null).length,
              problems,
            })
          : t('{fields} fields mapped · {errors} problems', {
              fields: spec.fields.filter((row) => row.target.trim().length > 0)
                .length,
              errors: problems,
            })}
      </div>
      {visible.map((entry) => {
        const rowId = entry.row?.id ?? null;
        const rowResult = preview.rows.find(
          (candidate) => candidate.id === rowId,
        );
        const rowIssues = preview.issues.filter((found) =>
          entry.row === null
            ? found.rowId === null && found.target === entry.field?.name
            : found.rowId === rowId,
        );
        return (
          <MappingRowCard
            key={entry.key}
            entry={entry}
            disabled={disabled}
            issues={rowIssues}
            value={rowResult?.value}
            hasPreview={rowResult !== undefined}
            sampleData={sampleData}
            tables={tableOptions}
            tableData={tableData}
            renderSourceInput={renderSourceInput}
            onPatch={(patch) => updateEntry({ entry, patch })}
            onRemove={() => rowId !== null && removeRow(rowId)}
          />
        );
      })}
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setShowAll(true)}
        >
          {t('Show {count} optional fields', { count: hiddenCount })}
        </Button>
      )}
      {showAll && hiddenCount === 0 && spec.target !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setShowAll(false)}
        >
          {t('Hide unmapped optional fields')}
        </Button>
      )}
      {spec.target === undefined && spec.fields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'Pick the step this data is written to, or add fields by hand. Each field takes its value from an earlier step or a fixed value.',
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {spec.target === undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={addRow}
          >
            <Plus className="size-4 mr-1" />
            {t('Add field')}
          </Button>
        )}
        {projectId && (
          <AutoMappingButton
            projectId={projectId}
            targets={autoTargets}
            sampleData={sampleData}
            disabled={disabled}
            onApply={(suggestions) => {
              const applied = suggestions.reduce<MappingRow[]>(
                (rows, suggestion) => {
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
                        {
                          id: generateId(),
                          target: suggestion.target,
                          ...patch,
                        },
                      ];
                },
                spec.fields,
              );
              patchSpec({ fields: applied });
            }}
          />
        )}
      </div>
      {preview.rows.length > 0 && (
        <details className="rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t('Preview result')}
          </summary>
          <pre
            className="mt-2 max-h-60 overflow-auto font-mono break-all whitespace-pre-wrap"
            data-testid="mapping-result-json"
          >
            {JSON.stringify(preview.value, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function TargetPicker({
  value,
  options,
  disabled,
  onChange,
}: {
  value: MappingSpec['target'];
  options: TargetOption[];
  disabled: boolean;
  onChange: (target: MappingSpec['target']) => void;
}) {
  const current = value
    ? `${value.connectorName}/${value.actionName}`
    : NO_TARGET;
  const known = options.some((option) => option.key === current);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{t('Write the result to')}</span>
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(key) =>
          onChange(options.find((option) => option.key === key)?.target)
        }
      >
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={t('Write the result to')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TARGET}>
            {t('No target, free fields')}
          </SelectItem>
          {!known && value && (
            <SelectItem value={current}>
              {value.displayName ?? value.actionName}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.length === 0 && value === undefined && (
        <span className="text-xs text-muted-foreground">
          {t(
            'Add the step that writes the data first, then pick it here to get its fields with types and required marks.',
          )}
        </span>
      )}
    </div>
  );
}

function MappingRowCard({
  entry,
  disabled,
  issues,
  value,
  hasPreview,
  sampleData,
  tables,
  tableData,
  renderSourceInput,
  onPatch,
  onRemove,
}: {
  entry: Entry;
  disabled: boolean;
  issues: MappingIssue[];
  value: unknown;
  hasPreview: boolean;
  sampleData: Record<string, unknown>;
  tables: TableOption[];
  tableData: MappingTableData[];
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
  onPatch: (patch: Partial<MappingRow>) => void;
  onRemove: () => void;
}) {
  const { field, row } = entry;
  const transforms = row?.transforms ?? [];
  const errors = issues.filter(
    (found) => found.severity === MappingIssueSeverity.ERROR,
  );
  const warnings = issues.filter(
    (found) => found.severity === MappingIssueSeverity.WARNING,
  );
  const status =
    errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  const trail = trailOf({ row, sampleData, tableData });
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3 @2xl:grid @2xl:grid-cols-[minmax(140px,1fr)_minmax(200px,2fr)_minmax(160px,2fr)_minmax(140px,1.5fr)] @2xl:items-start',
        errors.length > 0 && 'border-destructive/60',
      )}
      data-testid={`mapping-row-${field?.name ?? row?.target ?? ''}`}
    >
      <div className="flex items-center gap-2">
        {field ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-sm font-medium">
              <span className="truncate">{field.label ?? field.name}</span>
              {field.required && (
                <span className="text-destructive" title={t('Required')}>
                  *
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-mono">{field.name}</span>
              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                {mappingIssueText.typeLabel(field.type)}
              </Badge>
            </span>
          </div>
        ) : (
          <Input
            className="h-8 font-mono text-xs"
            value={row?.target ?? ''}
            disabled={disabled}
            placeholder={t('Target field')}
            aria-label={t('Target field')}
            onChange={(event) => onPatch({ target: event.target.value })}
          />
        )}
        {(field === null || field.type === MappingFieldType.ARRAY) && (
          <Button
            type="button"
            variant={row?.each ? 'secondary' : 'ghost'}
            size="sm"
            disabled={disabled}
            title={t('Map each item of a list')}
            aria-label={t('Map each item of a list')}
            onClick={() =>
              onPatch({
                each: row?.each ? undefined : eachRowsFor(field?.item ?? []),
              })
            }
          >
            <ListTree className="size-4" />
          </Button>
        )}
        {field === null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={t('Delete')}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <div>
        {renderSourceInput({
          value: typeof row?.source === 'string' ? row.source : '',
          disabled,
          onChange: (source) => onPatch({ source }),
        })}
      </div>
      <div>
        {row?.each ? (
          <EachEditor
            rows={row.each}
            itemFields={field?.item ?? []}
            disabled={disabled}
            tables={tables}
            onChange={(each) => onPatch({ each })}
          />
        ) : (
          <TransformChain
            transforms={transforms}
            disabled={disabled}
            tables={tables}
            onChange={(next) => onPatch({ transforms: next })}
          />
        )}
      </div>
      <div
        className={cn(
          'flex items-start gap-1.5 rounded bg-muted/40 px-2 py-1 font-mono text-xs break-all',
          status === 'error' && 'text-destructive',
          status === 'warning' && 'text-warning-700',
        )}
        data-testid="mapping-row-preview"
        data-status={status}
      >
        {status === 'error' ? (
          <CircleAlert className="mt-0.5 size-3 shrink-0" />
        ) : (
          row !== null &&
          hasPreview &&
          value !== undefined && <Check className="mt-0.5 size-3 shrink-0" />
        )}
        <span>
          {row === null || !hasSource(row)
            ? field?.required
              ? t('Not mapped')
              : t('Not written')
            : previewText(value)}
        </span>
      </div>
      {(issues.length > 0 || trail.length > 1) && (
        <div className="flex flex-col gap-1 @2xl:col-span-4">
          {issues.map((found) => (
            <span
              key={`${found.code}-${found.target}`}
              className={cn(
                'text-xs',
                found.severity === MappingIssueSeverity.ERROR
                  ? 'text-destructive'
                  : 'text-warning-700',
              )}
              data-testid="mapping-issue"
            >
              {mappingIssueText.describe(found)}
            </span>
          ))}
          {trail.length > 1 && (
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {trail.map((step, index) => (
                <span key={`${step.label}-${index}`} className="flex gap-1">
                  <span>{step.label}</span>
                  <span className="font-mono">{previewText(step.value)}</span>
                  {index < trail.length - 1 && <span>→</span>}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <LookupHints transforms={transforms} tables={tables} />
    </div>
  );
}

function LookupHints({
  transforms,
  tables,
}: {
  transforms: MappingTransform[];
  tables: TableOption[];
}) {
  const used = transforms
    .filter(
      (transform) =>
        transform.type === MappingTransformType.LOOKUP &&
        transform.arg !== undefined,
    )
    .flatMap((transform) =>
      tables.filter((table) => table.id === transform.arg),
    );
  if (used.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground @2xl:col-span-4">
      {used.map((table) => (
        <span key={table.id} className="flex flex-wrap items-center gap-1">
          {t('{name}: {count} rows, when a value is missing: {behavior}', {
            name: table.name,
            count: table.rowCount ?? 0,
            behavior: missingLabel(table.missingBehavior),
          })}
          <a
            className="text-primary underline"
            href={authenticationSession.appendProjectRoutePrefix(
              `/mapping-tables?id=${table.id}`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            {t('Open mapping table')}
          </a>
        </span>
      ))}
    </div>
  );
}

function missingLabel(behavior: MappingMissingBehavior | undefined): string {
  switch (behavior) {
    case MappingMissingBehavior.DEFAULT:
      return t('Use a default value');
    case MappingMissingBehavior.PASSTHROUGH:
      return t('Keep the original value');
    default:
      return t('Fail the step');
  }
}

function buildEntries(spec: MappingSpec): Entry[] {
  const schemaFields = spec.target?.fields ?? [];
  const named = schemaFields.map<Entry>((field) => ({
    key: `field-${field.name}`,
    field,
    row: spec.fields.find((row) => row.target.trim() === field.name) ?? null,
  }));
  const extras = spec.fields
    .filter(
      (row) =>
        spec.target === undefined ||
        !schemaFields.some((field) => field.name === row.target.trim()),
    )
    .map<Entry>((row) => ({ key: `row-${row.id}`, field: null, row }));
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

function EachEditor({
  rows,
  itemFields,
  disabled,
  tables,
  onChange,
}: {
  rows: MappingItemRow[];
  itemFields: MappingTargetItemField[];
  disabled: boolean;
  tables: TableOption[];
  onChange: (rows: MappingItemRow[]) => void;
}) {
  const update = (id: string, patch: Partial<MappingItemRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-2 border-l-2 pl-3">
      <span className="text-xs text-muted-foreground">
        {t('For each item in the list')}
      </span>
      {rows.map((row) => {
        const itemField = itemFields.find((field) => field.name === row.target);
        return (
          <div key={row.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {itemField ? (
                <span className="flex w-full items-center gap-1 text-xs">
                  <span className="font-mono">{itemField.name}</span>
                  {itemField.required && (
                    <span className="text-destructive">*</span>
                  )}
                  <Badge variant="outline" className="px-1 py-0 text-[10px]">
                    {mappingIssueText.typeLabel(itemField.type)}
                  </Badge>
                </span>
              ) : (
                <Input
                  className="h-8 font-mono text-xs"
                  value={row.target}
                  disabled={disabled}
                  placeholder={t('Target field')}
                  onChange={(event) =>
                    update(row.id, { target: event.target.value })
                  }
                />
              )}
              <Input
                className="h-8 font-mono text-xs"
                value={row.itemPath ?? ''}
                disabled={disabled}
                placeholder={t('Item field, e.g. code')}
                onChange={(event) =>
                  update(row.id, { itemPath: event.target.value })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={t('Delete')}
                onClick={() =>
                  onChange(rows.filter((candidate) => candidate.id !== row.id))
                }
              >
                <X className="size-4" />
              </Button>
            </div>
            <TransformChain
              transforms={row.transforms}
              disabled={disabled}
              tables={tables}
              onChange={(transforms) => update(row.id, { transforms })}
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...rows,
            { id: generateId(), target: '', itemPath: '', transforms: [] },
          ])
        }
      >
        <Plus className="size-4 mr-1" />
        {t('Add item field')}
      </Button>
    </div>
  );
}

function TransformChain({
  transforms,
  disabled,
  tables,
  onChange,
}: {
  transforms: MappingTransform[];
  disabled: boolean;
  tables: TableOption[];
  onChange: (transforms: MappingTransform[]) => void;
}) {
  const update = (index: number, patch: Partial<MappingTransform>) =>
    onChange(
      transforms.map((transform, current) =>
        current === index ? { ...transform, ...patch } : transform,
      ),
    );
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= transforms.length) {
      return;
    }
    onChange(
      transforms.map((transform, current) =>
        current === index
          ? transforms[target]
          : current === target
          ? transforms[index]
          : transform,
      ),
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {transforms.map((transform, index) => (
        <div
          key={`${transform.type}-${index}`}
          className="flex items-center gap-1 rounded-md border px-1.5 py-0.5"
        >
          <Badge variant="outline" className="border-0 px-0">
            {transformLabel(transform.type)}
          </Badge>
          {transform.type === MappingTransformType.LOOKUP ? (
            <Select
              value={transform.arg}
              disabled={disabled}
              onValueChange={(arg) => update(index, { arg })}
            >
              <SelectTrigger className="h-6 w-32 text-xs">
                <SelectValue placeholder={t('Mapping table')} />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : TRANSFORMS_WITH_ARG.includes(transform.type) ? (
            <Input
              className="h-6 w-24 text-xs"
              value={transform.arg ?? ''}
              disabled={disabled}
              placeholder={argPlaceholder(transform.type)}
              onChange={(event) => update(index, { arg: event.target.value })}
            />
          ) : null}
          <button
            type="button"
            className="text-muted-foreground disabled:opacity-50"
            disabled={disabled}
            aria-label={t('Move up')}
            onClick={() => move(index, -1)}
          >
            <ArrowUp className="size-3" />
          </button>
          <button
            type="button"
            className="text-muted-foreground disabled:opacity-50"
            disabled={disabled}
            aria-label={t('Move down')}
            onClick={() => move(index, 1)}
          >
            <ArrowDown className="size-3" />
          </button>
          <button
            type="button"
            className="text-muted-foreground disabled:opacity-50"
            disabled={disabled}
            aria-label={t('Delete')}
            onClick={() =>
              onChange(transforms.filter((_, current) => current !== index))
            }
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={disabled}
          >
            <Plus className="size-3 mr-1" />
            {t('Transform')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.values(MappingTransformType).map((type) => (
            <DropdownMenuItem
              key={type}
              onSelect={() =>
                onChange([...transforms, { type, arg: defaultArg(type) }])
              }
            >
              {transformLabel(type)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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

function parseSpec(value: unknown): MappingSpec {
  const parsed = MappingSpec.safeParse(
    typeof value === 'string' ? safeJson(value) : value,
  );
  return parsed.success ? parsed.data : { fields: [] };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function previewText(value: unknown): string {
  if (value === undefined) {
    return t('No sample value yet');
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const TRANSFORMS_WITH_ARG = [
  MappingTransformType.DATE,
  MappingTransformType.DEFAULT,
  MappingTransformType.ROUND,
  MappingTransformType.SPLIT,
];

const NO_TARGET = 'none';

type TableOption = {
  id: string;
  name: string;
  rowCount?: number;
  missingBehavior?: MappingMissingBehavior;
};

type Entry = {
  key: string;
  field: MappingTargetField | null;
  row: MappingRow | null;
};

type TrailStep = {
  label: string;
  value: unknown;
  failed: boolean;
};

export type SourceInputParams = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

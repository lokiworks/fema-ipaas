import {
  generateId,
  MappingFieldType,
  MappingIssue,
  MappingIssueSeverity,
  MappingItemRow,
  MappingMissingBehavior,
  MappingRow,
  MappingTableData,
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
import { useRef } from 'react';

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

import {
  CoverageEntry,
  mappingCoverageUtils,
} from '../utils/mapping-coverage-utils';
import { mappingIssueText } from '../utils/mapping-issue-text';
import { MappingEntry, mappingSpecUtils } from '../utils/mapping-spec-utils';

export function MappingRowCard({
  entry,
  layout,
  disabled,
  issues,
  value,
  hasPreview,
  sampleData,
  tables,
  tableData,
  coverage,
  renderSourceInput,
  onPatch,
  onRemove,
  onOpenCoverage,
}: {
  entry: MappingEntry;
  layout: MappingRowLayout;
  disabled: boolean;
  issues: MappingIssue[];
  value: unknown;
  hasPreview: boolean;
  sampleData: Record<string, unknown>;
  tables: TableOption[];
  tableData: MappingTableData[];
  coverage: CoverageEntry[];
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
  onPatch: (patch: Partial<MappingRow>) => void;
  onRemove: () => void;
  onOpenCoverage: (tableId: string) => void;
}) {
  const { field, row } = entry;
  const wide = layout === MappingRowLayout.WIDE;
  const transforms = row?.transforms ?? [];
  const errors = issues.filter(
    (found) => found.severity === MappingIssueSeverity.ERROR,
  );
  const warnings = issues.filter(
    (found) => found.severity === MappingIssueSeverity.WARNING,
  );
  const status =
    errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  const trail = mappingSpecUtils.trailOf({ row, sampleData, tableData });
  const source = typeof row?.source === 'string' ? row.source : '';
  const lastEmitted = useRef(source);
  const revision = useRef(0);
  if (source !== lastEmitted.current) {
    revision.current += 1;
    lastEmitted.current = source;
  }
  const targetBlock = (
    <div className="flex items-center gap-2" key="target">
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
              each: row?.each
                ? undefined
                : mappingSpecUtils.eachRowsFor(field?.item ?? []),
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
  );
  const sourceBlock = (
    <div key={`source-${revision.current}`}>
      {renderSourceInput({
        value: source,
        disabled,
        onChange: (next) => {
          lastEmitted.current = next;
          onPatch({ source: next });
        },
      })}
    </div>
  );
  const transformBlock = (
    <div key="transform">
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
  );
  const previewBlock = (
    <div
      key="preview"
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
        {row === null || !mappingSpecUtils.hasSource(row)
          ? field?.required
            ? t('Not mapped')
            : t('Not written')
          : mappingSpecUtils.rowPreviewText({ row, value, sampleData })}
      </span>
    </div>
  );
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        wide
          ? '@xl:grid @xl:grid-cols-[minmax(140px,0.9fr)_minmax(200px,1.4fr)_minmax(220px,1.7fr)] @xl:items-start @xl:gap-x-4'
          : '@2xl:grid @2xl:grid-cols-[minmax(120px,0.8fr)_minmax(220px,2.4fr)_minmax(160px,1.8fr)_minmax(120px,1.2fr)] @2xl:items-start',
        errors.length > 0 && 'border-destructive/60',
      )}
      data-testid={`mapping-row-${field?.name ?? row?.target ?? ''}`}
      data-layout={layout}
    >
      {wide ? (
        <>
          {targetBlock}
          <div className="flex flex-col gap-2">
            {transformBlock}
            {previewBlock}
          </div>
          {sourceBlock}
        </>
      ) : (
        <>
          {targetBlock}
          {sourceBlock}
          {transformBlock}
          {previewBlock}
        </>
      )}
      {(issues.length > 0 || trail.length > 1) && (
        <div
          className={cn(
            'flex flex-col gap-1',
            wide ? '@xl:col-span-3' : '@2xl:col-span-4',
          )}
        >
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
                  <span className="font-mono">
                    {mappingSpecUtils.previewText(step.value)}
                  </span>
                  {index < trail.length - 1 && <span>→</span>}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <LookupHints
        transforms={transforms}
        tables={tables}
        coverage={coverage}
        wide={wide}
        onOpenCoverage={onOpenCoverage}
      />
    </div>
  );
}

function LookupHints({
  transforms,
  tables,
  coverage,
  wide,
  onOpenCoverage,
}: {
  transforms: MappingTransform[];
  tables: TableOption[];
  coverage: CoverageEntry[];
  wide: boolean;
  onOpenCoverage: (tableId: string) => void;
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
    <div
      className={cn(
        'flex flex-col gap-0.5 text-xs text-muted-foreground',
        wide ? '@xl:col-span-3' : '@2xl:col-span-4',
      )}
    >
      {used.map((table) => {
        const entries = coverage.filter((entry) => entry.tableId === table.id);
        const missing = mappingCoverageUtils.uncoveredKeys({
          entries,
          tableId: table.id,
        });
        return (
          <span key={table.id} className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-1">
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
            {entries.length > 0 && (
              <span
                className={cn(
                  'flex flex-wrap items-center gap-1',
                  missing.length > 0 && 'text-warning-700',
                )}
                data-testid="mapping-coverage-hint"
                data-uncovered={missing.length}
              >
                {entries.map((entry) => (
                  <span key={entry.id}>{coverageLine(entry)}</span>
                ))}
                {missing.length > 0 && (
                  <>
                    <span>
                      {t(
                        '{count, plural, =1 {1 value has no row: {values}} other {# values have no row: {values}}}',
                        {
                          count: missing.length,
                          values: missing.slice(0, 3).join(', '),
                        },
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-primary underline"
                      data-testid="mapping-coverage-open"
                      onClick={() => onOpenCoverage(table.id)}
                    >
                      {t('View and add')}
                    </button>
                  </>
                )}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function coverageLine(entry: CoverageEntry): string {
  const rate = mappingCoverageUtils.percent(entry);
  if (rate === null) {
    return '';
  }
  return entry.runsScanned === null
    ? t('Sample data: {rate}% covered.', { rate })
    : t('Last {runs} runs: {rate}% covered.', {
        runs: entry.runsScanned,
        rate,
      });
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
            {mappingSpecUtils.transformLabel(transform.type)}
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
          ) : mappingSpecUtils.TRANSFORMS_WITH_ARG.includes(transform.type) ? (
            <Input
              className="h-6 w-24 text-xs"
              value={transform.arg ?? ''}
              disabled={disabled}
              placeholder={mappingSpecUtils.argPlaceholder(transform.type)}
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
                onChange([
                  ...transforms,
                  { type, arg: mappingSpecUtils.defaultArg(type) },
                ])
              }
            >
              {mappingSpecUtils.transformLabel(type)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export enum MappingRowLayout {
  COMPACT = 'COMPACT',
  WIDE = 'WIDE',
}

export type TableOption = {
  id: string;
  name: string;
  rowCount?: number;
  valueLabel?: string;
  missingBehavior?: MappingMissingBehavior;
};

export type SourceInputParams = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

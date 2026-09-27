import {
  dataMapping,
  generateId,
  MappingItemRow,
  MappingRow,
  MappingSpec,
  MappingTableData,
  MappingTransform,
  MappingTransformType,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2, X } from 'lucide-react';
import { useMemo } from 'react';

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
import { templatePreview } from '../utils/template-preview';

import { AutoMappingButton } from './auto-mapping-dialog';

export function MappingEditor({
  value,
  onChange,
  disabled,
  sampleData,
  renderSourceInput,
}: {
  value: unknown;
  onChange: (value: MappingSpec) => void;
  disabled: boolean;
  sampleData: Record<string, unknown>;
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
}) {
  const spec = parseSpec(value);
  const projectId = authenticationSession.getProjectId();
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
  const errors = preview.rows.filter((row) => row.error !== null).length;

  const updateRow = (id: string, patch: Partial<MappingRow>) =>
    onChange({
      fields: spec.fields.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  const removeRow = (id: string) =>
    onChange({ fields: spec.fields.filter((row) => row.id !== id) });
  const addRow = () =>
    onChange({
      fields: [
        ...spec.fields,
        { id: generateId(), target: '', source: '', transforms: [] },
      ],
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">
        {t('{fields} fields mapped · {errors} problems', {
          fields: spec.fields.filter((row) => row.target.trim().length > 0)
            .length,
          errors,
        })}
      </div>
      {spec.fields.map((row) => {
        const rowPreview = preview.rows.find(
          (candidate) => candidate.id === row.id,
        );
        return (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                className="h-8 font-mono text-xs"
                value={row.target}
                disabled={disabled}
                placeholder={t('Target field')}
                aria-label={t('Target field')}
                onChange={(event) =>
                  updateRow(row.id, { target: event.target.value })
                }
              />
              <Button
                type="button"
                variant={row.each ? 'secondary' : 'ghost'}
                size="sm"
                disabled={disabled}
                title={t('Map each item of a list')}
                aria-label={t('Map each item of a list')}
                onClick={() =>
                  updateRow(row.id, {
                    each: row.each
                      ? undefined
                      : [
                          {
                            id: generateId(),
                            target: '',
                            itemPath: '',
                            transforms: [],
                          },
                        ],
                  })
                }
              >
                <ListTree className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={t('Delete')}
                onClick={() => removeRow(row.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {renderSourceInput({
              value: typeof row.source === 'string' ? row.source : '',
              disabled,
              onChange: (source) => updateRow(row.id, { source }),
            })}
            {row.each ? (
              <EachEditor
                rows={row.each}
                disabled={disabled}
                tables={tableSummaries ?? []}
                onChange={(each) => updateRow(row.id, { each })}
              />
            ) : (
              <TransformChain
                transforms={row.transforms}
                disabled={disabled}
                tables={tableSummaries ?? []}
                onChange={(transforms) => updateRow(row.id, { transforms })}
              />
            )}
            {rowPreview && (
              <div
                className={cn(
                  'rounded bg-muted/40 px-2 py-1 font-mono text-xs break-all',
                  rowPreview.error !== null && 'text-destructive',
                )}
              >
                {rowPreview.error ?? previewText(rowPreview.value)}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
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
        {projectId && (
          <AutoMappingButton
            projectId={projectId}
            targets={spec.fields
              .filter(
                (row) =>
                  row.target.trim().length > 0 &&
                  (typeof row.source !== 'string' || row.source.length === 0),
              )
              .map((row) => row.target.trim())}
            sampleData={sampleData}
            disabled={disabled}
            onApply={(suggestions) =>
              onChange({
                fields: spec.fields.map((row) => {
                  const suggestion = suggestions.find(
                    (item) => item.target === row.target.trim(),
                  );
                  return suggestion
                    ? {
                        ...row,
                        source: autoMapping.sourceTemplate(
                          suggestion.sourcePath,
                        ),
                      }
                    : row;
                }),
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function EachEditor({
  rows,
  disabled,
  tables,
  onChange,
}: {
  rows: MappingItemRow[];
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
      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              className="h-8 font-mono text-xs"
              value={row.target}
              disabled={disabled}
              placeholder={t('Target field')}
              onChange={(event) =>
                update(row.id, { target: event.target.value })
              }
            />
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
      ))}
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

type TableOption = {
  id: string;
  name: string;
};

export type SourceInputParams = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

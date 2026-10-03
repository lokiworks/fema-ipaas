import { MappingMissingBehavior, Permission } from '@fema-ipaas/core-utils';
import {
  MappingTable,
  MappingTableRow,
  MappingTableSummary,
  MAPPING_TABLE_MAX_ROWS,
  UpsertMappingTableRequestBody,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Download, Plus, Table2, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ImportMode,
  ImportRowStatus,
  mappingCsv,
  mappingTablesHooks,
} from '@/features/mapping-tables';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { useSubmitLock } from '@/hooks/use-submit-lock';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

function MappingTablesPage() {
  const projectId = authenticationSession.getProjectId()!;
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_WORKFLOW);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tables, isLoading } = mappingTablesHooks.useMappingTables(
    projectId,
    true,
  );
  const selectedId = searchParams.get('id') ?? tables?.[0]?.id ?? null;
  const [creating, setCreating] = useState(false);
  const select = (id: string) => setSearchParams({ id });

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4 w-full">
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          disabled={!canWrite}
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4 mr-1" />
          {t('New mapping table')}
        </Button>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {(tables ?? []).map((table) => (
          <TableListItem
            key={table.id}
            table={table}
            active={table.id === selectedId}
            onSelect={() => select(table.id)}
          />
        ))}
        {!isLoading && (tables ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(
              'Mapping tables translate codes between systems, like department names to department IDs.',
            )}
          </p>
        )}
      </div>
      <div>
        {selectedId ? (
          <MappingTableEditorLoader
            key={selectedId}
            id={selectedId}
            canWrite={canWrite}
            onDeleted={() => setSearchParams({})}
          />
        ) : (
          <div className="flex flex-col items-start gap-2 text-muted-foreground">
            <Table2 className="size-10" />
            <span className="text-sm">
              {t('Create a mapping table to get started.')}
            </span>
          </div>
        )}
      </div>
      <NewTableDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={select}
      />
    </div>
  );
}

function TableListItem({
  table,
  active,
  onSelect,
}: {
  table: MappingTableSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-accent',
        active && 'border-primary bg-primary/5',
      )}
    >
      <span className="text-sm font-medium truncate w-full">{table.name}</span>
      <span className="text-xs text-muted-foreground">
        {table.keyLabel} → {table.valueLabel} ·{' '}
        {t('{count} rows', { count: table.rowCount })}
      </span>
    </button>
  );
}

function MappingTableEditorLoader({
  id,
  canWrite,
  onDeleted,
}: {
  id: string;
  canWrite: boolean;
  onDeleted: () => void;
}) {
  const { data: table, isLoading } = mappingTablesHooks.useMappingTable(id);
  if (isLoading || !table) {
    return <Skeleton className="h-96 w-full" />;
  }
  return (
    <MappingTableEditor
      key={String(table.updated)}
      table={table}
      canWrite={canWrite}
      onDeleted={onDeleted}
    />
  );
}

function MappingTableEditor({
  table,
  canWrite,
  onDeleted,
}: {
  table: MappingTable;
  canWrite: boolean;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<UpsertMappingTableRequestBody>(
    toRequest(table),
  );
  const [newRow, setNewRow] = useState<MappingTableRow>({ k: '', v: '' });
  const [importOpen, setImportOpen] = useState(false);
  const { mutate: save, isPending } = mappingTablesHooks.useSaveMappingTable();
  const { mutateAsync: deleteTable } =
    mappingTablesHooks.useDeleteMappingTable();
  const { data: references } = mappingTablesHooks.useReferences(table.id);
  const validation = UpsertMappingTableRequestBody.safeParse(draft);
  const newRowProblem = rowProblem({ row: newRow, rows: draft.rows });
  const dirty = JSON.stringify(draft) !== JSON.stringify(toRequest(table));

  const setRows = (rows: MappingTableRow[]) => setDraft({ ...draft, rows });
  const exportCsv = () => {
    const blob = new Blob(
      [
        mappingCsv.serialize({
          rows: draft.rows,
          keyLabel: draft.keyLabel,
          valueLabel: draft.valueLabel,
        }),
      ],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>{table.name}</CardTitle>
            <CardDescription>
              {t('Updated')} <FormattedDate date={new Date(table.updated)} />
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite}
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-4 mr-1" />
              {t('Import CSV')}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4 mr-1" />
              {t('Export CSV')}
            </Button>
            <ConfirmationDeleteDialog
              title={t('Delete mapping table')}
              message={t(
                'Steps that look up this table would fail, so it can only be deleted when nothing uses it.',
              )}
              entityName={table.name}
              isDanger
              mutationFn={async () => {
                await deleteTable(table.id);
                onDeleted();
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('Delete')}
                disabled={!canWrite || (references ?? []).length > 0}
              >
                <Trash2 className="size-4" />
              </Button>
            </ConfirmationDeleteDialog>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <LabeledInput
            label={t('Name')}
            value={draft.name}
            disabled={!canWrite}
            maxLength={30}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <LabeledInput
            label={t('Description')}
            value={draft.description}
            disabled={!canWrite}
            maxLength={100}
            onChange={(description) => setDraft({ ...draft, description })}
          />
          <LabeledInput
            label={t('Key column')}
            value={draft.keyLabel}
            disabled={!canWrite}
            maxLength={20}
            onChange={(keyLabel) => setDraft({ ...draft, keyLabel })}
          />
          <LabeledInput
            label={t('Value column')}
            value={draft.valueLabel}
            disabled={!canWrite}
            maxLength={20}
            onChange={(valueLabel) => setDraft({ ...draft, valueLabel })}
          />
          <div className="col-span-2 flex flex-col gap-2">
            <Label>{t('When a key is not found')}</Label>
            <RadioGroup
              value={draft.missingBehavior}
              disabled={!canWrite}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  missingBehavior: toMissingBehavior(value),
                })
              }
              className="flex gap-4"
            >
              {Object.values(MappingMissingBehavior).map((behavior) => (
                <label
                  key={behavior}
                  className="flex items-center gap-2 text-sm"
                >
                  <RadioGroupItem value={behavior} />
                  {missingBehaviorLabel(behavior)}
                </label>
              ))}
            </RadioGroup>
            {draft.missingBehavior === MappingMissingBehavior.DEFAULT && (
              <Input
                className="w-64"
                value={draft.defaultValue ?? ''}
                disabled={!canWrite}
                placeholder={t('Default value')}
                onChange={(event) =>
                  setDraft({ ...draft, defaultValue: event.target.value })
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Rows')}</CardTitle>
          <CardDescription>
            {t('{count} of {max} rows. Keys are case sensitive.', {
              count: draft.rows.length,
              max: MAPPING_TABLE_MAX_ROWS,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
            <span>{draft.keyLabel}</span>
            <span>{draft.valueLabel}</span>
            <span />
          </div>
          {canWrite && (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={newRow.k}
                placeholder={t('New key')}
                onChange={(event) =>
                  setNewRow({ ...newRow, k: event.target.value })
                }
              />
              <Input
                value={newRow.v}
                placeholder={t('New value')}
                onChange={(event) =>
                  setNewRow({ ...newRow, v: event.target.value })
                }
              />
              <Button
                size="sm"
                disabled={newRowProblem !== null}
                title={newRowProblem ?? undefined}
                onClick={() => {
                  setRows([{ k: newRow.k.trim(), v: newRow.v }, ...draft.rows]);
                  setNewRow({ k: '', v: '' });
                }}
              >
                {t('Add')}
              </Button>
            </div>
          )}
          {newRow.k.length > 0 && newRowProblem && (
            <p className="text-xs text-destructive">{newRowProblem}</p>
          )}
          <div className="flex flex-col gap-1 max-h-[480px] overflow-y-auto">
            {draft.rows.map((row, index) => (
              <div
                key={`${index}-${row.k}`}
                className="grid grid-cols-[1fr_1fr_auto] gap-2"
              >
                <Input
                  aria-label={draft.keyLabel || t('Key')}
                  value={row.k}
                  disabled={!canWrite}
                  onChange={(event) =>
                    setRows(
                      draft.rows.map((candidate, current) =>
                        current === index
                          ? { ...candidate, k: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={draft.valueLabel || t('Value')}
                  value={row.v}
                  disabled={!canWrite}
                  onChange={(event) =>
                    setRows(
                      draft.rows.map((candidate, current) =>
                        current === index
                          ? { ...candidate, v: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('Delete')}
                  disabled={!canWrite}
                  onClick={() =>
                    setRows(
                      draft.rows.filter((_, current) => current !== index),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {!validation.success && dirty && (
            <p className="text-xs text-destructive">
              {t(validation.error.issues[0]?.message ?? 'formErrors.required')}
            </p>
          )}
          <Button
            className="self-start"
            size="sm"
            disabled={!canWrite || !dirty || !validation.success || isPending}
            loading={isPending}
            onClick={() => save({ id: table.id, request: draft })}
          >
            {t('Save changes')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Used by')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {(references ?? []).map((reference) => (
              <li
                key={`${reference.workflowId}-${reference.stepName}-${reference.published}`}
                className="flex items-center gap-2"
              >
                <span>{reference.workflowDisplayName}</span>
                <span className="text-muted-foreground">
                  · {reference.stepDisplayName}
                </span>
                <Badge variant="outline">
                  {reference.published ? t('Published') : t('Draft')}
                </Badge>
              </li>
            ))}
            {(references ?? []).length === 0 && (
              <li className="text-muted-foreground">
                {t('No step uses this table yet.')}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        rows={draft.rows}
        labels={[draft.keyLabel, draft.valueLabel]}
        onApply={setRows}
      />
    </div>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  rows,
  labels,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: MappingTableRow[];
  labels: [string, string];
  onApply: (rows: MappingTableRow[]) => void;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ImportMode>(ImportMode.MERGE);
  const parsed = mappingCsv.parse({ text, labels });
  const preview = mappingCsv.merge({
    current: rows,
    incoming: parsed.rows,
    mode,
  });
  const changes =
    preview.outcomes.filter(
      (outcome) =>
        outcome.status === ImportRowStatus.ADDED ||
        outcome.status === ImportRowStatus.UPDATED,
    ).length + preview.removed.length;
  const readFile = async (file: File | undefined) => {
    if (!file || file.size > MAX_IMPORT_BYTES) {
      return;
    }
    setText(await file.text());
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Import CSV')}</DialogTitle>
          <DialogDescription>
            {t(
              'Paste two columns (key, value) or choose a UTF-8 .csv file up to 2 MB. A header row is detected automatically.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            type="file"
            accept=".csv,.txt"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          <Textarea
            value={text}
            className="min-h-32 font-mono text-xs"
            onChange={(event) => setText(event.target.value)}
          />
          <RadioGroup
            value={mode}
            onValueChange={(value) =>
              setMode(
                value === ImportMode.REPLACE
                  ? ImportMode.REPLACE
                  : ImportMode.MERGE,
              )
            }
            className="flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={ImportMode.MERGE} />
              {t('Merge with existing rows')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={ImportMode.REPLACE} />
              {t('Replace all rows')}
            </label>
          </RadioGroup>
          <ul className="max-h-48 overflow-y-auto text-xs flex flex-col gap-1">
            {preview.outcomes
              .slice(0, MAX_PREVIEW_ROWS)
              .map((outcome, index) => (
                <li key={index} className="flex justify-between gap-2">
                  <span className="font-mono truncate">
                    {outcome.row.k} → {outcome.row.v}
                  </span>
                  <span
                    className={cn(
                      outcome.status === ImportRowStatus.SKIPPED &&
                        'text-destructive',
                    )}
                  >
                    {importStatusLabel(outcome.status)}
                  </span>
                </li>
              ))}
            {preview.removed.length > 0 && (
              <li className="text-destructive">
                {t('{count} existing rows will be removed', {
                  count: preview.removed.length,
                })}
              </li>
            )}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={
              changes === 0 || preview.result.length > MAPPING_TABLE_MAX_ROWS
            }
            onClick={() => {
              onApply(preview.result);
              setText('');
              onOpenChange(false);
            }}
          >
            {t('Import ({count} changes)', { count: changes })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTableDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const projectId = authenticationSession.getProjectId()!;
  const [name, setName] = useState('');
  const { mutate: save, isPending } = mappingTablesHooks.useSaveMappingTable();
  const request: UpsertMappingTableRequestBody = {
    projectId,
    name,
    description: '',
    keyLabel: t('Original value'),
    valueLabel: t('Mapped value'),
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
    rows: [],
  };
  const submitLock = useSubmitLock();
  const canSubmit = name.trim().length > 0 && !isPending;
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !submitLock.acquire()) {
      return;
    }
    save(
      { id: null, request },
      {
        onSettled: submitLock.release,
        onSuccess: (table) => {
          onCreated(table.id);
          setName('');
          onOpenChange(false);
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('New mapping table')}</DialogTitle>
          </DialogHeader>
          <LabeledInput
            label={t('Name')}
            value={name}
            disabled={false}
            maxLength={30}
            onChange={setName}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={isPending}>
              {t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({
  label,
  value,
  disabled,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function rowProblem({
  row,
  rows,
}: {
  row: MappingTableRow;
  rows: MappingTableRow[];
}): string | null {
  const key = row.k.trim();
  if (key.length === 0) {
    return t('mappingKeyRequired');
  }
  if (key.length > 100) {
    return t('mappingKeyTooLong');
  }
  if (row.v.length > 200) {
    return t('mappingValueTooLong');
  }
  if (rows.some((candidate) => candidate.k === key)) {
    return t('mappingKeyDuplicated');
  }
  return null;
}

function toRequest(table: MappingTable): UpsertMappingTableRequestBody {
  return {
    projectId: table.projectId,
    name: table.name,
    description: table.description,
    keyLabel: table.keyLabel,
    valueLabel: table.valueLabel,
    missingBehavior: table.missingBehavior,
    defaultValue: table.defaultValue ?? null,
    rows: table.rows,
  };
}

function toMissingBehavior(value: string): MappingMissingBehavior {
  return (
    Object.values(MappingMissingBehavior).find(
      (behavior) => behavior === value,
    ) ?? MappingMissingBehavior.ERROR
  );
}

function missingBehaviorLabel(behavior: MappingMissingBehavior): string {
  switch (behavior) {
    case MappingMissingBehavior.ERROR:
      return t('Fail the step');
    case MappingMissingBehavior.DEFAULT:
      return t('Use a default value');
    case MappingMissingBehavior.PASSTHROUGH:
      return t('Keep the original value');
  }
}

function importStatusLabel(status: ImportRowStatus): string {
  switch (status) {
    case ImportRowStatus.ADDED:
      return t('New');
    case ImportRowStatus.UPDATED:
      return t('Updated');
    case ImportRowStatus.UNCHANGED:
      return t('Unchanged');
    case ImportRowStatus.SKIPPED:
      return t('Skipped');
  }
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_ROWS = 100;

export { MappingTablesPage };

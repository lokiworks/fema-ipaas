import { Permission } from '@fema-ipaas/core-utils';
import { DataStoreRecord, DataStoreSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Copy,
  Database,
  Eraser,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { SearchInput } from '@/components/custom/search-input';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataStoreDialog,
  dataStoresHooks,
  dataStoreUtils,
  DeleteDataStoreDialog,
  RecordDialog,
  ViewOnlyTooltip,
} from '@/features/data-stores';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { recentVisits } from '@/lib/recent-visits';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

function DataStoresPage() {
  const projectId = authenticationSession.getProjectId() ?? '';
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_WORKFLOW);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: stores, isLoading } = dataStoresHooks.useDataStores(projectId);
  const requestedId = searchParams.get('id');
  const requested =
    (stores ?? []).find((store) => store.id === requestedId) ?? null;
  const selected = requested ?? stores?.[0] ?? null;
  const requestedName = requested?.name ?? null;
  const requestedProjectId = requested?.projectId ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DataStoreSummary | null>(null);
  const [deleting, setDeleting] = useState<DataStoreSummary | null>(null);

  useEffect(() => {
    if (requestedId && requestedName !== null && requestedProjectId !== null) {
      recentVisits.record({
        type: 'dataStore',
        id: requestedId,
        projectId: requestedProjectId,
        name: requestedName,
      });
    }
  }, [requestedId, requestedName, requestedProjectId]);

  const select = (id: string) => setSearchParams({ id });
  const openDialog = (store: DataStoreSummary | null) => {
    setEditing(store);
    setDialogOpen(true);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 w-full py-4',
        DASHBOARD_CONTENT_PADDING_X,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold">{t('Data stores')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dataStoresPageDescription')}
          </p>
        </div>
        <ViewOnlyTooltip canWrite={canWrite}>
          <Button
            size="sm"
            disabled={!canWrite}
            onClick={() => openDialog(null)}
          >
            <Plus className="size-4 mr-1" />
            {t('New data store')}
          </Button>
        </ViewOnlyTooltip>
      </div>
      {!canWrite && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>{t('dataStoreViewOnlyBanner')}</AlertDescription>
        </Alert>
      )}
      {isLoading && <Skeleton className="h-64 w-full" />}
      {!isLoading && (stores ?? []).length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <Database className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium">{t('No data stores yet')}</span>
          <span className="text-sm text-muted-foreground">
            {t('dataStoresEmptyDescription')}
          </span>
          {canWrite && (
            <Button size="sm" onClick={() => openDialog(null)}>
              <Plus className="size-4 mr-1" />
              {t('New data store')}
            </Button>
          )}
        </div>
      )}
      {(stores ?? []).length > 0 && (
        <div className="grid grid-cols-[260px_1fr] gap-4 w-full">
          <div className="flex flex-col gap-1">
            {(stores ?? []).map((store) => (
              <StoreListItem
                key={store.id}
                store={store}
                active={store.id === selected?.id}
                onSelect={() => {
                  select(store.id);
                }}
              />
            ))}
          </div>
          {selected && (
            <StorePanel
              key={selected.id}
              store={selected}
              canWrite={canWrite}
              onEdit={() => openDialog(selected)}
              onDelete={() => setDeleting(selected)}
            />
          )}
        </div>
      )}
      <DataStoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        existing={editing}
        onCreated={(store) => select(store.id)}
      />
      <DeleteDataStoreDialog
        store={deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        onDeleted={(store) => {
          recentVisits.remove({ type: 'dataStore', id: store.id });
          setSearchParams({});
        }}
      />
    </div>
  );
}

function StoreListItem({
  store,
  active,
  onSelect,
}: {
  store: DataStoreSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent',
        active && 'border-primary bg-primary/5',
      )}
    >
      <Database className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <TextWithTooltip tooltipMessage={store.name}>
          <span className="text-sm font-medium">{store.name}</span>
        </TextWithTooltip>
        <span className="text-xs text-muted-foreground">
          {t('{count} records · kept for {days} days', {
            count: store.recordCount,
            days: store.ttlDays,
          })}
        </span>
      </span>
    </button>
  );
}

function StorePanel({
  store,
  canWrite,
  onEdit,
  onDelete,
}: {
  store: DataStoreSummary;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const { data: page, isLoading } = dataStoresHooks.useRecords({
    id: store.id,
    search: debouncedSearch,
  });
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataStoreRecord | null>(
    null,
  );
  const [deletingRecord, setDeletingRecord] = useState<DataStoreRecord | null>(
    null,
  );
  const [clearing, setClearing] = useState(false);
  const { mutateAsync: deleteRecord } = dataStoresHooks.useDeleteRecord();
  const { mutateAsync: clearStore } = dataStoresHooks.useClearDataStore();
  const records = page?.data ?? [];
  const total = page?.total ?? 0;

  const openRecordDialog = (record: DataStoreRecord | null) => {
    setEditingRecord(record);
    setRecordDialogOpen(true);
  };
  const copyValue = (record: DataStoreRecord) => {
    navigator.clipboard
      .writeText(dataStoreUtils.displayValue(record.value))
      .then(() => toast.success(t('Copied')))
      .catch(() => toast.error(t('Copy failed, please copy it manually')));
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <TextWithTooltip tooltipMessage={store.name}>
            <h2 className="text-sm font-semibold">{store.name}</h2>
          </TextWithTooltip>
          <p className="text-xs text-muted-foreground break-words">
            {t('{description} · kept for {days} days · created by {owner}', {
              description: store.description ?? t('No description'),
              days: store.ttlDays,
              owner: store.ownerName ?? t('Unknown'),
            })}
          </p>
        </div>
        <ViewOnlyTooltip canWrite={canWrite}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!canWrite}>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t('More actions')}
                disabled={!canWrite}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="size-4 mr-2" />
                {t('Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={store.recordCount === 0}
                onSelect={() => setClearing(true)}
              >
                <Eraser className="size-4 mr-2" />
                {t('Clear data')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="size-4 mr-2" />
                {t('Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ViewOnlyTooltip>
      </div>
      <div className="flex items-center gap-2">
        <div className="max-w-sm grow">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('Search keys')}
          />
        </div>
        <div className="grow" />
        <ViewOnlyTooltip canWrite={canWrite}>
          <Button
            size="sm"
            variant="outline"
            disabled={!canWrite}
            onClick={() => openRecordDialog(null)}
          >
            <Plus className="size-4 mr-1" />
            {t('New record')}
          </Button>
        </ViewOnlyTooltip>
      </div>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">{t('dataStoreKeyLabel')}</TableHead>
              <TableHead>{t('Value')}</TableHead>
              <TableHead className="w-36">{t('Updated at')}</TableHead>
              <TableHead className="w-36">{t('Expires at')}</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.key}>
                <TableCell className="min-w-0">
                  <TextWithTooltip tooltipMessage={record.key}>
                    <p className="font-mono text-xs">{record.key}</p>
                  </TextWithTooltip>
                </TableCell>
                <TableCell className="min-w-0">
                  <TextWithTooltip
                    tooltipMessage={dataStoreUtils.displayValue(record.value)}
                  >
                    <p className="font-mono text-xs text-muted-foreground">
                      {dataStoreUtils.displayValue(record.value)}
                    </p>
                  </TextWithTooltip>
                </TableCell>
                <TableCell className="text-xs">
                  <FormattedDate
                    date={new Date(record.updated)}
                    includeTime={true}
                  />
                </TableCell>
                <TableCell className="text-xs">
                  <ExpiryCell expiresAt={record.expiresAt ?? null} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('More actions')}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canWrite && (
                        <DropdownMenuItem
                          onSelect={() => openRecordDialog(record)}
                        >
                          <Pencil className="size-4 mr-2" />
                          {t('Edit')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => copyValue(record)}>
                        <Copy className="size-4 mr-2" />
                        {t('Copy value')}
                      </DropdownMenuItem>
                      {canWrite && <DropdownMenuSeparator />}
                      {canWrite && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setDeletingRecord(record)}
                        >
                          <Trash2 className="size-4 mr-2" />
                          {t('Delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyRecords searching={debouncedSearch.length > 0} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {total > records.length && (
        <p className="text-xs text-muted-foreground">
          {t('dataStoreRecordsTruncated', {
            shown: records.length,
            total,
          })}
        </p>
      )}
      <RecordDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        store={store}
        record={editingRecord}
      />
      <ConfirmationDeleteDialog
        title={t('Delete key "{key}"?', { key: deletingRecord?.key ?? '' })}
        message={t('dataStoreDeleteRecordConsequences')}
        entityName={deletingRecord?.key ?? ''}
        buttonText={t('Delete')}
        isDanger
        open={deletingRecord !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRecord(null);
          }
        }}
        mutationFn={async () => {
          if (!deletingRecord) {
            return;
          }
          await deleteRecord({ id: store.id, key: deletingRecord.key });
          setDeletingRecord(null);
        }}
      />
      <ConfirmationDeleteDialog
        title={t('Clear all data?')}
        message={t('dataStoreClearConsequences', {
          name: store.name,
          count: store.recordCount,
        })}
        entityName={store.name}
        buttonText={t('Clear')}
        isDanger
        open={clearing}
        onOpenChange={setClearing}
        mutationFn={async () => {
          await clearStore(store.id);
          setClearing(false);
        }}
      />
    </div>
  );
}

function ExpiryCell({ expiresAt }: { expiresAt: string | null }) {
  const status = dataStoreUtils.expiryStatus({ expiresAt, now: new Date() });
  if (status === 'none' || expiresAt === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (status === 'expired') {
    return <span className="text-destructive">{t('Expired')}</span>;
  }
  return (
    <FormattedDate
      date={new Date(expiresAt)}
      includeTime={true}
      className={cn(
        status === 'expiringSoon'
          ? 'text-warning-700 dark:text-warning-300 font-medium'
          : 'text-muted-foreground',
      )}
    />
  );
}

function EmptyRecords({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1 py-6">
      {searching ? (
        <SearchX className="size-6 text-muted-foreground" />
      ) : (
        <Database className="size-6 text-muted-foreground" />
      )}
      <span className="text-sm font-medium">
        {searching ? t('No matching keys') : t('No data yet')}
      </span>
      {!searching && (
        <span className="text-sm text-muted-foreground">
          {t('Data written by workflows at run time shows up here.')}
        </span>
      )}
    </div>
  );
}

export { DataStoresPage };

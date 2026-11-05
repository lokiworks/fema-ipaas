import { OperatorTenantSummary, TenantStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ConsolePage,
  ConsoleTableFrame,
} from '@/components/custom/console-page';
import { SearchInput } from '@/components/custom/search-input';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { operatorHooks, operatorUtils, UsageCell } from '@/features/operator';

import { CreateTenantDialog } from './create-tenant-dialog';

const PAGE_SIZE = 20;

export function OperatorTenantsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TenantStatus | 'any'>('any');
  const [cursors, setCursors] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const cursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;
  const { data, isLoading } = operatorHooks.useTenants({
    limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(search.trim().length > 0 ? { search: search.trim() } : {}),
    ...(status === 'any' ? {} : { status }),
  });
  const rows = data?.data ?? [];
  const resetPaging = (): void => setCursors([]);

  return (
    <ConsolePage
      title={t('Tenants')}
      description={t(
        'Every organization on this instance, with what it uses against its limits.',
      )}
      actions={
        <Button onClick={() => setCreateOpen(true)} data-testid="create-tenant">
          <Plus className="size-4" />
          {t('New tenant')}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72 max-w-full">
          <SearchInput
            value={search}
            placeholder={t('Search by name or sign-in address')}
            onChange={(value) => {
              setSearch(value);
              resetPaging();
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(toStatusFilter(value));
            resetPaging();
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t('All statuses')}</SelectItem>
            <SelectItem value={TenantStatus.ACTIVE}>{t('Active')}</SelectItem>
            <SelectItem value={TenantStatus.SUSPENDED}>
              {t('Suspended')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <ConsoleTableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Tenant')}</TableHead>
                <TableHead>{t('Owner')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Members')}</TableHead>
                <TableHead>{t('Projects')}</TableHead>
                <TableHead>{t('Active workflows')}</TableHead>
                <TableHead>{t('Concurrent runs')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t('No tenants match')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((tenant) => (
                  <TenantRow
                    key={tenant.id}
                    tenant={tenant}
                    onOpen={() => navigate(`/operator/tenants/${tenant.id}`)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </ConsoleTableFrame>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={cursors.length === 0}
          onClick={() => setCursors((current) => current.slice(0, -1))}
        >
          <ChevronLeft className="size-4" />
          {t('Previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.next}
          onClick={() => {
            const next = data?.next;
            if (next) {
              setCursors((current) => [...current, next]);
            }
          }}
        >
          {t('Next')}
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ConsolePage>
  );
}

function TenantRow({
  tenant,
  onOpen,
}: {
  tenant: OperatorTenantSummary;
  onOpen: () => void;
}) {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={onOpen}
      data-testid={`tenant-row-${tenant.slug}`}
    >
      <TableCell>
        <div className="flex min-w-0 flex-col">
          <TextWithTooltip tooltipMessage={tenant.name}>
            <span className="font-medium">{tenant.name}</span>
          </TextWithTooltip>
          <span className="text-xs text-muted-foreground">
            /t/{tenant.slug}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm">{tenant.ownerName}</span>
          {tenant.ownerContact && (
            <span className="text-xs text-muted-foreground">
              {tenant.ownerContact}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={
            tenant.status === TenantStatus.ACTIVE ? 'success' : 'destructive'
          }
        >
          {operatorUtils.tenantStatusLabel(tenant.status)}
        </Badge>
      </TableCell>
      <TableCell>
        <UsageCell used={tenant.usersCount} limit={tenant.usersLimit} />
      </TableCell>
      <TableCell>
        <UsageCell used={tenant.projectsCount} limit={tenant.projectsLimit} />
      </TableCell>
      <TableCell>
        <UsageCell
          used={tenant.activeWorkflowsCount}
          limit={tenant.activeWorkflowsLimit}
        />
      </TableCell>
      <TableCell>
        {operatorUtils.limitLabel(tenant.concurrentExecutionsLimit)}
      </TableCell>
    </TableRow>
  );
}

function toStatusFilter(value: string): TenantStatus | 'any' {
  return (
    Object.values(TenantStatus).find((status) => status === value) ?? 'any'
  );
}

import {
  ConnectionScope,
  OwnedResource,
  OwnedResourceType,
  ProjectType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowRightLeft } from 'lucide-react';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { FormattedDate } from '@/components/custom/formatted-date';
import { SearchInput } from '@/components/custom/search-input';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
import {
  MemberPicker,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';

export default function ResourcesPage() {
  const [type, setType] = useState<OwnedResourceType | 'any'>('any');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [transferring, setTransferring] = useState<OwnedResource[] | null>(
    null,
  );
  const { data: membersData } = tenantAccessHooks.useMembers();
  const members = membersData?.members ?? [];
  const { data, isLoading } = tenantAccessHooks.useResources({
    type: type === 'any' ? undefined : type,
    ownerId: ownerId ?? undefined,
    search: search.trim().length > 0 ? search.trim() : undefined,
  });
  const resources = data?.resources ?? [];
  const keyOf = (resource: OwnedResource) => `${resource.type}:${resource.id}`;
  const visiblePicked = resources.filter((resource) =>
    picked.includes(keyOf(resource)),
  );
  const ownerName = (id: string) => {
    const owner = members.find(
      (member) => member.kind === 'USER' && member.id === id,
    );
    return owner
      ? tenantAccessUtils.memberDisplayName(owner)
      : t('Removed user');
  };

  return (
    <CenteredPage
      widthClassName="max-w-[64rem]"
      title={t('Integration resources')}
      description={t(
        'Every integration resource in the tenant. When someone leaves or changes teams, hand their resources over here.',
      )}
      actions={
        <Button
          disabled={visiblePicked.length === 0}
          onClick={() => setTransferring(visiblePicked)}
        >
          <ArrowRightLeft className="size-4" />
          {t('transferSelectedCount', { count: visiblePicked.length })}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertDescription>
            {t(
              'Custom connectors have no owner in this platform, so they are not listed. Transferring a personal project turns it into a team project owned by the recipient.',
            )}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('Search resources')}
            />
          </div>
          <Select
            value={type}
            onValueChange={(value) =>
              setType(
                Object.values(OwnedResourceType).find(
                  (candidate) => candidate === value,
                ) ?? 'any',
              )
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('Any type')}</SelectItem>
              {Object.values(OwnedResourceType).map((value) => (
                <SelectItem key={value} value={value}>
                  {tenantAccessUtils.resourceTypeLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-56">
            <MemberPicker
              members={members}
              value={ownerId}
              onChange={setOwnerId}
              excludeIds={[]}
              placeholder={t('Any owner')}
            />
          </div>
        </div>
        {data?.truncated && (
          <p className="text-xs text-muted-foreground">
            {t(
              'Only the first 1000 resources are shown. Narrow the filters to see the rest.',
            )}
          </p>
        )}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t('Select all')}
                    checked={
                      resources.length > 0 &&
                      visiblePicked.length === resources.length
                    }
                    onCheckedChange={(checked) =>
                      setPicked(checked === true ? resources.map(keyOf) : [])
                    }
                  />
                </TableHead>
                <TableHead>{t('Name')}</TableHead>
                <TableHead className="w-32">{t('Type')}</TableHead>
                <TableHead className="w-40">{t('Scope')}</TableHead>
                <TableHead className="w-40">{t('Owner')}</TableHead>
                <TableHead className="w-32">{t('Updated')}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    {t('No resources match these filters')}
                  </TableCell>
                </TableRow>
              )}
              {resources.map((resource) => (
                <TableRow key={keyOf(resource)}>
                  <TableCell>
                    <Checkbox
                      aria-label={resource.name}
                      checked={picked.includes(keyOf(resource))}
                      onCheckedChange={(checked) =>
                        setPicked(
                          checked === true
                            ? [...picked, keyOf(resource)]
                            : picked.filter((key) => key !== keyOf(resource)),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-64">
                    <TextWithTooltip tooltipMessage={resource.name}>
                      <p className="truncate">{resource.name}</p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {tenantAccessUtils.resourceTypeLabel(resource.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {scopeLabel(resource)}
                  </TableCell>
                  <TableCell>{ownerName(resource.ownerId)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <FormattedDate date={new Date(resource.updated)} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTransferring([resource])}
                    >
                      {t('Transfer')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <TransferDialog
        resources={transferring}
        onOpenChange={(open) => !open && setTransferring(null)}
        onDone={() => {
          setTransferring(null);
          setPicked([]);
        }}
      />
    </CenteredPage>
  );
}

function TransferDialog({
  resources,
  onOpenChange,
  onDone,
}: {
  resources: OwnedResource[] | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={resources !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {resources && (
          <TransferBody
            key={resources.map((resource) => resource.id).join(',')}
            resources={resources}
            onOpenChange={onOpenChange}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransferBody({
  resources,
  onOpenChange,
  onDone,
}: {
  resources: OwnedResource[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { data: membersData } = tenantAccessHooks.useMembers();
  const { mutate: transfer, isPending } =
    tenantAccessHooks.useTransferResources();
  const [recipient, setRecipient] = useState<string | null>(null);
  const owners = [...new Set(resources.map((resource) => resource.ownerId))];
  const unchanged = resources.filter(
    (resource) => resource.ownerId === recipient,
  ).length;
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Transfer ownership')}</DialogTitle>
        <DialogDescription>
          {resources.length === 1
            ? t('Transfer {name}. Running workflows are not affected.', {
                name: resources[0].name,
              })
            : t(
                'Transfer {count} selected resources. Running workflows are not affected.',
                { count: resources.length },
              )}{' '}
          {t(
            'When a project moves, the previous owner stays on it as a developer.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label>{t('Transfer to')}</Label>
        <MemberPicker
          members={membersData?.members ?? []}
          value={recipient}
          onChange={setRecipient}
          excludeIds={owners.length === 1 ? owners : []}
        />
        {unchanged > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(
              '{count} of them already belong to this person and stay as they are.',
              {
                count: unchanged,
              },
            )}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('Cancel')}
        </Button>
        <Button
          loading={isPending}
          disabled={recipient === null || unchanged === resources.length}
          onClick={() =>
            recipient &&
            transfer(
              {
                resources: resources.map((resource) => ({
                  type: resource.type,
                  id: resource.id,
                })),
                toUserId: recipient,
              },
              { onSuccess: onDone },
            )
          }
        >
          {t('Transfer')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function scopeLabel(resource: OwnedResource): string {
  if (resource.type === OwnedResourceType.PROJECT) {
    return resource.scope === ProjectType.PERSONAL
      ? t('Personal project')
      : t('Team project');
  }
  if (resource.type === OwnedResourceType.CONNECTION) {
    return resource.scope === ConnectionScope.TENANT
      ? t('All projects')
      : t('Selected projects');
  }
  return resource.scope ?? '—';
}

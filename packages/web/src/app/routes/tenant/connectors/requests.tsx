import { ConnectorDemandStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/custom/empty';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  connectorDemandHooks,
  connectorDemandMutations,
} from '@/features/connector-demands';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';

export default function ConnectorRequestsPage() {
  const isTenantAdmin = useIsTenantAdmin();
  const [status, setStatus] = useState<ConnectorDemandStatus | 'ALL'>('ALL');
  const { data, isLoading } = connectorDemandHooks.useConnectorDemands({
    status: status === 'ALL' ? undefined : status,
    limit: 50,
  });
  const { mutate: updateStatus } =
    connectorDemandMutations.useUpdateConnectorDemandStatus({
      onError: () => undefined,
    });

  if (!isTenantAdmin) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('Tenant admins only')}</EmptyTitle>
          <EmptyDescription>
            {t('Only tenant admins can review connector requests.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Connector requests')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Requests submitted by members for connectors that do not exist yet.',
          )}
        </p>
      </div>
      <Tabs
        value={status}
        onValueChange={(value) => {
          if (isConnectorDemandStatusOrAll(value)) {
            setStatus(value);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="ALL">{t('All')}</TabsTrigger>
          <TabsTrigger value={ConnectorDemandStatus.OPEN}>
            {t('Open')}
          </TabsTrigger>
          <TabsTrigger value={ConnectorDemandStatus.PLANNED}>
            {t('Planned')}
          </TabsTrigger>
          <TabsTrigger value={ConnectorDemandStatus.DONE}>
            {t('Done')}
          </TabsTrigger>
          <TabsTrigger value={ConnectorDemandStatus.DECLINED}>
            {t('Declined')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data?.data.length ?? 0) === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('No connector requests')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Requests submitted from the connector marketplace show up here.',
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Requester')}</TableHead>
              <TableHead>{t('App')}</TableHead>
              <TableHead>{t('Capability needed')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Requested at')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((demand) => (
              <TableRow key={demand.id}>
                <TableCell>
                  {demand.requester
                    ? `${demand.requester.firstName} ${demand.requester.lastName}`.trim() ||
                      demand.requester.email
                    : t('Deleted user')}
                </TableCell>
                <TableCell className="font-medium">{demand.appName}</TableCell>
                <TableCell className="max-w-md text-muted-foreground">
                  {demand.capability}
                </TableCell>
                <TableCell>
                  <Select
                    value={demand.status}
                    onValueChange={(value) => {
                      if (isConnectorDemandStatus(value)) {
                        updateStatus({ id: demand.id, status: value });
                      }
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue>
                        <StatusBadge status={demand.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ConnectorDemandStatus.OPEN}>
                        {t('Open')}
                      </SelectItem>
                      <SelectItem value={ConnectorDemandStatus.PLANNED}>
                        {t('Planned')}
                      </SelectItem>
                      <SelectItem value={ConnectorDemandStatus.DONE}>
                        {t('Done')}
                      </SelectItem>
                      <SelectItem value={ConnectorDemandStatus.DECLINED}>
                        {t('Declined')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(demand.created).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectorDemandStatus }) {
  switch (status) {
    case ConnectorDemandStatus.OPEN:
      return <Badge variant="outline">{t('Open')}</Badge>;
    case ConnectorDemandStatus.PLANNED:
      return <Badge variant="info">{t('Planned')}</Badge>;
    case ConnectorDemandStatus.DONE:
      return <Badge variant="success">{t('Done')}</Badge>;
    case ConnectorDemandStatus.DECLINED:
      return <Badge variant="secondary">{t('Declined')}</Badge>;
  }
}

function isConnectorDemandStatus(
  value: string,
): value is ConnectorDemandStatus {
  return Object.values(ConnectorDemandStatus).some(
    (status) => status === value,
  );
}

function isConnectorDemandStatusOrAll(
  value: string,
): value is ConnectorDemandStatus | 'ALL' {
  return value === 'ALL' || isConnectorDemandStatus(value);
}

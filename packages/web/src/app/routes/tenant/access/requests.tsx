import {
  ModuleAccessRequestStatus,
  ModuleAccessRequestWithUsers,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

export default function AccessRequestsPage() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const { data: requests, isLoading } = tenantAccessHooks.useRequests(
    filter === 'pending' ? ModuleAccessRequestStatus.PENDING : undefined,
  );
  const { data: settings } = tenantAccessHooks.useModuleSettings();
  const pendingCount = tenantAccessHooks.usePendingRequestCount();

  return (
    <CenteredPage
      widthClassName="max-w-[64rem]"
      title={t('Permission requests')}
      description={t(
        'Members can ask for modules they do not have. How they are told is set in permission settings.',
      )}
    >
      <div className="flex flex-col gap-4">
        {settings && !settings.allowRequests && (
          <Alert>
            <AlertDescription>
              {t(
                'Permission requests are turned off, so members cannot submit new ones. Turn them back on in permission settings.',
              )}
            </AlertDescription>
          </Alert>
        )}
        <Alert>
          <AlertDescription>
            {t(
              'Requests are reviewed here in the platform. Reviewing them in Feishu approval is not available yet.',
            )}
          </AlertDescription>
        </Alert>
        <Tabs
          value={filter}
          onValueChange={(value) =>
            setFilter(value === 'all' ? 'all' : 'pending')
          }
        >
          <TabsList>
            <TabsTrigger value="pending">
              {t('pendingRequestsCount', { count: pendingCount })}
            </TabsTrigger>
            <TabsTrigger value="all">{t('All requests')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Requester')}</TableHead>
                <TableHead className="w-36">{t('Module')}</TableHead>
                <TableHead>{t('Reason')}</TableHead>
                <TableHead className="w-36">{t('Requested')}</TableHead>
                <TableHead className="w-36">{t('Status')}</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {filter === 'pending'
                      ? t('No requests waiting for review')
                      : t('No permission requests yet')}
                  </TableCell>
                </TableRow>
              )}
              {(requests ?? []).map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </CenteredPage>
  );
}

function RequestRow({ request }: { request: ModuleAccessRequestWithUsers }) {
  const { mutateAsync: decide, isPending } =
    tenantAccessHooks.useDecideRequest();
  const requester = request.userName ?? request.userEmail ?? t('Removed user');
  const moduleName = tenantAccessUtils.moduleLabel(request.module);
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span>{requester}</span>
          {request.userEmail && (
            <span className="text-xs text-muted-foreground">
              {request.userEmail}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{moduleName}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {request.reason.length > 0 ? request.reason : t('No reason given')}
      </TableCell>
      <TableCell>
        <FormattedDate date={new Date(request.created)} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <Badge
            variant={
              request.status === ModuleAccessRequestStatus.APPROVED
                ? 'success'
                : request.status === ModuleAccessRequestStatus.REJECTED
                ? 'outline'
                : 'info'
            }
          >
            {tenantAccessUtils.requestStatusLabel(request.status)}
          </Badge>
          {request.decidedByName && (
            <span className="text-xs text-muted-foreground">
              {request.decidedByName}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {request.status === ModuleAccessRequestStatus.PENDING && (
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={isPending}
              onClick={() => decide({ id: request.id, approve: true })}
            >
              {t('Approve')}
            </Button>
            <ConfirmationDeleteDialog
              title={t('Reject the request from {name}?', { name: requester })}
              message={t(
                '{name} will not get access to {module}. They can send a new request later.',
                { name: requester, module: moduleName },
              )}
              entityName={moduleName}
              buttonText={t('Reject')}
              mutationFn={async () => {
                await decide({ id: request.id, approve: false });
              }}
            >
              <Button size="sm" variant="outline">
                {t('Reject')}
              </Button>
            </ConfirmationDeleteDialog>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

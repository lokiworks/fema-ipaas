import { OperatorTenantSummary, TenantStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft, Pencil } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { ConsolePage } from '@/components/custom/console-page';
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
import { Skeleton } from '@/components/ui/skeleton';
import { operatorHooks, operatorUtils, UsageCell } from '@/features/operator';
import { SlugDialog, tenantAccessUtils } from '@/features/tenant-access';

import { LimitsDialog } from './limits-dialog';

export function OperatorTenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { data: tenant, isLoading } = operatorHooks.useTenant(tenantId ?? '');
  if (isLoading || !tenant) {
    return (
      <ConsolePage title={t('Tenant')}>
        <Skeleton className="h-72 w-full" />
      </ConsolePage>
    );
  }
  return <TenantDetail key={tenant.id} tenant={tenant} />;
}

function TenantDetail({ tenant }: { tenant: OperatorTenantSummary }) {
  const lifecycle = operatorHooks.useTenantLifecycle();
  const updateSlug = operatorHooks.useUpdateTenantSlug({
    onSaved: () => setSlugOpen(false),
  });
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [slugOpen, setSlugOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const suspended = tenant.status === TenantStatus.SUSPENDED;
  const loginUrl = tenantAccessUtils.tenantLoginUrl({
    origin: window.location.origin,
    slug: tenant.slug,
  });

  return (
    <ConsolePage
      title={
        <span className="flex items-center gap-2">
          {tenant.name}
          <Badge variant={suspended ? 'destructive' : 'success'}>
            {operatorUtils.tenantStatusLabel(tenant.status)}
          </Badge>
        </span>
      }
      description={
        <Link
          to="/operator/tenants"
          className="inline-flex items-center gap-1 text-primary"
        >
          <ArrowLeft className="size-3.5" />
          {t('All tenants')}
        </Link>
      }
      actions={
        suspended ? (
          <Button
            loading={lifecycle.isPending}
            onClick={() =>
              lifecycle.mutate({ id: tenant.id, action: 'resume' })
            }
            data-testid="tenant-resume"
          >
            {t('Resume tenant')}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            data-testid="tenant-suspend"
          >
            {t('Suspend tenant')}
          </Button>
        )
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('Basic information')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Tenant name')}>{tenant.name}</Field>
          <Field label={t('Created')}>
            <FormattedDate date={new Date(tenant.created)} />
          </Field>
          <Field label={t('Owner')}>
            {tenant.ownerName}
            {tenant.ownerContact && (
              <span className="ml-2 text-muted-foreground">
                {tenant.ownerContact}
              </span>
            )}
          </Field>
          <Field label={t('Sign-in address')}>
            <span className="flex items-center gap-2">
              <code
                className="break-all text-xs"
                data-testid="tenant-login-url"
              >
                {loginUrl}
              </code>
              <CopyButton
                textToCopy={loginUrl}
                variant="outline"
                type="button"
              />
              <Button
                size="sm"
                variant="basic"
                onClick={() => setSlugOpen(true)}
                data-testid="tenant-slug-edit"
              >
                <Pencil className="size-3.5" />
                {t('Change')}
              </Button>
            </span>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('External reference')}</CardTitle>
          <CardDescription>
            {t('Set when the tenant was provisioned by another platform.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {tenant.externalRef ? (
            <>
              <Field label={t('Issuer')}>
                <code className="break-all text-xs">
                  {tenant.externalRef.issuer}
                </code>
              </Field>
              <Field label={t('External tenant ID')}>
                <code className="break-all text-xs">
                  {tenant.externalRef.tenantId}
                </code>
              </Field>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('Created here, not linked to another platform.')}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t('Usage and limits')}</CardTitle>
            <CardDescription>
              {t('What this tenant uses against the caps you set.')}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimitsOpen(true)}
            data-testid="tenant-limits-edit"
          >
            {t('Edit limits')}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Members')}>
            <UsageCell used={tenant.usersCount} limit={tenant.usersLimit} />
          </Field>
          <Field label={t('Projects')}>
            <UsageCell
              used={tenant.projectsCount}
              limit={tenant.projectsLimit}
            />
          </Field>
          <Field label={t('Active workflows')}>
            <UsageCell
              used={tenant.activeWorkflowsCount}
              limit={tenant.activeWorkflowsLimit}
            />
          </Field>
          <Field label={t('Concurrent runs')}>
            {operatorUtils.limitLabel(tenant.concurrentExecutionsLimit)}
          </Field>
          <Field label={t('Worker group')}>
            {tenant.workerGroupId ?? t('Shared workers')}
          </Field>
        </CardContent>
      </Card>
      <LimitsDialog
        tenant={tenant}
        open={limitsOpen}
        onOpenChange={setLimitsOpen}
      />
      <SlugDialog
        open={slugOpen}
        onOpenChange={setSlugOpen}
        currentSlug={tenant.slug}
        pending={updateSlug.isPending}
        onSubmit={(slug) =>
          updateSlug.mutate({ id: tenant.id, request: { slug } })
        }
      />
      <ConfirmationDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Suspend {name}?', { name: tenant.name })}
        message={t(
          'Members are signed out and cannot sign in until you resume the tenant. Workflows stop running. Nothing is deleted.',
        )}
        entityName={tenant.name}
        buttonText={t('Suspend tenant')}
        mutationFn={async () => {
          await lifecycle.mutateAsync({ id: tenant.id, action: 'suspend' });
        }}
      />
    </ConsolePage>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

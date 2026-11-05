import {
  CreateTenantDomainRequestBody,
  TenantDomain,
  TenantDomainPurpose,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

export function LoginDomainsCard() {
  const { data } = tenantAccessHooks.useDomains();
  const verify = tenantAccessHooks.useVerifyDomain();
  const remove = tenantAccessHooks.useRemoveDomain();
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<TenantDomain | null>(null);
  const domains = data ?? [];
  return (
    <Card data-testid="login-domains">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t('Sign-in domains')}</CardTitle>
          <CardDescription>
            {t(
              'Prove you own a domain by adding a DNS record. A verified email domain lets people find this tenant from their address. A verified host name works as its own sign-in address.',
            )}
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          data-testid="add-domain"
        >
          <Plus className="size-4" />
          {t('Add domain')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {domains.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('No domains yet')}</p>
        )}
        {domains.map((domain) => (
          <div
            key={domain.id}
            className="flex flex-col gap-3 rounded-md border p-3"
            data-testid={`domain-${domain.domain}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {domain.domain}
                  <Badge variant={domain.verifiedAt ? 'success' : 'outline'}>
                    {domain.verifiedAt ? t('Verified') : t('Waiting for DNS')}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  {tenantAccessUtils.domainPurposeLabel(domain.purpose)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!domain.verifiedAt && (
                  <Button
                    size="sm"
                    loading={verify.isPending && verify.variables === domain.id}
                    onClick={() => verify.mutate(domain.id)}
                    data-testid={`verify-${domain.domain}`}
                  >
                    {t('Verify')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoving(domain)}
                >
                  {t('Remove')}
                </Button>
              </div>
            </div>
            {!domain.verifiedAt && <TxtRecord domain={domain} />}
          </div>
        ))}
      </CardContent>
      <AddDomainDialog open={addOpen} onOpenChange={setAddOpen} />
      {removing && (
        <ConfirmationDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setRemoving(null);
            }
          }}
          title={t('Remove {name}?', { name: removing.domain })}
          message={t('People can no longer find this tenant through it.')}
          entityName={removing.domain}
          mutationFn={async () => {
            await remove.mutateAsync(removing.id);
          }}
        />
      )}
    </Card>
  );
}

function TxtRecord({ domain }: { domain: TenantDomain }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 text-xs">
      <span className="text-muted-foreground">
        {t('Add this TXT record at your DNS provider, then press Verify.')}
      </span>
      <RecordLine label={t('Name')} value={domain.verificationRecord.name} />
      <RecordLine label={t('Value')} value={domain.verificationRecord.value} />
    </div>
  );
}

function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 break-all" data-testid="txt-record">
        {value}
      </code>
      <CopyButton textToCopy={value} variant="outline" type="button" />
    </div>
  );
}

function AddDomainDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AddDomainForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddDomainForm({ onClose }: { onClose: () => void }) {
  const { mutate: create, isPending } = tenantAccessHooks.useCreateDomain({
    onCreated: onClose,
  });
  const [domain, setDomain] = useState('');
  const [purpose, setPurpose] = useState<TenantDomainPurpose>(
    TenantDomainPurpose.LOGIN_DISCOVERY,
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = CreateTenantDomainRequestBody.safeParse({
          domain,
          purpose,
        });
        if (!parsed.success) {
          setError(t(parsed.error.issues[0]?.message ?? 'invalidDomain'));
          return;
        }
        setError(null);
        create(parsed.data);
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('Add domain')}</DialogTitle>
        <DialogDescription>
          {t('You will get a TXT record to add before it counts.')}
        </DialogDescription>
      </DialogHeader>
      <Input
        value={domain}
        placeholder="acme.com"
        aria-label={t('Domain')}
        data-testid="domain-input"
        onChange={(event) => setDomain(event.target.value)}
      />
      <Select
        value={purpose}
        onValueChange={(value) =>
          setPurpose(
            value === TenantDomainPurpose.HOST
              ? TenantDomainPurpose.HOST
              : TenantDomainPurpose.LOGIN_DISCOVERY,
          )
        }
      >
        <SelectTrigger data-testid="domain-purpose">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(TenantDomainPurpose).map((value) => (
            <SelectItem key={value} value={value}>
              {tenantAccessUtils.domainPurposeLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button type="submit" loading={isPending} data-testid="domain-submit">
          {t('Add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

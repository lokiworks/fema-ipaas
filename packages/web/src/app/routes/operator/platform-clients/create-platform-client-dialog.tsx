import {
  CreatePlatformClientRequestBody,
  PlatformClientKind,
  PlatformScope,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { operatorHooks, operatorUtils } from '@/features/operator';

export function CreatePlatformClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <CreateForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const {
    mutate: create,
    isPending,
    data: created,
  } = operatorHooks.useCreatePlatformClient();
  const [kind, setKind] = useState<PlatformClientKind>(
    PlatformClientKind.API_KEY,
  );
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [subjects, setSubjects] = useState('');
  const [scopes, setScopes] = useState<PlatformScope[]>([
    PlatformScope.TENANT_PROVISION,
  ]);
  const [error, setError] = useState<string | null>(null);

  if (created) {
    return (
      <div className="flex flex-col gap-4" data-testid="client-created">
        <DialogHeader>
          <DialogTitle>{t('Client created')}</DialogTitle>
          <DialogDescription>{created.client.name}</DialogDescription>
        </DialogHeader>
        {created.secret ? (
          <>
            <Alert variant="warning">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                {t(
                  'Copy the key now. It is shown only once and cannot be recovered.',
                )}
              </AlertDescription>
            </Alert>
            <CopyToClipboardInput textToCopy={created.secret} useInput={true} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              'Tokens signed by this issuer are accepted from now on. No key was issued.',
            )}
          </p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('Done')}</Button>
        </DialogFooter>
      </div>
    );
  }

  const submit = (): void => {
    const request = buildRequest({ kind, name, issuer, subjects, scopes });
    const parsed = CreatePlatformClientRequestBody.safeParse(request);
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'required'));
      return;
    }
    setError(null);
    create(parsed.data);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('New platform client')}</DialogTitle>
        <DialogDescription>
          {t('Choose how the other system proves who it is.')}
        </DialogDescription>
      </DialogHeader>
      <Tabs
        value={kind}
        onValueChange={(value) =>
          setKind(
            value === PlatformClientKind.TRUSTED_ISSUER
              ? PlatformClientKind.TRUSTED_ISSUER
              : PlatformClientKind.API_KEY,
          )
        }
      >
        <TabsList>
          <TabsTrigger value={PlatformClientKind.API_KEY}>
            {t('API key')}
          </TabsTrigger>
          <TabsTrigger value={PlatformClientKind.TRUSTED_ISSUER}>
            {t('Trusted issuer')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">{t('Name')}</Label>
        <Input
          id="client-name"
          value={name}
          data-testid="client-name"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {kind === PlatformClientKind.TRUSTED_ISSUER && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-issuer">{t('Issuer URL')}</Label>
            <Input
              id="client-issuer"
              value={issuer}
              placeholder="https://iam.example.com"
              data-testid="client-issuer"
              onChange={(event) => setIssuer(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-subjects">{t('Allowed subjects')}</Label>
            <Textarea
              id="client-subjects"
              value={subjects}
              minRows={2}
              data-testid="client-subjects"
              onChange={(event) => setSubjects(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Client IDs or subjects allowed to call, one per line. Matched against sub, client_id and azp.',
              )}
            </p>
          </div>
        </>
      )}
      <div className="flex flex-col gap-2">
        <Label>{t('Permissions')}</Label>
        {Object.values(PlatformScope).map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={scopes.includes(scope)}
              data-testid={`scope-${scope}`}
              onCheckedChange={(checked) =>
                setScopes((current) =>
                  checked === true
                    ? [...current, scope]
                    : current.filter((value) => value !== scope),
                )
              }
            />
            {operatorUtils.scopeLabel(scope)}
          </label>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button type="submit" loading={isPending} data-testid="client-submit">
          {t('Create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function buildRequest({
  kind,
  name,
  issuer,
  subjects,
  scopes,
}: {
  kind: PlatformClientKind;
  name: string;
  issuer: string;
  subjects: string;
  scopes: PlatformScope[];
}) {
  if (kind === PlatformClientKind.API_KEY) {
    return { kind, name, scopes };
  }
  return {
    kind,
    name,
    issuer,
    allowedSubjects: operatorUtils.parseSubjects(subjects),
    scopes,
  };
}

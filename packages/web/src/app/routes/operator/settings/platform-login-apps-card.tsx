import {
  PlatformLoginAppKind,
  PlatformLoginAppPublic,
  UpdatePlatformLoginAppRequestBody,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

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
import { Switch } from '@/components/ui/switch';
import { operatorHooks, operatorUtils } from '@/features/operator';

export function PlatformLoginAppsCard({
  apps,
}: {
  apps: PlatformLoginAppPublic[];
}) {
  const [editing, setEditing] = useState<PlatformLoginAppKind | null>(null);
  const rows = PlatformLoginAppKind.options.map((kind) => ({
    kind,
    app: apps.find((candidate) => candidate.kind === kind) ?? null,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Platform sign-in apps')}</CardTitle>
        <CardDescription>
          {t(
            'One app per workspace platform, owned by this instance. Tenants link their company to it by scanning a code, with no app of their own. Until an app is configured, its scan option is hidden.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map(({ kind, app }) => (
          <div
            key={kind}
            className="flex items-center justify-between gap-4 rounded-md border p-3"
            data-testid={`login-app-${kind}`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {operatorUtils.loginAppLabel(kind)}
                {app === null ? (
                  <Badge variant="outline">{t('Not configured')}</Badge>
                ) : app.enabled ? (
                  <Badge variant="success">{t('Turned on')}</Badge>
                ) : (
                  <Badge variant="outline">{t('Turned off')}</Badge>
                )}
              </span>
              {app && (
                <span className="text-xs text-muted-foreground">
                  {app.appId}
                  {app.allowSelfSignup
                    ? ` · ${t('New companies can create a tenant')}`
                    : ''}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(kind)}
              data-testid={`login-app-edit-${kind}`}
            >
              {app === null ? t('Configure') : t('Edit')}
            </Button>
          </div>
        ))}
      </CardContent>
      {editing !== null && (
        <LoginAppDialog
          kind={editing}
          app={apps.find((candidate) => candidate.kind === editing) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function LoginAppDialog({
  kind,
  app,
  onClose,
}: {
  kind: PlatformLoginAppKind;
  app: PlatformLoginAppPublic | null;
  onClose: () => void;
}) {
  const { mutate: save, isPending } = operatorHooks.useSavePlatformLoginApp({
    onSaved: onClose,
  });
  const [enabled, setEnabled] = useState(app?.enabled ?? true);
  const [appId, setAppId] = useState(app?.appId ?? '');
  const [appSecret, setAppSecret] = useState('');
  const [region, setRegion] = useState(app?.region ?? '');
  const [allowSelfSignup, setAllowSelfSignup] = useState(
    app?.allowSelfSignup ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const parsed = UpdatePlatformLoginAppRequestBody.safeParse({
      enabled,
      appId,
      ...(appSecret.length > 0 ? { appSecret } : {}),
      region: region.trim().length === 0 ? null : region.trim(),
      allowSelfSignup,
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'required'));
      return;
    }
    if (!app?.hasAppSecret && appSecret.length === 0) {
      setError(t('required'));
      return;
    }
    setError(null);
    save({ kind, request: parsed.data });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('{platform} sign-in app', {
                platform: operatorUtils.loginAppLabel(kind),
              })}
            </DialogTitle>
            <DialogDescription>
              {t('Credentials of the app this instance owns on that platform.')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <Label>{t('Turned on')}</Label>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="login-app-enabled"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-app-id">{t('App ID')}</Label>
            <Input
              id="login-app-id"
              value={appId}
              autoComplete="off"
              data-testid="login-app-id"
              onChange={(event) => setAppId(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-app-secret">{t('App secret')}</Label>
            <Input
              id="login-app-secret"
              type="password"
              value={appSecret}
              autoComplete="off"
              placeholder={
                app?.hasAppSecret ? t('Saved. Leave empty to keep it.') : ''
              }
              data-testid="login-app-secret"
              onChange={(event) => setAppSecret(event.target.value)}
            />
          </div>
          {kind === 'FEISHU' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-app-region">{t('Region')}</Label>
              <Input
                id="login-app-region"
                value={region}
                placeholder="FEISHU / LARK"
                onChange={(event) => setRegion(event.target.value)}
              />
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label>{t('Let new companies create a tenant')}</Label>
              <span className="text-xs text-muted-foreground">
                {t(
                  'A company that is not linked yet gets a new tenant when its administrator scans the code. Needs open self-service sign-up.',
                )}
              </span>
            </div>
            <Switch
              checked={allowSelfSignup}
              onCheckedChange={setAllowSelfSignup}
              data-testid="login-app-self-signup"
            />
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
            <Button
              type="submit"
              loading={isPending}
              data-testid="login-app-save"
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

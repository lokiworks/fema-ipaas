import {
  PlatformLoginAppKind,
  PlatformLoginAppPublic,
  UpdatePlatformLoginAppRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { internalErrorMessage } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import {
  LoginAppFormValues,
  operatorHooks,
  operatorSchemas,
  operatorUtils,
} from '@/features/operator';
import { FormServerError } from '@/features/tenant-access';
import { api } from '@/lib/api';

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
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <LoginAppForm key={kind} kind={kind} app={app} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function LoginAppForm({
  kind,
  app,
  onClose,
}: {
  kind: PlatformLoginAppKind;
  app: PlatformLoginAppPublic | null;
  onClose: () => void;
}) {
  const schema = useMemo(
    () =>
      operatorSchemas.loginAppForm({ hasSecret: app?.hasAppSecret === true }),
    [app?.hasAppSecret],
  );
  const form = useForm<LoginAppFormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: loginAppDefaults(app),
  });
  const { mutate: save, isPending } = operatorHooks.useSavePlatformLoginApp({
    onSaved: onClose,
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          const parsed = UpdatePlatformLoginAppRequestBody.safeParse(
            operatorUtils.loginAppRequest(values),
          );
          if (parsed.success) {
            save({ kind, request: parsed.data });
          }
        })}
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
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>{t('Turned on')}</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="login-app-enabled"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="appId"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('App ID')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  data-testid="login-app-id"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="appSecret"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator={!app?.hasAppSecret}>
                {t('App secret')}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="off"
                  placeholder={
                    app?.hasAppSecret ? t('Saved. Leave empty to keep it.') : ''
                  }
                  data-testid="login-app-secret"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {kind === 'FEISHU' && (
          <FormField
            control={form.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Region')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="FEISHU / LARK" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="allowSelfSignup"
          render={({ field }) => (
            <FormItem className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <FormLabel>{t('Let new companies create a tenant')}</FormLabel>
                <FormDescription>
                  {t(
                    'A company that is not linked yet gets a new tenant when its administrator scans the code. Needs open self-service sign-up.',
                  )}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="login-app-self-signup"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
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
    </Form>
  );
}

function loginAppDefaults(
  app: PlatformLoginAppPublic | null,
): LoginAppFormValues {
  return {
    enabled: app?.enabled ?? true,
    appId: app?.appId ?? '',
    appSecret: '',
    region: app?.region ?? '',
    allowSelfSignup: app?.allowSelfSignup ?? false,
  };
}

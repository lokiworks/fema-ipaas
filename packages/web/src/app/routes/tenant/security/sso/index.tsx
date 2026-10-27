import {
  LoginMethod,
  LoginMethodStatus,
  LoginSecuritySettings,
  SsoProvider,
  SsoSettings,
  TENANT_ACCESS_LIMITS,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import {
  Earth,
  KeyRound,
  MailIcon,
  MessageCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { AllowedDomainDialog } from '@/app/routes/tenant/security/sso/allowed-domain';
import { SsoProviderDialog } from '@/app/routes/tenant/security/sso/sso-provider-dialog';
import { ConsolePage } from '@/components/custom/console-page';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/custom/item';
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ssoUtils } from '@/features/authentication';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { formatUtils } from '@/lib/format-utils';

const AuthenticationPage = () => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();
  const { data: settings, isLoading } = tenantAccessHooks.useLoginSecurity();
  const { data: sso } = tenantAccessHooks.useSsoSettings();

  return (
    <ConsolePage
      title={t('Sign-in and security')}
      description={t(
        'How members sign in. A method has to be configured before it can be turned on, and at least one method stays on.',
      )}
    >
      {isLoading || !settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <SsoTestResult />
          <div className="flex flex-col gap-3">
            {settings.methods.map((method) => (
              <LoginMethodRow
                key={method.method}
                method={method}
                sso={sso ?? null}
                enabledCount={
                  settings.methods.filter((candidate) => candidate.enabled)
                    .length
                }
              />
            ))}
          </div>
          <PolicyForm
            key={`${settings.passwordMinLength}-${settings.sessionDurationDays}`}
            settings={settings}
          />
          <Item variant="outline">
            <ItemMedia variant="icon">
              <Earth />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t('Allowed Domains')}</ItemTitle>
              <ItemDescription>
                {t('Restrict authentication to specific email domains.')}
              </ItemDescription>
              {(tenant?.allowedAuthDomains ?? []).length > 0 && (
                <div className="mt-1 flex gap-2">
                  {(tenant?.allowedAuthDomains ?? []).map((text) => (
                    <Badge key={text} variant="outline">
                      {text}
                    </Badge>
                  ))}
                </div>
              )}
            </ItemContent>
            <ItemActions>
              <AllowedDomainDialog tenant={tenant} refetch={refetch} />
            </ItemActions>
          </Item>
        </div>
      )}
    </ConsolePage>
  );
};

function SsoTestResult() {
  const [params, setParams] = useSearchParams();
  const result = params.get('ssoTest');
  if (result === null) {
    return null;
  }
  const passed = result === 'ok';
  const dismiss = (): void => {
    const next = new URLSearchParams(params);
    next.delete('ssoTest');
    next.delete('provider');
    setParams(next, { replace: true });
  };
  return (
    <div
      role="alert"
      data-testid="sso-test-result"
      data-result={result}
      className={
        passed
          ? 'flex items-start gap-2 rounded-md border border-success/50 bg-success-100/10 px-3 py-2 text-sm text-success-700 dark:text-success-300'
          : 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive'
      }
    >
      {!passed && <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
      <span className="flex-1">
        {passed
          ? t('The test sign-in passed. You can turn this method on now.')
          : ssoUtils.errorMessage(result)}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs underline underline-offset-2"
      >
        {t('Dismiss')}
      </button>
    </div>
  );
}

function LoginMethodRow({
  method,
  enabledCount,
  sso,
}: {
  method: LoginMethodStatus;
  enabledCount: number;
  sso: SsoSettings | null;
}) {
  const { mutate: update, isPending } =
    tenantAccessHooks.useUpdateLoginSecurity();
  const setSsoEnabled = tenantAccessHooks.useSetSsoEnabled();
  const startTest = tenantAccessHooks.useStartSsoTest();
  const [dialogOpen, setDialogOpen] = useState(false);
  const provider = ssoProviderOf(method.method);
  const config = ssoConfigOf({ provider, sso });
  const verified = config?.verifiedAt ?? null;
  const lastEnabled = method.enabled && enabledCount === 1;
  const passwordWouldLockOut =
    method.method === LoginMethod.EMAIL_PASSWORD &&
    method.enabled &&
    !hasVerifiedEnabledSso(sso);
  const blockedReason = !method.available
    ? t('This build has no sign-in integration for this method yet')
    : !method.configured
    ? t('Configure this method before turning it on')
    : provider !== null && !method.enabled && verified === null
    ? t('Run a successful test sign-in before turning this method on')
    : passwordWouldLockOut
    ? t(
        'Turn on a single sign-on method and pass its test sign-in before turning password sign-in off',
      )
    : lastEnabled
    ? t('At least one sign-in method must stay on')
    : null;
  const busy = isPending || setSsoEnabled.isPending;
  return (
    <Item variant="outline" data-testid={`login-method-${method.method}`}>
      <ItemMedia variant="icon">{methodIcon(method.method)}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          {tenantAccessUtils.loginMethodLabel(method.method)}
          {method.enabled ? (
            <Badge variant="success">{t('Turned on')}</Badge>
          ) : method.available ? (
            <Badge variant="outline">{t('Turned off')}</Badge>
          ) : (
            <Badge variant="outline">{t('Not available')}</Badge>
          )}
        </ItemTitle>
        <ItemDescription>{methodDescription(method.method)}</ItemDescription>
        {provider !== null && config !== null && (
          <ItemDescription data-testid={`sso-status-${provider}`}>
            {ssoStatusLine({
              verifiedAt: verified,
              lastLoginAt: config.lastLoginAt ?? null,
            })}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        {provider !== null && (
          <>
            {config !== null && (
              <Button
                size="sm"
                variant="outline"
                loading={startTest.isPending}
                onClick={() => startTest.mutate(provider)}
                data-testid={`sso-test-${provider}`}
              >
                {t('Test sign-in')}
              </Button>
            )}
            <Button
              size="sm"
              variant="basic"
              onClick={() => setDialogOpen(true)}
              data-testid={`sso-configure-${provider}`}
            >
              {config === null ? t('Configure') : t('Edit')}
            </Button>
            {sso !== null && dialogOpen && (
              <SsoProviderDialog
                provider={provider}
                settings={sso}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
              />
            )}
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Switch
                aria-label={tenantAccessUtils.loginMethodLabel(method.method)}
                checked={method.enabled}
                disabled={blockedReason !== null || busy}
                onCheckedChange={(checked) => {
                  if (method.method === LoginMethod.EMAIL_PASSWORD) {
                    update({ emailAuthEnabled: checked });
                    return;
                  }
                  if (provider !== null) {
                    setSsoEnabled.mutate({ provider, enabled: checked });
                  }
                }}
              />
            </span>
          </TooltipTrigger>
          {blockedReason && <TooltipContent>{blockedReason}</TooltipContent>}
        </Tooltip>
      </ItemActions>
    </Item>
  );
}

function ssoProviderOf(method: LoginMethod): SsoProvider | null {
  if (method === LoginMethod.OIDC) {
    return SsoProvider.OIDC;
  }
  return method === LoginMethod.FEISHU ? SsoProvider.FEISHU : null;
}

function ssoConfigOf({
  provider,
  sso,
}: {
  provider: SsoProvider | null;
  sso: SsoSettings | null;
}) {
  if (provider === null || sso === null) {
    return null;
  }
  return (provider === SsoProvider.OIDC ? sso.oidc : sso.feishu) ?? null;
}

function hasVerifiedEnabledSso(sso: SsoSettings | null): boolean {
  if (sso === null) {
    return false;
  }
  return [sso.oidc, sso.feishu].some(
    (config) =>
      config?.enabled === true && (config.verifiedAt ?? null) !== null,
  );
}

function ssoStatusLine({
  verifiedAt,
  lastLoginAt,
}: {
  verifiedAt: Date | string | null;
  lastLoginAt: Date | string | null;
}): string {
  const tested =
    verifiedAt === null
      ? t('Not tested yet. Run a test sign-in before turning it on.')
      : t('Test sign-in passed on {date}', {
          date: formatUtils.formatDateWithTime(new Date(verifiedAt), false),
        });
  if (lastLoginAt === null) {
    return tested;
  }
  return `${tested} ${t('Last sign-in {date}', {
    date: formatUtils.formatDateWithTime(new Date(lastLoginAt), false),
  })}`;
}

function PolicyForm({ settings }: { settings: LoginSecuritySettings }) {
  const { mutate: update, isPending } =
    tenantAccessHooks.useUpdateLoginSecurity();
  const form = useForm<PolicyValues>({
    resolver: zodResolver(PolicySchema),
    mode: 'onChange',
    defaultValues: {
      passwordMinLength: settings.passwordMinLength,
      sessionDurationDays: sessionOption(settings.sessionDurationDays),
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Account policy')}</CardTitle>
        <CardDescription>
          {settings.emailDelivery
            ? t(
                'Members can reset a forgotten password by email, and admins can reset it in Users.',
              )
            : t(
                'Email is not configured, so password reset emails are not sent. Admins can reset passwords in Users.',
              )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) =>
              update({
                passwordMinLength: values.passwordMinLength,
                sessionDurationDays: sessionDays(values.sessionDurationDays),
              }),
            )}
          >
            <FormField
              control={form.control}
              name="passwordMinLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum password length')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      className="w-32"
                      min={TENANT_ACCESS_LIMITS.passwordMinLengthFloor}
                      max={TENANT_ACCESS_LIMITS.passwordMinLengthCeiling}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Between 8 and 64. Applies to new and reset passwords.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sessionDurationDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Session length')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TENANT_ACCESS_LIMITS.sessionDurationOptions.map(
                        (days) => (
                          <SelectItem key={days} value={String(days)}>
                            {t('{days} days', { days })}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t(
                      'Members sign in again after this. Applies to sessions started after saving.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-start">
              <Button type="submit" loading={isPending}>
                {t('Save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function methodIcon(method: LoginMethod) {
  switch (method) {
    case LoginMethod.EMAIL_PASSWORD:
      return <MailIcon />;
    case LoginMethod.OIDC:
      return <KeyRound />;
    case LoginMethod.FEISHU:
      return <MessageCircle />;
    default:
      return <ShieldCheck />;
  }
}

function methodDescription(method: LoginMethod): string {
  switch (method) {
    case LoginMethod.EMAIL_PASSWORD:
      return t('For teams without a central identity provider');
    case LoginMethod.OIDC:
      return t('Okta, Azure AD, Keycloak and other OIDC providers');
    case LoginMethod.SAML:
      return t('Identity providers that speak SAML');
    case LoginMethod.FEISHU:
      return t('Employees sign in with their Feishu account');
    case LoginMethod.WECOM:
      return t('Scan with WeCom or sign in inside WeCom');
    case LoginMethod.DINGTALK:
      return t('Scan with DingTalk or sign in inside DingTalk');
  }
}

function sessionOption(days: number): '1' | '7' | '30' {
  if (days === 1) {
    return '1';
  }
  return days === 30 ? '30' : '7';
}

function sessionDays(value: string): 1 | 7 | 30 {
  if (value === '1') {
    return 1;
  }
  return value === '30' ? 30 : 7;
}

const PolicySchema = z.object({
  passwordMinLength: z
    .number()
    .int('passwordMinLengthRange')
    .min(TENANT_ACCESS_LIMITS.passwordMinLengthFloor, 'passwordMinLengthRange')
    .max(
      TENANT_ACCESS_LIMITS.passwordMinLengthCeiling,
      'passwordMinLengthRange',
    ),
  sessionDurationDays: z.enum(['1', '7', '30']),
});

type PolicyValues = z.infer<typeof PolicySchema>;

AuthenticationPage.displayName = 'AuthenticationPage';
export { AuthenticationPage };

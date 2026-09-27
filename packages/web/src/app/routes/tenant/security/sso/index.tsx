import {
  LoginMethod,
  LoginMethodStatus,
  LoginSecuritySettings,
  TENANT_ACCESS_LIMITS,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Earth, KeyRound, MailIcon, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CenteredPage } from '@/app/components/centered-page';
import { AllowedDomainDialog } from '@/app/routes/tenant/security/sso/allowed-domain';
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
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { tenantHooks } from '@/hooks/tenant-hooks';

const AuthenticationPage = () => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();
  const { data: settings, isLoading } = tenantAccessHooks.useLoginSecurity();

  return (
    <CenteredPage
      widthClassName="max-w-[48rem]"
      title={t('Sign-in and security')}
      description={t(
        'How members sign in. A method has to be configured before it can be turned on, and at least one method stays on.',
      )}
    >
      {isLoading || !settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            {settings.methods.map((method) => (
              <LoginMethodRow
                key={method.method}
                method={method}
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
    </CenteredPage>
  );
};

function LoginMethodRow({
  method,
  enabledCount,
}: {
  method: LoginMethodStatus;
  enabledCount: number;
}) {
  const { mutate: update, isPending } =
    tenantAccessHooks.useUpdateLoginSecurity();
  const lastEnabled = method.enabled && enabledCount === 1;
  const blockedReason = !method.available
    ? t('This build has no sign-in integration for this method yet')
    : !method.configured
    ? t('Configure this method before turning it on')
    : lastEnabled
    ? t('At least one sign-in method must stay on')
    : null;
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">{methodIcon(method.method)}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          {tenantAccessUtils.loginMethodLabel(method.method)}
          {method.enabled ? (
            <Badge variant="success">{t('On')}</Badge>
          ) : method.available ? (
            <Badge variant="outline">{t('Off')}</Badge>
          ) : (
            <Badge variant="outline">{t('Not available')}</Badge>
          )}
        </ItemTitle>
        <ItemDescription>{methodDescription(method.method)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Switch
                aria-label={tenantAccessUtils.loginMethodLabel(method.method)}
                checked={method.enabled}
                disabled={blockedReason !== null || isPending}
                onCheckedChange={(checked) =>
                  method.method === LoginMethod.EMAIL_PASSWORD &&
                  update({ emailAuthEnabled: checked })
                }
              />
            </span>
          </TooltipTrigger>
          {blockedReason && <TooltipContent>{blockedReason}</TooltipContent>}
        </Tooltip>
      </ItemActions>
    </Item>
  );
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
      return t('Scan with Feishu or sign in inside the Feishu client');
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

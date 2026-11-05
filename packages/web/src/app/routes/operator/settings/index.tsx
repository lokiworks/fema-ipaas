import { CaptchaProvider, InstanceSettings } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { ConsolePage } from '@/components/custom/console-page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { operatorHooks, operatorUtils } from '@/features/operator';

import { PlatformLoginAppsCard } from './platform-login-apps-card';
import { SmsCard } from './sms-card';

export function OperatorSettingsPage() {
  const { data: settings, isLoading } = operatorHooks.useSettings();
  return (
    <ConsolePage
      title={t('Instance settings')}
      description={t(
        'Settings that apply to the whole instance, not to a single tenant.',
      )}
    >
      {isLoading || !settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <RegistrationCard settings={settings} />
          <SmsCard sms={settings.sms ?? null} />
          <PlatformLoginAppsCard apps={settings.platformLoginApps} />
        </div>
      )}
    </ConsolePage>
  );
}

function RegistrationCard({ settings }: { settings: InstanceSettings }) {
  const { mutate: update, isPending } = operatorHooks.useUpdateSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sign-up and verification')}</CardTitle>
        <CardDescription>
          {t('Who can create a new tenant, and how bots are kept out.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {t('Open self-service sign-up')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(
                'Anyone can create their own organization from the sign-up page. Off: tenants are only created by operators and the platform API.',
              )}
            </span>
          </div>
          <Switch
            aria-label={t('Open self-service sign-up')}
            checked={settings.tenantSelfSignup}
            disabled={isPending}
            data-testid="switch-self-signup"
            onCheckedChange={(checked) => update({ tenantSelfSignup: checked })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('Human verification')}</span>
          <Select
            value={settings.captchaProvider}
            disabled={isPending}
            onValueChange={(value) =>
              update({ captchaProvider: toCaptchaProvider(value) })
            }
          >
            <SelectTrigger className="w-64" data-testid="select-captcha">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CaptchaProvider.BUILTIN}>
                {operatorUtils.captchaLabel(CaptchaProvider.BUILTIN)}
              </SelectItem>
              <SelectItem
                value={CaptchaProvider.TURNSTILE}
                disabled={!settings.turnstileConfigured}
              >
                {operatorUtils.captchaLabel(CaptchaProvider.TURNSTILE)}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t(
              'The built-in challenge needs no account or setup. It is asked at sign-up, when a code is requested, and after repeated failed sign-ins.',
            )}
          </p>
          {!settings.turnstileConfigured && (
            <Alert>
              <AlertDescription>
                {t(
                  'Turnstile is available once its site key and secret are configured on the server.',
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            {t('Tenant sign-in domain')}
          </span>
          <span className="text-sm text-muted-foreground">
            {settings.tenantBaseDomain
              ? t('Tenants can use a sub-domain of {domain}', {
                  domain: settings.tenantBaseDomain,
                })
              : t(
                  'Not set. Tenants sign in through the /t/ path of this instance.',
                )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function toCaptchaProvider(value: string): CaptchaProvider {
  return value === CaptchaProvider.TURNSTILE
    ? CaptchaProvider.TURNSTILE
    : CaptchaProvider.BUILTIN;
}

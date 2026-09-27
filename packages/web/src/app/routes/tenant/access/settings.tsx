import {
  ModuleAccessSettings,
  PermissionDeniedHint,
  TenantMember,
  TenantMemberStatus,
  TenantModule,
  TenantRole,
  UpdateModuleAccessSettingsRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { CenteredPage } from '@/app/components/centered-page';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  MemberPicker,
  ModuleDeniedPanel,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';

export default function AccessSettingsPage() {
  const { data: settings, isLoading } = tenantAccessHooks.useModuleSettings();
  const { data: membersData } = tenantAccessHooks.useMembers();
  return (
    <CenteredPage
      widthClassName="max-w-[60rem]"
      title={t('Permission settings')}
      description={t(
        'What members see when they open a module they have no access to, and whether they can ask for it.',
      )}
    >
      {isLoading || !settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <SettingsForm
          key={JSON.stringify(settings)}
          settings={settings}
          members={membersData?.members ?? []}
        />
      )}
    </CenteredPage>
  );
}

function SettingsForm({
  settings,
  members,
}: {
  settings: ModuleAccessSettings;
  members: TenantMember[];
}) {
  const { mutate: save, isPending } =
    tenantAccessHooks.useUpdateModuleSettings();
  const form = useForm<UpdateModuleAccessSettingsRequestBody>({
    resolver: zodResolver(UpdateModuleAccessSettingsRequestBody),
    mode: 'onChange',
    defaultValues: settingsDefaults(settings),
  });
  const values = form.watch();
  const admins = members
    .filter(
      (member) =>
        member.kind === 'USER' &&
        member.status === TenantMemberStatus.ACTIVE &&
        member.tenantRole === TenantRole.ADMIN,
    )
    .sort((a, b) =>
      String(b.lastActiveDate ?? '').localeCompare(
        String(a.lastActiveDate ?? ''),
      ),
    )
    .slice(0, 2);
  const person = members.find((member) => member.id === values.personUserId);
  const contacts = (
    values.deniedHint === PermissionDeniedHint.PERSON
      ? person
        ? [person]
        : []
      : admins
  ).map((member) => ({
    name: tenantAccessUtils.memberDisplayName(member),
    email: member.email,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_20rem]">
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((submitted) => save(submitted))}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('When a member has no access')}</CardTitle>
              <CardDescription>
                {t('Choose what the member sees on the locked page.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="deniedHint"
                render={({ field }) => (
                  <FormItem>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex flex-col gap-2"
                    >
                      {HINT_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center gap-2 text-sm"
                        >
                          <RadioGroupItem value={option.value} />
                          {option.label()}
                        </label>
                      ))}
                    </RadioGroup>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {values.deniedHint === PermissionDeniedHint.PERSON && (
                <FormField
                  control={form.control}
                  name="personUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Person to contact')}</FormLabel>
                      <MemberPicker
                        members={members}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        excludeIds={[]}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {values.deniedHint === PermissionDeniedHint.URL && (
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Link')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ''
                                ? null
                                : event.target.value,
                            )
                          }
                          placeholder="https://"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle>{t('Permission requests')}</CardTitle>
                <CardDescription>
                  {t(
                    'Let members ask for connector development, MCP services or platform administration from inside the platform.',
                  )}
                </CardDescription>
              </div>
              <FormField
                control={form.control}
                name="allowRequests"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={t('Permission requests')}
                  />
                )}
              />
            </CardHeader>
            {values.allowRequests && (
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Requests are reviewed in the platform by admins. Feishu approval is not available.',
                  )}
                </p>
                <FormField
                  control={form.control}
                  name="notice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Notice for requesters')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} maxLength={200} />
                      </FormControl>
                      <FormDescription>
                        {t('Shown in the request dialog.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rulesUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Review rules link')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ''
                                ? null
                                : event.target.value,
                            )
                          }
                          placeholder="https://"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            )}
          </Card>
          <div className="flex justify-start gap-2">
            <Button type="submit" loading={isPending}>
              {t('Save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset(settingsDefaults(settings))}
            >
              {t('Cancel')}
            </Button>
          </div>
        </form>
      </Form>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{t('Preview')}</span>
        <ModuleDeniedPanel
          module={TenantModule.CONNECTOR_DEVELOPMENT}
          deniedHint={values.deniedHint}
          contacts={contacts}
          url={values.url ?? null}
          allowRequests={values.allowRequests}
          notice={values.notice}
          pending={false}
          interactive={false}
        />
      </div>
    </div>
  );
}

function settingsDefaults(
  settings: ModuleAccessSettings,
): UpdateModuleAccessSettingsRequestBody {
  return {
    deniedHint: settings.deniedHint,
    personUserId: settings.personUserId ?? null,
    url: settings.url ?? null,
    allowRequests: settings.allowRequests,
    notice: settings.notice,
    rulesUrl: settings.rulesUrl ?? null,
  };
}

const HINT_OPTIONS = [
  {
    value: PermissionDeniedHint.ADMINS,
    label: () => t('Show the two most recently active admins'),
  },
  {
    value: PermissionDeniedHint.PERSON,
    label: () => t('Show a specific person'),
  },
  { value: PermissionDeniedHint.URL, label: () => t('Show a link') },
  {
    value: PermissionDeniedHint.APPLY,
    label: () => t('Show a request access button'),
  },
];

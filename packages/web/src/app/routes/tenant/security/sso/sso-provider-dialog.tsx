import { isNil } from '@fema-ipaas/core-utils';
import {
  DefaultProjectRole,
  FeishuSsoSettings,
  OidcSsoSettings,
  SSO_ASSIGNABLE_ROLES,
  SSO_LIMITS,
  SsoProvider,
  SsoRegion,
  SsoSettings,
  TenantRole,
  UpdateFeishuSsoRequestBody,
  UpdateOidcSsoRequestBody,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { FieldPath, useFieldArray, useForm } from 'react-hook-form';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

function SsoProviderDialog({
  provider,
  settings,
  open,
  onOpenChange,
}: SsoProviderDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const existing =
    provider === SsoProvider.OIDC ? settings.oidc : settings.feishu;
  const form = useForm<SsoFormValues>({
    defaultValues: toFormValues({ existing }),
  });
  const rules = useFieldArray({ control: form.control, name: 'roleRules' });
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const projects = directory ?? [];
  const mapRoles = form.watch('mapRoles');
  const defaultProjectId = form.watch('defaultProjectId');
  const close = (): void => onOpenChange(false);
  const saveOidc = tenantAccessHooks.useSaveOidcSso({ onSaved: close });
  const saveFeishu = tenantAccessHooks.useSaveFeishuSso({ onSaved: close });
  const pending = saveOidc.isPending || saveFeishu.isPending;

  const submit = form.handleSubmit((values) => {
    form.clearErrors();
    if (provider === SsoProvider.OIDC) {
      const parsed = UpdateOidcSsoRequestBody.safeParse(
        toOidcRequest({ values, existing: settings.oidc ?? null }),
      );
      if (!parsed.success) {
        applyIssues({ form, issues: parsed.error.issues });
        return;
      }
      saveOidc.mutate(parsed.data);
      return;
    }
    const parsed = UpdateFeishuSsoRequestBody.safeParse(
      toFeishuRequest({ values, existing: settings.feishu ?? null }),
    );
    if (!parsed.success) {
      applyIssues({ form, issues: parsed.error.issues });
      return;
    }
    saveFeishu.mutate(parsed.data);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-h-[88vh] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const firstInput = contentRef.current?.querySelector('input');
          (firstInput ?? contentRef.current)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {provider === SsoProvider.OIDC
              ? t('Configure OIDC sign-in')
              : t('Configure Feishu sign-in')}
          </DialogTitle>
          <DialogDescription>
            {provider === SsoProvider.OIDC
              ? t(
                  'Register this platform as a client at your identity provider, then fill in what it gives you.',
                )
              : t(
                  'Create a Feishu self-built app, turn on web login and the email permission, then fill in its credentials.',
                )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {t('Redirect URI to register at the provider')}
              </div>
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 break-all text-xs"
                  data-testid="sso-redirect-uri"
                >
                  {settings.redirectUri}
                </code>
                <CopyButton
                  textToCopy={settings.redirectUri}
                  variant="outline"
                  type="button"
                />
              </div>
            </div>

            {provider === SsoProvider.OIDC ? (
              <OidcFields form={form} existing={settings.oidc ?? null} />
            ) : (
              <FeishuFields form={form} existing={settings.feishu ?? null} />
            )}

            <TextField
              form={form}
              name="displayName"
              label={t('Button name')}
              placeholder={
                provider === SsoProvider.OIDC
                  ? t('Company account')
                  : t('Feishu')
              }
              description={t(
                'Shown on the sign-in page. Leave empty for the default.',
              )}
            />

            <FormField
              control={form.control}
              name="allowedDomains"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Allowed email domains')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      minRows={2}
                      placeholder="acme.com"
                      data-testid="sso-allowed-domains"
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'One per line. Empty means any domain the provider vouches for.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SwitchField
              form={form}
              name="autoCreateUsers"
              label={t('Create accounts on first sign-in')}
              description={t(
                'Off: only people already invited or already members can sign in.',
              )}
            />

            <FormField
              control={form.control}
              name="defaultRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Role for new accounts')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SSO_ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {tenantAccessUtils.roleLabel({
                            tenantRole: role,
                            isOwner: false,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {provider === SsoProvider.OIDC && (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <SwitchField
                  form={form}
                  name="mapRoles"
                  label={t('Map groups to roles')}
                  description={t(
                    'Decide the role from a claim of the ID token, for example groups.',
                  )}
                />
                {mapRoles && (
                  <>
                    <TextField
                      form={form}
                      name="roleClaim"
                      label={t('Claim that holds the groups')}
                      placeholder={SSO_LIMITS.defaultRoleClaim}
                    />
                    <div className="flex flex-col gap-2">
                      {rules.fields.map((rule, index) => (
                        <div key={rule.id} className="flex items-center gap-2">
                          <Input
                            {...form.register(`roleRules.${index}.value`)}
                            placeholder={t('Group value')}
                            aria-label={t('Group value')}
                          />
                          <Select
                            value={form.watch(`roleRules.${index}.role`)}
                            onValueChange={(value) =>
                              form.setValue(
                                `roleRules.${index}.role`,
                                toRole(value),
                              )
                            }
                          >
                            <SelectTrigger className="w-36 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SSO_ASSIGNABLE_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {tenantAccessUtils.roleLabel({
                                    tenantRole: role,
                                    isOwner: false,
                                  })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('Remove')}
                            onClick={() => rules.remove(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          rules.append({ value: '', role: TenantRole.MEMBER })
                        }
                      >
                        <Plus className="size-4" />
                        {t('Add rule')}
                      </Button>
                    </div>
                    <SwitchField
                      form={form}
                      name="syncOnLogin"
                      label={t('Update the role on every sign-in')}
                      description={t(
                        'Off: the role is only decided when the account is created. The owner is never changed.',
                      )}
                    />
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-md border p-3">
              <FormField
                control={form.control}
                name="defaultProjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Default project for new accounts')}
                    </FormLabel>
                    <Select
                      value={field.value === '' ? NO_PROJECT : field.value}
                      onValueChange={(value) =>
                        field.onChange(value === NO_PROJECT ? '' : value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT}>
                          {t('None, only their personal project')}
                        </SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {defaultProjectId !== '' && (
                <FormField
                  control={form.control}
                  name="defaultProjectRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Role in that project')}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) =>
                          field.onChange(toProjectRole(value))
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(DefaultProjectRole).map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {form.formState.errors.root?.message && (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('Cancel')}
              </Button>
              <Button type="submit" loading={pending} data-testid="sso-save">
                {t('Save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function OidcFields({ form, existing }: FieldsProps<OidcSsoSettings>) {
  return (
    <>
      <TextField
        form={form}
        name="issuer"
        label={t('Issuer URL')}
        required
        placeholder="https://login.example.com/realms/acme"
        description={t(
          'The address that serves /.well-known/openid-configuration. It must match the issuer exactly.',
        )}
      />
      <TextField form={form} name="clientId" label={t('Client ID')} required />
      <TextField
        form={form}
        name="clientSecret"
        label={t('Client secret')}
        required={!existing?.hasClientSecret}
        type="password"
        placeholder={
          existing?.hasClientSecret ? t('Saved. Leave empty to keep it.') : ''
        }
      />
      <TextField
        form={form}
        name="scopes"
        label={t('Scopes')}
        description={t(
          'Add a groups scope here if your provider needs one to release groups.',
        )}
      />
      <TextField
        form={form}
        name="emailClaim"
        label={t('Claim that holds the email')}
      />
      <SwitchField
        form={form}
        name="requireVerifiedEmail"
        label={t('Require a verified email')}
        description={t(
          'Turn off only if your provider does not send email_verified, for example Azure AD.',
        )}
      />
    </>
  );
}

function FeishuFields({ form, existing }: FieldsProps<FeishuSsoSettings>) {
  return (
    <>
      <TextField
        form={form}
        name="appId"
        label={t('App ID')}
        required
        placeholder="cli_xxxxxxxx"
      />
      <TextField
        form={form}
        name="appSecret"
        label={t('App secret')}
        required={!existing?.hasAppSecret}
        type="password"
        placeholder={
          existing?.hasAppSecret ? t('Saved. Leave empty to keep it.') : ''
        }
      />
      <FormField
        control={form.control}
        name="region"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Region')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={SsoRegion.FEISHU}>
                  {t('Feishu (China)')}
                </SelectItem>
                <SelectItem value={SsoRegion.LARK}>
                  {t('Lark (international)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      <TextField
        form={form}
        name="allowedEnterpriseKey"
        label={t('Enterprise key (tenant_key)')}
        description={t(
          'Optional. Only people of this Feishu enterprise can sign in. Recommended for self-built apps.',
        )}
      />
    </>
  );
}

function TextField({
  form,
  name,
  label,
  placeholder,
  description,
  type,
  required,
}: TextFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel showRequiredIndicator={required}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === 'string' ? field.value : ''}
              type={type ?? 'text'}
              placeholder={placeholder}
              autoComplete="off"
              data-testid={`sso-field-${name}`}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SwitchField({ form, name, label, description }: SwitchFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <FormLabel>{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </div>
          <FormControl>
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
              data-testid={`sso-switch-${name}`}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function toFormValues({
  existing,
}: {
  existing: ExistingSettings;
}): SsoFormValues {
  const mapping = existing?.roleMapping ?? null;
  const oidc =
    existing !== null && existing !== undefined && 'issuer' in existing
      ? existing
      : null;
  const feishu =
    existing !== null && existing !== undefined && 'appId' in existing
      ? existing
      : null;
  return {
    displayName: existing?.displayName ?? '',
    allowedDomains: (existing?.allowedDomains ?? []).join('\n'),
    autoCreateUsers: existing?.autoCreateUsers ?? true,
    defaultRole: existing?.defaultRole ?? TenantRole.MEMBER,
    mapRoles: !isNil(mapping),
    roleClaim: mapping?.claim ?? SSO_LIMITS.defaultRoleClaim,
    roleRules: mapping?.rules ?? [],
    syncOnLogin: mapping?.syncOnLogin ?? false,
    defaultProjectId: existing?.defaultProject?.projectId ?? '',
    defaultProjectRole:
      existing?.defaultProject?.role ?? DefaultProjectRole.VIEWER,
    issuer: oidc?.issuer ?? '',
    clientId: oidc?.clientId ?? '',
    clientSecret: '',
    scopes: oidc?.scopes ?? SSO_LIMITS.defaultScopes,
    emailClaim: oidc?.emailClaim ?? SSO_LIMITS.defaultEmailClaim,
    requireVerifiedEmail: oidc?.requireVerifiedEmail ?? true,
    appId: feishu?.appId ?? '',
    appSecret: '',
    region: feishu?.region ?? SsoRegion.FEISHU,
    allowedEnterpriseKey: feishu?.allowedEnterpriseKey ?? '',
  };
}

function commonRequest(values: SsoFormValues) {
  return {
    displayName: values.displayName,
    allowedDomains: values.allowedDomains
      .split(/[\s,，;；]+/)
      .map((domain) => domain.trim())
      .filter((domain) => domain.length > 0),
    autoCreateUsers: values.autoCreateUsers,
    defaultRole: values.defaultRole,
    defaultProject:
      values.defaultProjectId === ''
        ? null
        : {
            projectId: values.defaultProjectId,
            role: values.defaultProjectRole,
          },
  };
}

function toOidcRequest({
  values,
  existing,
}: {
  values: SsoFormValues;
  existing: OidcSsoSettings | null;
}) {
  return {
    ...commonRequest(values),
    enabled: existing?.enabled ?? false,
    roleMapping: values.mapRoles
      ? {
          claim: values.roleClaim,
          rules: values.roleRules.filter(
            (rule) => rule.value.trim().length > 0,
          ),
          syncOnLogin: values.syncOnLogin,
        }
      : null,
    issuer: values.issuer,
    clientId: values.clientId,
    ...(values.clientSecret.length > 0
      ? { clientSecret: values.clientSecret }
      : {}),
    scopes: values.scopes,
    emailClaim: values.emailClaim,
    requireVerifiedEmail: values.requireVerifiedEmail,
  };
}

function toFeishuRequest({
  values,
  existing,
}: {
  values: SsoFormValues;
  existing: FeishuSsoSettings | null;
}) {
  return {
    ...commonRequest(values),
    enabled: existing?.enabled ?? false,
    roleMapping: null,
    appId: values.appId,
    ...(values.appSecret.length > 0 ? { appSecret: values.appSecret } : {}),
    region: values.region,
    allowedEnterpriseKey:
      values.allowedEnterpriseKey.trim() === ''
        ? null
        : values.allowedEnterpriseKey,
  };
}

function applyIssues({
  form,
  issues,
}: {
  form: ReturnType<typeof useForm<SsoFormValues>>;
  issues: { path: PropertyKey[]; message: string }[];
}): void {
  issues.forEach((issue) => {
    const head = String(issue.path[0] ?? '');
    const message = t(issue.message);
    const field = FIELD_NAMES.find((name) => name === head);
    if (field !== undefined) {
      form.setError(field, { message });
      return;
    }
    form.setError('root', { message });
  });
}

function toRole(value: string): TenantRole {
  return (
    SSO_ASSIGNABLE_ROLES.find((role) => role === value) ?? TenantRole.MEMBER
  );
}

function toProjectRole(value: string): DefaultProjectRole {
  return (
    Object.values(DefaultProjectRole).find((role) => role === value) ??
    DefaultProjectRole.VIEWER
  );
}

const NO_PROJECT = '__none__';

const FIELD_NAMES: FieldPath<SsoFormValues>[] = [
  'displayName',
  'allowedDomains',
  'issuer',
  'clientId',
  'clientSecret',
  'scopes',
  'emailClaim',
  'appId',
  'appSecret',
  'region',
  'allowedEnterpriseKey',
];

export { SsoProviderDialog };

type SsoProviderDialogProps = {
  provider: SsoProvider;
  settings: SsoSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SsoFormValues = {
  displayName: string;
  allowedDomains: string;
  autoCreateUsers: boolean;
  defaultRole: TenantRole;
  mapRoles: boolean;
  roleClaim: string;
  roleRules: { value: string; role: TenantRole }[];
  syncOnLogin: boolean;
  defaultProjectId: string;
  defaultProjectRole: DefaultProjectRole;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  emailClaim: string;
  requireVerifiedEmail: boolean;
  appId: string;
  appSecret: string;
  region: SsoRegion;
  allowedEnterpriseKey: string;
};

type FormApi = ReturnType<typeof useForm<SsoFormValues>>;

type ExistingSettings = OidcSsoSettings | FeishuSsoSettings | null | undefined;

type FieldsProps<T> = {
  form: FormApi;
  existing: T | null;
};

type TextFieldProps = {
  form: FormApi;
  name: FieldPath<SsoFormValues>;
  label: string;
  placeholder?: string;
  description?: string;
  type?: string;
  required?: boolean;
};

type SwitchFieldProps = {
  form: FormApi;
  name: FieldPath<SsoFormValues>;
  label: string;
  description: string;
};

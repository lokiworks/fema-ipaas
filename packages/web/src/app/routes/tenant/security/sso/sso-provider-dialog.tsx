import { isNil } from '@fema-ipaas/core-utils';
import {
  DefaultProjectRole,
  DingtalkSsoSettings,
  FeishuSsoSettings,
  OidcSsoSettings,
  SamlSsoSettings,
  SSO_ASSIGNABLE_ROLES,
  SSO_LIMITS,
  SsoMatchBy,
  SsoProvider,
  SsoRegion,
  SsoSettings,
  TenantRole,
  UpdateDingtalkSsoRequestBody,
  UpdateFeishuSsoRequestBody,
  UpdateOidcSsoRequestBody,
  UpdateSamlSsoRequestBody,
  UpdateWecomSsoRequestBody,
  WecomSsoSettings,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FileUp, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { FieldPath, useFieldArray, useForm } from 'react-hook-form';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
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

import { ssoFormUtils } from './sso-form-utils';

function SsoProviderDialog({
  provider,
  settings,
  open,
  onOpenChange,
}: SsoProviderDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const existing = existingOf({ provider, settings });
  const locked =
    provider === SsoProvider.OIDC && settings.oidc?.provisioned === true;
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
  const saveWecom = tenantAccessHooks.useSaveWecomSso({ onSaved: close });
  const saveDingtalk = tenantAccessHooks.useSaveDingtalkSso({ onSaved: close });
  const saveSaml = tenantAccessHooks.useSaveSamlSso({ onSaved: close });
  const pending =
    saveOidc.isPending ||
    saveFeishu.isPending ||
    saveWecom.isPending ||
    saveDingtalk.isPending ||
    saveSaml.isPending;

  const submit = form.handleSubmit((values) => {
    form.clearErrors();
    const outcome = buildRequest({ provider, values, settings });
    if (!outcome.success) {
      applyIssues({ form, issues: outcome.issues });
      return;
    }
    switch (outcome.provider) {
      case SsoProvider.OIDC:
        saveOidc.mutate(outcome.data);
        return;
      case SsoProvider.FEISHU:
        saveFeishu.mutate(outcome.data);
        return;
      case SsoProvider.WECOM:
        saveWecom.mutate(outcome.data);
        return;
      case SsoProvider.DINGTALK:
        saveDingtalk.mutate(outcome.data);
        return;
      case SsoProvider.SAML:
        saveSaml.mutate(outcome.data);
        return;
    }
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
          <DialogTitle>{dialogTitle(provider)}</DialogTitle>
          <DialogDescription>
            {locked
              ? t(
                  'This sign-in was set up by the platform that provisioned your tenant. You can turn it on or off, change its button name, decide who may sign in and set how often membership is re-checked.',
                )
              : dialogDescription(provider)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {!locked && provider !== SsoProvider.SAML && (
              <InfoBox
                label={t('Redirect URI to register at the provider')}
                value={settings.redirectUri}
                testId="sso-redirect-uri"
              />
            )}
            {!locked && provider === SsoProvider.SAML && (
              <SamlServiceProviderInfo info={settings.samlServiceProvider} />
            )}

            {!locked && (
              <ProviderFields
                provider={provider}
                form={form}
                settings={settings}
              />
            )}

            {locked && <RecheckField form={form} />}

            <TextField
              form={form}
              name="displayName"
              label={t('Button name')}
              placeholder={defaultButtonName(provider)}
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

            {provider === SsoProvider.OIDC && !locked && (
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
      <FormField
        control={form.control}
        name="matchBy"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Match people by')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-72" data-testid="sso-field-matchBy">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={SsoMatchBy.EMAIL}>
                  {t('Email address')}
                </SelectItem>
                <SelectItem value={SsoMatchBy.SUBJECT}>
                  {t('Issuer and subject')}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              {t(
                'Subject matching survives email changes and does not need the provider to send an email.',
              )}
            </FormDescription>
          </FormItem>
        )}
      />
      <RecheckField form={form} />
      <ExtraAuthParams form={form} />
    </>
  );
}

function RecheckField({ form }: { form: FormApi }) {
  return (
    <TextField
      form={form}
      name="sessionRecheckMinutes"
      label={t('Re-check interval (minutes)')}
      placeholder={t('Off')}
      description={t(
        'Ask the provider this often whether the person is still a member. 5 to 1440. Empty turns it off.',
      )}
    />
  );
}

function ExtraAuthParams({ form }: { form: FormApi }) {
  const params = useFieldArray({ control: form.control, name: 'extraParams' });
  return (
    <div className="flex flex-col gap-2" data-testid="sso-extra-params">
      <FormLabel>{t('Extra authorization parameters')}</FormLabel>
      <FormDescription>
        {t(
          'Added to the authorization request, for example organization or tenant.',
        )}
      </FormDescription>
      {params.fields.map((param, index) => (
        <div key={param.id} className="flex items-center gap-2">
          <Input
            {...form.register(`extraParams.${index}.key`)}
            placeholder={t('Name')}
            aria-label={t('Name')}
          />
          <Input
            {...form.register(`extraParams.${index}.value`)}
            placeholder={t('Value')}
            aria-label={t('Value')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('Remove')}
            onClick={() => params.remove(index)}
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
        onClick={() => params.append({ key: '', value: '' })}
      >
        <Plus className="size-4" />
        {t('Add parameter')}
      </Button>
    </div>
  );
}

function ProviderFields({
  provider,
  form,
  settings,
}: {
  provider: SsoProvider;
  form: FormApi;
  settings: SsoSettings;
}) {
  switch (provider) {
    case SsoProvider.OIDC:
      return <OidcFields form={form} existing={settings.oidc ?? null} />;
    case SsoProvider.FEISHU:
      return <FeishuFields form={form} existing={settings.feishu ?? null} />;
    case SsoProvider.WECOM:
      return <WecomFields form={form} existing={settings.wecom ?? null} />;
    case SsoProvider.DINGTALK:
      return (
        <DingtalkFields form={form} existing={settings.dingtalk ?? null} />
      );
    case SsoProvider.SAML:
      return <SamlFields form={form} existing={settings.saml ?? null} />;
  }
}

function WecomFields({ form, existing }: FieldsProps<WecomSsoSettings>) {
  return (
    <>
      <TextField form={form} name="corpId" label={t('Corp ID')} required />
      <TextField form={form} name="agentId" label={t('Agent ID')} required />
      <TextField
        form={form}
        name="secret"
        label={t('App secret')}
        required={!existing?.hasSecret}
        type="password"
        placeholder={
          existing?.hasSecret ? t('Saved. Leave empty to keep it.') : ''
        }
      />
    </>
  );
}

function DingtalkFields({ form, existing }: FieldsProps<DingtalkSsoSettings>) {
  return (
    <>
      <TextField form={form} name="appKey" label={t('App key')} required />
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
      <TextField
        form={form}
        name="dingtalkCorpId"
        label={t('Corp ID')}
        description={t(
          'Optional. Only people of this DingTalk organization can sign in.',
        )}
      />
    </>
  );
}

function MetadataFileButton({
  onLoaded,
}: {
  onLoaded: (text: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInput}
        type="file"
        accept=".xml,text/xml,application/xml"
        data-testid="sso-metadata-file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          onLoaded(await file.text());
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInput.current?.click()}
      >
        <FileUp className="size-4" />
        {t('Upload metadata file')}
      </Button>
    </div>
  );
}

function SamlFields({ form, existing }: FieldsProps<SamlSsoSettings>) {
  return (
    <>
      <FormField
        control={form.control}
        name="idpMetadataXml"
        render={({ field }) => (
          <FormItem>
            <FormLabel showRequiredIndicator={!existing}>
              {t('Identity provider metadata (XML)')}
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                minRows={5}
                className="font-mono text-xs"
                placeholder={
                  existing
                    ? t(
                        'Saved ({count} certificates). Leave empty to keep it, or paste new metadata to replace it.',
                        { count: existing.certificateCount },
                      )
                    : '<EntityDescriptor ...>'
                }
                data-testid="sso-field-idpMetadataXml"
              />
            </FormControl>
            <MetadataFileButton onLoaded={field.onChange} />
            <FormDescription>
              {t(
                'Upload the file your provider gives you, or paste its content.',
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <TextField
        form={form}
        name="emailAttribute"
        label={t('Attribute that holds the email')}
        required
      />
      <TextField
        form={form}
        name="firstNameAttribute"
        label={t('Attribute for first name')}
      />
      <TextField
        form={form}
        name="lastNameAttribute"
        label={t('Attribute for last name')}
      />
      <FormField
        control={form.control}
        name="subjectSource"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Identify people by')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="NAME_ID">{t('NameID')}</SelectItem>
                <SelectItem value="ATTRIBUTE">{t('An attribute')}</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      {form.watch('subjectSource') === 'ATTRIBUTE' && (
        <TextField
          form={form}
          name="subjectAttribute"
          label={t('Attribute that holds the subject')}
        />
      )}
      <SwitchField
        form={form}
        name="signAuthnRequests"
        label={t('Sign sign-in requests')}
        description={t(
          'Turn on if your provider requires signed requests. It then needs the signing certificate from the metadata link above.',
        )}
      />
    </>
  );
}

function InfoBox({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <CopyToClipboardInput textToCopy={value} useInput={true} />
    </div>
  );
}

function SamlServiceProviderInfo({
  info,
}: {
  info: SsoSettings['samlServiceProvider'];
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="saml-sp-info">
      <InfoBox
        label={t('SP entity ID')}
        value={info.spEntityId}
        testId="saml-sp-entity-id"
      />
      <InfoBox
        label={t('ACS address (assertion consumer service)')}
        value={info.acsUrl}
        testId="saml-acs-url"
      />
      <InfoBox
        label={t('SP metadata address')}
        value={info.spMetadataUrl}
        testId="saml-sp-metadata-url"
      />
    </div>
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

function existingOf({
  provider,
  settings,
}: {
  provider: SsoProvider;
  settings: SsoSettings;
}): ExistingSettings {
  switch (provider) {
    case SsoProvider.OIDC:
      return settings.oidc;
    case SsoProvider.FEISHU:
      return settings.feishu;
    case SsoProvider.WECOM:
      return settings.wecom;
    case SsoProvider.DINGTALK:
      return settings.dingtalk;
    case SsoProvider.SAML:
      return settings.saml;
  }
}

function dialogTitle(provider: SsoProvider): string {
  switch (provider) {
    case SsoProvider.OIDC:
      return t('Configure OIDC sign-in');
    case SsoProvider.FEISHU:
      return t('Configure Feishu sign-in');
    case SsoProvider.WECOM:
      return t('Configure WeCom sign-in');
    case SsoProvider.DINGTALK:
      return t('Configure DingTalk sign-in');
    case SsoProvider.SAML:
      return t('Configure SAML sign-in');
  }
}

function dialogDescription(provider: SsoProvider): string {
  switch (provider) {
    case SsoProvider.OIDC:
      return t(
        'Register this platform as a client at your identity provider, then fill in what it gives you.',
      );
    case SsoProvider.FEISHU:
      return t(
        'Create a Feishu self-built app, turn on web login and the email permission, then fill in its credentials.',
      );
    case SsoProvider.WECOM:
      return t(
        'Create a WeCom self-built app, set the redirect domain, then fill in its credentials.',
      );
    case SsoProvider.DINGTALK:
      return t(
        'Create a DingTalk internal app with sign-in permission, then fill in its credentials.',
      );
    case SsoProvider.SAML:
      return t(
        'Register this platform as a service provider at your identity provider, then upload the metadata it gives you.',
      );
  }
}

function defaultButtonName(provider: SsoProvider): string {
  switch (provider) {
    case SsoProvider.OIDC:
      return t('Company account');
    case SsoProvider.FEISHU:
      return t('Feishu');
    case SsoProvider.WECOM:
      return t('WeCom');
    case SsoProvider.DINGTALK:
      return t('DingTalk');
    case SsoProvider.SAML:
      return t('Company account');
  }
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
    existing !== null &&
    existing !== undefined &&
    'allowedEnterpriseKey' in existing
      ? existing
      : null;
  const wecom =
    existing !== null && existing !== undefined && 'agentId' in existing
      ? existing
      : null;
  const dingtalk =
    existing !== null && existing !== undefined && 'appKey' in existing
      ? existing
      : null;
  const saml =
    existing !== null && existing !== undefined && 'idpEntityId' in existing
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
    matchBy: oidc?.matchBy ?? SsoMatchBy.EMAIL,
    sessionRecheckMinutes:
      oidc?.sessionRecheckMinutes === null ||
      oidc?.sessionRecheckMinutes === undefined
        ? ''
        : String(oidc.sessionRecheckMinutes),
    extraParams: ssoFormUtils.paramsToRows(oidc?.extraAuthParams ?? {}),
    appId: feishu?.appId ?? '',
    appSecret: '',
    region: feishu?.region ?? SsoRegion.FEISHU,
    allowedEnterpriseKey: feishu?.allowedEnterpriseKey ?? '',
    corpId: wecom?.corpId ?? '',
    agentId: wecom?.agentId ?? '',
    secret: '',
    appKey: dingtalk?.appKey ?? '',
    dingtalkCorpId: dingtalk?.corpId ?? '',
    idpMetadataXml: '',
    emailAttribute: saml?.emailAttribute ?? 'email',
    firstNameAttribute: saml?.firstNameAttribute ?? '',
    lastNameAttribute: saml?.lastNameAttribute ?? '',
    subjectSource: saml?.subjectSource ?? 'NAME_ID',
    subjectAttribute: saml?.subjectAttribute ?? '',
    signAuthnRequests: saml?.signAuthnRequests ?? false,
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

function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
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
    matchBy: values.matchBy,
    extraAuthParams: ssoFormUtils.rowsToParams(values.extraParams),
    sessionRecheckMinutes: ssoFormUtils.parseRecheck(
      values.sessionRecheckMinutes,
    ),
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

function toWecomRequest({
  values,
  existing,
}: {
  values: SsoFormValues;
  existing: WecomSsoSettings | null;
}) {
  return {
    ...commonRequest(values),
    enabled: existing?.enabled ?? false,
    roleMapping: null,
    corpId: values.corpId,
    agentId: values.agentId,
    ...(values.secret.length > 0 ? { secret: values.secret } : {}),
  };
}

function toDingtalkRequest({
  values,
  existing,
}: {
  values: SsoFormValues;
  existing: DingtalkSsoSettings | null;
}) {
  return {
    ...commonRequest(values),
    enabled: existing?.enabled ?? false,
    roleMapping: null,
    appKey: values.appKey,
    ...(values.appSecret.length > 0 ? { appSecret: values.appSecret } : {}),
    corpId: emptyToNull(values.dingtalkCorpId),
  };
}

function toSamlRequest({
  values,
  existing,
}: {
  values: SsoFormValues;
  existing: SamlSsoSettings | null;
}) {
  return {
    ...commonRequest(values),
    enabled: existing?.enabled ?? false,
    roleMapping: null,
    ...(values.idpMetadataXml.trim().length > 0
      ? { idpMetadataXml: values.idpMetadataXml }
      : {}),
    emailAttribute: values.emailAttribute,
    firstNameAttribute: emptyToNull(values.firstNameAttribute),
    lastNameAttribute: emptyToNull(values.lastNameAttribute),
    subjectSource: values.subjectSource,
    subjectAttribute:
      values.subjectSource === 'ATTRIBUTE'
        ? emptyToNull(values.subjectAttribute)
        : null,
    signAuthnRequests: values.signAuthnRequests,
  };
}

function buildRequest({
  provider,
  values,
  settings,
}: {
  provider: SsoProvider;
  values: SsoFormValues;
  settings: SsoSettings;
}): BuildOutcome {
  switch (provider) {
    case SsoProvider.OIDC: {
      const recheckError = ssoFormUtils.recheckError(
        values.sessionRecheckMinutes,
      );
      if (recheckError !== null) {
        return {
          success: false,
          issues: [{ path: ['sessionRecheckMinutes'], message: recheckError }],
        };
      }
      const parsed = UpdateOidcSsoRequestBody.safeParse(
        toOidcRequest({ values, existing: settings.oidc ?? null }),
      );
      return parsed.success
        ? { success: true, provider, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    }
    case SsoProvider.FEISHU: {
      const parsed = UpdateFeishuSsoRequestBody.safeParse(
        toFeishuRequest({ values, existing: settings.feishu ?? null }),
      );
      return parsed.success
        ? { success: true, provider, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    }
    case SsoProvider.WECOM: {
      const parsed = UpdateWecomSsoRequestBody.safeParse(
        toWecomRequest({ values, existing: settings.wecom ?? null }),
      );
      return parsed.success
        ? { success: true, provider, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    }
    case SsoProvider.DINGTALK: {
      const parsed = UpdateDingtalkSsoRequestBody.safeParse(
        toDingtalkRequest({ values, existing: settings.dingtalk ?? null }),
      );
      return parsed.success
        ? { success: true, provider, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    }
    case SsoProvider.SAML: {
      if (settings.saml === null || settings.saml === undefined) {
        if (values.idpMetadataXml.trim().length === 0) {
          return {
            success: false,
            issues: [{ path: ['idpMetadataXml'], message: 'required' }],
          };
        }
      }
      const parsed = UpdateSamlSsoRequestBody.safeParse(
        toSamlRequest({ values, existing: settings.saml ?? null }),
      );
      return parsed.success
        ? { success: true, provider, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    }
  }
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
  'matchBy',
  'sessionRecheckMinutes',
  'corpId',
  'agentId',
  'secret',
  'appKey',
  'dingtalkCorpId',
  'idpMetadataXml',
  'emailAttribute',
  'firstNameAttribute',
  'lastNameAttribute',
  'subjectAttribute',
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
  matchBy: SsoMatchBy;
  sessionRecheckMinutes: string;
  extraParams: { key: string; value: string }[];
  appId: string;
  appSecret: string;
  region: SsoRegion;
  allowedEnterpriseKey: string;
  corpId: string;
  agentId: string;
  secret: string;
  appKey: string;
  dingtalkCorpId: string;
  idpMetadataXml: string;
  emailAttribute: string;
  firstNameAttribute: string;
  lastNameAttribute: string;
  subjectSource: 'NAME_ID' | 'ATTRIBUTE';
  subjectAttribute: string;
  signAuthnRequests: boolean;
};

type RequestIssue = { path: PropertyKey[]; message: string };

type BuildOutcome =
  | { success: false; issues: RequestIssue[] }
  | {
      success: true;
      provider: SsoProvider.OIDC;
      data: UpdateOidcSsoRequestBody;
    }
  | {
      success: true;
      provider: SsoProvider.FEISHU;
      data: UpdateFeishuSsoRequestBody;
    }
  | {
      success: true;
      provider: SsoProvider.WECOM;
      data: UpdateWecomSsoRequestBody;
    }
  | {
      success: true;
      provider: SsoProvider.DINGTALK;
      data: UpdateDingtalkSsoRequestBody;
    }
  | {
      success: true;
      provider: SsoProvider.SAML;
      data: UpdateSamlSsoRequestBody;
    };

type FormApi = ReturnType<typeof useForm<SsoFormValues>>;

type ExistingSettings =
  | OidcSsoSettings
  | FeishuSsoSettings
  | WecomSsoSettings
  | DingtalkSsoSettings
  | SamlSsoSettings
  | null
  | undefined;

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

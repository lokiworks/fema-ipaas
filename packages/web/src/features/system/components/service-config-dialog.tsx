import {
  ObjectStorageServiceConfig,
  OptionalServiceKind,
  RegistryServiceConfig,
  ServiceCheckResult,
  ServiceSettingDraft,
  ServiceSettingView,
  SmtpServiceConfig,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Plug, Send } from 'lucide-react';
import { Control, FieldValues, Path, useForm } from 'react-hook-form';

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
import { api } from '@/lib/api';

import { serviceSettingsHooks } from '../hooks/service-settings-hooks';
import { serviceMeta } from '../utils/service-meta';

import { CheckOutcome } from './service-check';

export function ServiceConfigDialog({
  setting,
  open,
  onOpenChange,
  testRecipient,
}: {
  setting: ServiceSettingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testRecipient?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('Set up {service}', {
              service: serviceMeta.name({ kind: setting.kind }),
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'The settings are tested before they are saved. Secrets are stored encrypted and are never shown again. Environment variables, if set, win over what you save here.',
            )}
          </DialogDescription>
        </DialogHeader>
        <ConfigBody
          key={open ? 'open' : 'closed'}
          setting={setting}
          onDone={() => onOpenChange(false)}
          testRecipient={testRecipient}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConfigBody({
  setting,
  onDone,
  testRecipient,
}: {
  setting: ServiceSettingView;
  onDone: () => void;
  testRecipient?: string;
}) {
  switch (setting.kind) {
    case OptionalServiceKind.SMTP:
      return (
        <SmtpForm
          setting={setting}
          onDone={onDone}
          testRecipient={testRecipient}
        />
      );
    case OptionalServiceKind.OBJECT_STORAGE:
      return <ObjectStorageForm setting={setting} onDone={onDone} />;
    case OptionalServiceKind.CONNECTOR_REGISTRY:
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return (
        <RegistryForm kind={setting.kind} setting={setting} onDone={onDone} />
      );
  }
}

function SmtpForm({
  setting,
  onDone,
  testRecipient,
}: {
  setting: ServiceSettingView;
  onDone: () => void;
  testRecipient?: string;
}) {
  const form = useForm<SmtpServiceConfig>({
    resolver: zodResolver(SmtpServiceConfig),
    mode: 'onChange',
    defaultValues: {
      host: textOf({ setting, name: 'host' }),
      port: numberOf({ setting, name: 'port' }) ?? 587,
      username: textOf({ setting, name: 'username' }),
      password: '',
      senderEmail: textOf({ setting, name: 'senderEmail' }),
      senderName: textOf({ setting, name: 'senderName' }),
    },
  });
  const draftOf = (config: SmtpServiceConfig): ServiceSettingDraft => ({
    kind: OptionalServiceKind.SMTP,
    config,
  });
  return (
    <Form {...form}>
      <FormShell
        kind={OptionalServiceKind.SMTP}
        valid={form.formState.isValid}
        onDone={onDone}
        testRecipient={testRecipient}
        draft={() => draftOf(form.getValues())}
        onSubmit={form.handleSubmit}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextField
              control={form.control}
              name="host"
              label={t('SMTP server')}
              placeholder="smtp.example.com"
            />
          </div>
          <TextField
            control={form.control}
            name="port"
            label={t('Port')}
            numeric
            description={t(
              '465 uses SSL/TLS. Other ports use STARTTLS when the server offers it.',
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="username"
            label={t('User name')}
            description={t('Leave empty for a relay that needs no sign-in.')}
          />
          <TextField
            control={form.control}
            name="password"
            label={t('Password')}
            secret
            placeholder={
              setting.secretConfigured ? t('Saved. Leave empty to keep it') : ''
            }
          />
          <TextField
            control={form.control}
            name="senderEmail"
            label={t('Sender address')}
            placeholder="noreply@example.com"
          />
          <TextField
            control={form.control}
            name="senderName"
            label={t('Sender name')}
            description={t('Empty uses the organization name.')}
          />
        </div>
      </FormShell>
    </Form>
  );
}

function ObjectStorageForm({
  setting,
  onDone,
}: {
  setting: ServiceSettingView;
  onDone: () => void;
}) {
  const form = useForm<ObjectStorageServiceConfig>({
    resolver: zodResolver(ObjectStorageServiceConfig),
    mode: 'onChange',
    defaultValues: {
      endpoint: textOf({ setting, name: 'endpoint' }),
      region: textOf({ setting, name: 'region' }),
      bucket: textOf({ setting, name: 'bucket' }),
      accessKeyId: textOf({ setting, name: 'accessKeyId' }),
      secretAccessKey: '',
    },
  });
  const missingSecret =
    !setting.secretConfigured && !form.watch('secretAccessKey');
  return (
    <Form {...form}>
      <FormShell
        kind={OptionalServiceKind.OBJECT_STORAGE}
        valid={form.formState.isValid && !missingSecret}
        onDone={onDone}
        draft={() => ({
          kind: OptionalServiceKind.OBJECT_STORAGE,
          config: form.getValues(),
        })}
        onSubmit={form.handleSubmit}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="endpoint"
            label={t('Endpoint')}
            placeholder="https://s3.example.com"
            description={t('Leave empty for AWS S3.')}
          />
          <TextField
            control={form.control}
            name="region"
            label={t('Region')}
            placeholder="us-east-1"
          />
          <TextField control={form.control} name="bucket" label={t('Bucket')} />
          <TextField
            control={form.control}
            name="accessKeyId"
            label={t('Access key ID')}
          />
          <TextField
            control={form.control}
            name="secretAccessKey"
            label={t('Secret access key')}
            secret
            placeholder={
              setting.secretConfigured ? t('Saved. Leave empty to keep it') : ''
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'New run files and logs go to the bucket. Files already in the database stay where they are.',
          )}
        </p>
      </FormShell>
    </Form>
  );
}

function RegistryForm({
  kind,
  setting,
  onDone,
}: {
  kind:
    | OptionalServiceKind.CONNECTOR_REGISTRY
    | OptionalServiceKind.TEMPLATE_REGISTRY;
  setting: ServiceSettingView;
  onDone: () => void;
}) {
  const form = useForm<RegistryServiceConfig>({
    resolver: zodResolver(RegistryServiceConfig),
    mode: 'onChange',
    defaultValues: { url: textOf({ setting, name: 'url' }) },
  });
  return (
    <Form {...form}>
      <FormShell
        kind={kind}
        valid={form.formState.isValid}
        onDone={onDone}
        draft={() => ({ kind, config: form.getValues() })}
        onSubmit={form.handleSubmit}
      >
        <TextField
          control={form.control}
          name="url"
          label={t('Address')}
          placeholder="https://registry.example.com"
        />
      </FormShell>
    </Form>
  );
}

function FormShell({
  kind,
  valid,
  onDone,
  testRecipient,
  draft,
  onSubmit,
  children,
}: {
  kind: OptionalServiceKind;
  valid: boolean;
  onDone: () => void;
  testRecipient?: string;
  draft: () => ServiceSettingDraft;
  onSubmit: (
    handler: () => void,
  ) => (event?: React.BaseSyntheticEvent) => Promise<void>;
  children: React.ReactNode;
}) {
  const save = serviceSettingsHooks.useSave({ onSaved: onDone });
  const test = serviceSettingsHooks.useTest();
  const result: ServiceCheckResult | undefined =
    save.data && !save.data.saved ? save.data.check : test.data;
  const error = save.error ?? test.error;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={onSubmit(() => save.mutate(draft()))}
    >
      {children}
      <div aria-live="polite" className="min-h-5">
        {result && <CheckOutcome kind={kind} result={result} />}
        {error && !result && (
          <span className="text-xs text-destructive">
            {api.extractServerErrorMessage(
              error,
              t('The check could not be run.'),
            )}
          </span>
        )}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!valid}
            loading={test.isPending}
            onClick={() => test.mutate({ draft: draft() })}
          >
            <Plug className="size-4" />
            {t('Test connection')}
          </Button>
          {kind === OptionalServiceKind.SMTP && testRecipient && (
            <Button
              type="button"
              variant="outline"
              disabled={!valid}
              loading={test.isPending}
              onClick={() =>
                test.mutate({ draft: draft(), recipient: testRecipient })
              }
            >
              <Send className="size-4" />
              {t('Send test email to {email}', { email: testRecipient })}
            </Button>
          )}
        </div>
        <Button type="submit" disabled={!valid} loading={save.isPending}>
          {t('Test and save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  secret,
  numeric,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
  placeholder?: string;
  secret?: boolean;
  numeric?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {numeric ? (
              <Input
                type="number"
                inputMode="numeric"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={field.value ?? ''}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ''
                      ? undefined
                      : Number(event.target.value),
                  )
                }
              />
            ) : (
              <Input
                {...field}
                value={field.value ?? ''}
                type={secret ? 'password' : 'text'}
                autoComplete={secret ? 'new-password' : 'off'}
                placeholder={placeholder}
              />
            )}
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function textOf({
  setting,
  name,
}: {
  setting: ServiceSettingView;
  name: string;
}): string {
  const value = setting.values[name];
  return value === undefined ? '' : String(value);
}

function numberOf({
  setting,
  name,
}: {
  setting: ServiceSettingView;
  name: string;
}): number | undefined {
  const value = setting.values[name];
  return typeof value === 'number' ? value : undefined;
}

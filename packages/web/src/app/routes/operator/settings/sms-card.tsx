import {
  SmsProviderKind,
  SmsSettingsPublic,
  TestSmsSettingsRequestBody,
  UpdateSmsSettingsRequestBody,
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
import { internalErrorMessage } from '@/components/ui/sonner';
import {
  operatorHooks,
  operatorSchemas,
  operatorUtils,
  SmsFormValues,
  SmsTestFormValues,
} from '@/features/operator';
import { FormServerError, tenantAccessUtils } from '@/features/tenant-access';
import { api } from '@/lib/api';

export function SmsCard({ sms }: { sms: SmsSettingsPublic | null }) {
  const [editing, setEditing] = useState(sms === null);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            {t('SMS service')}
            {sms ? (
              <Badge variant={sms.verifiedAt ? 'success' : 'outline'}>
                {sms.verifiedAt ? t('Tested') : t('Not tested')}
              </Badge>
            ) : (
              <Badge variant="outline">{t('Not configured')}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t(
              'Sends verification codes for mobile sign-in. Until it is configured, mobile sign-in stays hidden.',
            )}
          </CardDescription>
        </div>
        {sms && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid="sms-edit"
          >
            {t('Edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {sms && !editing && (
          <p className="text-sm text-muted-foreground">
            {operatorUtils.smsProviderLabel(sms.provider)} · {sms.signName}
          </p>
        )}
        {editing && (
          <SmsForm
            key={sms?.accessKeyId ?? 'new'}
            sms={sms}
            onSaved={() => setEditing(false)}
          />
        )}
        {sms && <SmsTest />}
      </CardContent>
    </Card>
  );
}

function SmsForm({
  sms,
  onSaved,
}: {
  sms: SmsSettingsPublic | null;
  onSaved: () => void;
}) {
  const schema = useMemo(
    () =>
      operatorSchemas.smsForm({ hasSecret: sms?.hasAccessKeySecret === true }),
    [sms?.hasAccessKeySecret],
  );
  const form = useForm<SmsFormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: smsDefaults(sms),
  });
  const provider = form.watch('provider');
  const { mutate: save, isPending } = operatorHooks.useSaveSms({
    onSaved,
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
          const parsed = UpdateSmsSettingsRequestBody.safeParse(
            operatorUtils.smsRequest(values),
          );
          if (parsed.success) {
            save(parsed.data);
          }
        })}
      >
        <FormField
          control={form.control}
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Provider')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) =>
                  field.onChange(value === 'TENCENT' ? 'TENCENT' : 'ALIYUN')
                }
              >
                <FormControl>
                  <SelectTrigger className="w-64" data-testid="sms-provider">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SmsProviderKind.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {operatorUtils.smsProviderLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextRow
          form={form}
          name="accessKeyId"
          label={t('AccessKey ID')}
          required
        />
        <TextRow
          form={form}
          name="accessKeySecret"
          label={t('AccessKey secret')}
          required={sms?.hasAccessKeySecret !== true}
          type="password"
          placeholder={
            sms?.hasAccessKeySecret ? t('Saved. Leave empty to keep it.') : ''
          }
        />
        <TextRow
          form={form}
          name="signName"
          label={t('Signature name')}
          required
        />
        <TextRow
          form={form}
          name="templateCode"
          label={t('Template code')}
          required
        />
        {provider === 'TENCENT' && (
          <TextRow form={form} name="sdkAppId" label={t('SDK app ID')} />
        )}
        <TextRow
          form={form}
          name="region"
          label={t('Region')}
          placeholder={provider === 'TENCENT' ? 'ap-guangzhou' : 'cn-hangzhou'}
        />
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
        <div>
          <Button type="submit" loading={isPending} data-testid="sms-save">
            {t('Save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SmsTest() {
  const form = useForm<SmsTestFormValues>({
    mode: 'onChange',
    resolver: zodResolver(operatorSchemas.smsTestForm),
    defaultValues: { phone: '' },
  });
  const { mutate: sendTest, isPending } = operatorHooks.useTestSms({
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-1.5 border-t pt-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          const parsed = TestSmsSettingsRequestBody.safeParse({
            phone: tenantAccessUtils.normalizePhone(values.phone),
          });
          if (parsed.success) {
            sendTest(parsed.data);
          }
        })}
      >
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Send a test message')}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    {...field}
                    className="w-64"
                    placeholder="13800138000"
                    data-testid="sms-test-phone"
                  />
                </FormControl>
                <Button
                  type="submit"
                  variant="outline"
                  loading={isPending}
                  data-testid="sms-test-send"
                >
                  {t('Send test')}
                </Button>
              </div>
              <FormDescription>
                {t('A successful test marks the settings as tested.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
      </form>
    </Form>
  );
}

function TextRow({
  form,
  name,
  label,
  type,
  placeholder,
  required,
}: {
  form: ReturnType<typeof useForm<SmsFormValues>>;
  name:
    | 'accessKeyId'
    | 'accessKeySecret'
    | 'signName'
    | 'templateCode'
    | 'sdkAppId'
    | 'region';
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
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
              type={type ?? 'text'}
              placeholder={placeholder}
              autoComplete="off"
              data-testid={`sms-field-${name}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function smsDefaults(sms: SmsSettingsPublic | null): SmsFormValues {
  return {
    provider: sms?.provider ?? 'ALIYUN',
    accessKeyId: sms?.accessKeyId ?? '',
    accessKeySecret: '',
    signName: sms?.signName ?? '',
    templateCode: sms?.templateCode ?? '',
    sdkAppId: sms?.sdkAppId ?? '',
    region: sms?.region ?? '',
  };
}

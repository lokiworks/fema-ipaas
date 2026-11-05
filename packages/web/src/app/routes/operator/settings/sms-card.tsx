import {
  SmsProviderKind,
  SmsSettingsPublic,
  TestSmsSettingsRequestBody,
  UpdateSmsSettingsRequestBody,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { operatorHooks, operatorUtils } from '@/features/operator';
import { tenantAccessUtils } from '@/features/tenant-access';

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
  const { mutate: save, isPending } = operatorHooks.useSaveSms({ onSaved });
  const [provider, setProvider] = useState<SmsProviderKind>(
    sms?.provider ?? 'ALIYUN',
  );
  const [accessKeyId, setAccessKeyId] = useState(sms?.accessKeyId ?? '');
  const [accessKeySecret, setAccessKeySecret] = useState('');
  const [signName, setSignName] = useState(sms?.signName ?? '');
  const [templateCode, setTemplateCode] = useState(sms?.templateCode ?? '');
  const [sdkAppId, setSdkAppId] = useState(sms?.sdkAppId ?? '');
  const [region, setRegion] = useState(sms?.region ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const parsed = UpdateSmsSettingsRequestBody.safeParse({
      provider,
      accessKeyId,
      ...(accessKeySecret.length > 0 ? { accessKeySecret } : {}),
      signName,
      templateCode,
      sdkAppId: provider === 'TENCENT' ? emptyToNull(sdkAppId) : null,
      region: emptyToNull(region),
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'required'));
      return;
    }
    if (!sms?.hasAccessKeySecret && accessKeySecret.length === 0) {
      setError(t('required'));
      return;
    }
    setError(null);
    save(parsed.data);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label>{t('Provider')}</Label>
        <Select
          value={provider}
          onValueChange={(value) =>
            setProvider(value === 'TENCENT' ? 'TENCENT' : 'ALIYUN')
          }
        >
          <SelectTrigger className="w-64" data-testid="sms-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALIYUN">
              {operatorUtils.smsProviderLabel('ALIYUN')}
            </SelectItem>
            <SelectItem value="TENCENT">
              {operatorUtils.smsProviderLabel('TENCENT')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TextRow
        id="sms-key-id"
        label={t('AccessKey ID')}
        value={accessKeyId}
        onChange={setAccessKeyId}
      />
      <TextRow
        id="sms-key-secret"
        label={t('AccessKey secret')}
        value={accessKeySecret}
        type="password"
        placeholder={
          sms?.hasAccessKeySecret ? t('Saved. Leave empty to keep it.') : ''
        }
        onChange={setAccessKeySecret}
      />
      <TextRow
        id="sms-sign"
        label={t('Signature name')}
        value={signName}
        onChange={setSignName}
      />
      <TextRow
        id="sms-template"
        label={t('Template code')}
        value={templateCode}
        onChange={setTemplateCode}
      />
      {provider === 'TENCENT' && (
        <TextRow
          id="sms-sdk-app"
          label={t('SDK app ID')}
          value={sdkAppId}
          onChange={setSdkAppId}
        />
      )}
      <TextRow
        id="sms-region"
        label={t('Region')}
        value={region}
        placeholder={provider === 'TENCENT' ? 'ap-guangzhou' : 'cn-hangzhou'}
        onChange={setRegion}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={isPending} data-testid="sms-save">
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}

function SmsTest() {
  const { mutate: sendTest, isPending } = operatorHooks.useTestSms();
  const [phone, setPhone] = useState('');
  const normalized = tenantAccessUtils.normalizePhone(phone);
  const parsed = TestSmsSettingsRequestBody.safeParse({ phone: normalized });
  return (
    <div className="flex flex-col gap-1.5 border-t pt-4">
      <Label htmlFor="sms-test-phone">{t('Send a test message')}</Label>
      <div className="flex items-center gap-2">
        <Input
          id="sms-test-phone"
          className="w-64"
          value={phone}
          placeholder="13800138000"
          data-testid="sms-test-phone"
          onChange={(event) => setPhone(event.target.value)}
        />
        <Button
          variant="outline"
          loading={isPending}
          disabled={!parsed.success}
          data-testid="sms-test-send"
          onClick={() => {
            if (parsed.success) {
              sendTest(parsed.data);
            }
          }}
        >
          {t('Send test')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('A successful test marks the settings as tested.')}
      </p>
    </div>
  );
}

function TextRow({
  id,
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type ?? 'text'}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={id}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function emptyToNull(value: string): string | null {
  return value.trim().length === 0 ? null : value.trim();
}

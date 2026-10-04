import {
  LOG_RETENTION_DAYS_OPTIONS,
  MaskRuleType,
  PayloadLevel,
  PrivacySettings,
  privacyMasking,
  RAW_PAYLOAD_RETENTION_DAYS_OPTIONS,
  RawViewRole,
  UpdatePrivacySettingsRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { CenteredPage } from '@/app/components/centered-page';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DataErasureSection, privacyHooks } from '@/features/privacy';

export function PrivacyPage() {
  const { data: settings, isLoading } = privacyHooks.useSettings({
    showErrorDialog: true,
  });
  return (
    <CenteredPage
      title={t('Data and privacy')}
      description={t(
        'How long run data is kept, what is recorded, and which fields are masked in logs.',
      )}
    >
      {isLoading || !settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <PrivacyForm key={settings.updated.toString()} settings={settings} />
          <DataErasureSection />
        </div>
      )}
    </CenteredPage>
  );
}

function PrivacyForm({ settings }: { settings: PrivacySettings }) {
  const { mutate: save, isPending } = privacyHooks.useUpdateSettings();
  const form = useForm<UpdatePrivacySettingsRequestBody>({
    resolver: zodResolver(UpdatePrivacySettingsRequestBody),
    mode: 'onChange',
    defaultValues: {
      logRetentionDays: settings.logRetentionDays,
      payloadLevel: settings.payloadLevel,
      rawPayloadRetentionDays: settings.rawPayloadRetentionDays,
      maskRules: settings.maskRules,
      rawViewRoles: settings.rawViewRoles,
      requireRawViewReason: settings.requireRawViewReason,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'maskRules',
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => save(values))}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('Retention')}</CardTitle>
            <CardDescription>
              {t(
                'Run data older than this is deleted every day. Projects can only choose a shorter period.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="logRetentionDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Keep run logs for')}</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LOG_RETENTION_DAYS_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {t('{days} days', { days })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rawPayloadRetentionDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Keep unmasked originals for')}</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RAW_PAYLOAD_RETENTION_DAYS_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {t('{days} days', { days })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t(
                      'Logs are masked before they are saved. The unmasked run state is kept only this long after a run ends, for viewing originals and replaying from the failed step; after that only a full rerun is possible.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('What is recorded')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="payloadLevel"
              render={({ field }) => (
                <FormItem>
                  <RadioGroup
                    value={field.value}
                    onValueChange={(value) =>
                      field.onChange(toPayloadLevel(value))
                    }
                    className="flex flex-col gap-3"
                  >
                    {PAYLOAD_LEVELS.map((level) => (
                      <label
                        key={level}
                        className="flex items-start gap-2 cursor-pointer"
                      >
                        <RadioGroupItem value={level} />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">
                            {payloadLevelLabel(level)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {payloadLevelDescription(level)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Masking rules')}</CardTitle>
            <CardDescription>
              {t(
                'Masked values are replaced before step inputs and outputs are shown in run logs.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fields.map((rule, index) => (
              <div key={rule.id} className="flex items-start gap-3">
                <FormField
                  control={form.control}
                  name={`maskRules.${index}.enabled`}
                  render={({ field }) => (
                    <FormItem className="pt-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          aria-label={rule.name}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {rule.type === MaskRuleType.BUILTIN ? (
                  <div className="flex flex-col pt-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('Built-in detector')}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[160px_1fr_auto] gap-2 flex-1">
                    <FormField
                      control={form.control}
                      name={`maskRules.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t('Rule name')}
                              maxLength={20}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`maskRules.${index}.pattern`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              placeholder="^salary|薪资"
                              className="font-mono"
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Regular expression matched against field names',
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('Delete')}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                append({
                  id: `field-${Date.now()}`,
                  name: '',
                  type: MaskRuleType.FIELD,
                  detector: null,
                  pattern: '',
                  enabled: true,
                })
              }
            >
              <Plus className="size-4 mr-1" />
              {t('Add field rule')}
            </Button>
            <MaskPreview control={form.control} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Viewing originals')}</CardTitle>
            <CardDescription>
              {t(
                'Every time someone views an unmasked value it is written to the audit log.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="rawViewRoles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Who can view originals')}</FormLabel>
                  <div className="flex gap-4">
                    {Object.values(RawViewRole).map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value.includes(role)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [
                                    ...field.value.filter(
                                      (item) => item !== role,
                                    ),
                                    role,
                                  ]
                                : field.value.filter((item) => item !== role),
                            )
                          }
                        />
                        {rawViewRoleLabel(role)}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requireRawViewReason"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>{t('Require a reason')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type="submit" className="self-start" loading={isPending}>
          {t('Save')}
        </Button>
      </form>
    </Form>
  );
}

function MaskPreview({
  control,
}: {
  control: ReturnType<
    typeof useForm<UpdatePrivacySettingsRequestBody>
  >['control'];
}) {
  const rules = useWatch({ control, name: 'maskRules' });
  const [sample, setSample] = useState(SAMPLE_PAYLOAD);
  const preview = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(sample);
      const result = privacyMasking.maskDeep({
        value: parsed,
        rules,
        maskAll: false,
      });
      return {
        text: JSON.stringify(result.value, null, 2),
        count: result.maskedCount,
        error: false,
      };
    } catch {
      return { text: '', count: 0, error: true };
    }
  }, [sample, rules]);
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('Sample data')}</span>
        <Textarea
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          className="font-mono text-xs min-h-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {preview.error
            ? t('Sample is not valid JSON')
            : t('After masking · {count} fields', { count: preview.count })}
        </span>
        <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs min-h-48 overflow-auto">
          {preview.text}
        </pre>
      </div>
    </div>
  );
}

function payloadLevelLabel(level: PayloadLevel): string {
  switch (level) {
    case PayloadLevel.FULL:
      return t('Full inputs and outputs');
    case PayloadLevel.METADATA:
      return t('Metadata only');
    case PayloadLevel.NONE:
      return t('Do not show inputs and outputs');
  }
}

function payloadLevelDescription(level: PayloadLevel): string {
  switch (level) {
    case PayloadLevel.FULL:
      return t(
        'Logs show masked inputs and outputs; authorised people can view originals.',
      );
    case PayloadLevel.METADATA:
      return t(
        'Logs show status, duration and errors only. Replaying from the failed step still works.',
      );
    case PayloadLevel.NONE:
      return t(
        'Inputs and outputs are hidden from everyone, including admins.',
      );
  }
}

function rawViewRoleLabel(role: RawViewRole): string {
  switch (role) {
    case RawViewRole.OWNER:
      return t('Owner');
    case RawViewRole.ADMIN:
      return t('Admins');
    case RawViewRole.MEMBER:
      return t('Members');
  }
}

function toPayloadLevel(value: string): PayloadLevel {
  return PAYLOAD_LEVELS.find((level) => level === value) ?? PayloadLevel.FULL;
}

const PAYLOAD_LEVELS = [
  PayloadLevel.FULL,
  PayloadLevel.METADATA,
  PayloadLevel.NONE,
];

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    employee_id: 'XH20260918',
    name: '王磊',
    mobile: '13812345678',
    id_card: '110101199001011234',
    email: 'wanglei@example.com',
    salary: { base: 32000, bonus: 5000 },
    api_key: 'sk-live-123456',
  },
  null,
  2,
);

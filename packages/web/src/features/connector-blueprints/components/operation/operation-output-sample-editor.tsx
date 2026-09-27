import { isNil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { BracesIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { SmartOutputViewer } from '@/components/custom/smart-output-viewer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function BlueprintSampleEditor({
  sample,
  onSave,
  isPending,
}: {
  sample: unknown;
  onSave: (sample: unknown) => void;
  isPending?: boolean;
}) {
  const initial = sampleText(sample);
  const [text, setText] = useState(initial);
  const dirty = text !== initial;
  const parsed = parseSample(text);
  const shown = parsed.value ?? (isSampleObject(sample) ? sample : null);

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('Outputs')}</span>
        <div className="flex gap-2">
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setText(initial)}>
              <RotateCcwIcon className="size-4" />
              {t('Revert')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!parsed.value}
            onClick={() => setText(JSON.stringify(parsed.value, null, 2))}
          >
            <BracesIcon className="size-4" />
            {t('Format')}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || Boolean(parsed.error)}
            loading={isPending}
            onClick={() => {
              onSave(parsed.value ?? {});
              toast.success(t('Outputs saved'));
            }}
          >
            {t('Save')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('Response sample')}</span>
          <Textarea
            rows={14}
            className="font-mono"
            value={text}
            placeholder={t('Paste a real response JSON, for example {sample}', {
              sample: '{ "id": 1 }',
            })}
            onChange={(event) => setText(event.target.value)}
          />
          {parsed.error ? (
            <p className="text-xs text-destructive">{parsed.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(
                'The output structure is generated from the response sample and can be referenced from workflows once saved',
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            {t('Output structure')}
            {dirty && !parsed.error && parsed.value && (
              <span className="ml-1 text-xs text-muted-foreground">
                {t('(preview, not saved)')}
              </span>
            )}
          </span>
          {shown ? (
            <SmartOutputViewer json={shown} title={t('Response sample')} />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              {t('No outputs yet, paste a response sample on the left')}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function sampleText(sample: unknown): string {
  return isSampleObject(sample) ? JSON.stringify(sample, null, 2) : '';
}

function isSampleObject(
  sample: unknown,
): sample is Record<string, unknown> | unknown[] {
  if (isNil(sample) || typeof sample !== 'object' || sample === null) {
    return false;
  }
  return Array.isArray(sample)
    ? sample.length > 0
    : Object.keys(sample).length > 0;
}

function parseSample(text: string): {
  value: Record<string, unknown> | unknown[] | null;
  error: string;
} {
  if (text.trim().length === 0) {
    return { value: null, error: '' };
  }
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') {
      return { value, error: '' };
    }
    return {
      value: null,
      error: t('The output sample must be a JSON object or array'),
    };
  } catch {
    return { value: null, error: t('Not valid JSON') };
  }
}

import { AI_PROMPT_MAX_LENGTH } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function HomeAiBox({
  disabledReason,
  onSubmit,
}: {
  disabledReason: string | null;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const disabled = disabledReason !== null;
  const trimmed = prompt.trim();
  const submit = () => {
    if (!disabled) {
      onSubmit(trimmed);
    }
  };
  return (
    <section
      aria-label={t('Create a workflow with AI')}
      className="flex flex-col gap-3 rounded-xl border bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 text-primary" />
        <span>
          {t(
            'Describe what you want to automate. AI lists the steps and the questions to confirm, then builds a draft for you.',
          )}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          rows={2}
          maxLength={AI_PROMPT_MAX_LENGTH}
          value={prompt}
          disabled={disabled}
          aria-label={t('Describe what you want to automate')}
          placeholder={t(HOME_AI_PLACEHOLDER)}
          className="min-h-[56px] flex-1 resize-none bg-background"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <MessageTooltip isDisabled={disabled} message={disabledReason ?? ''}>
          <Button disabled={disabled} onClick={submit}>
            <Sparkles className="size-4" />
            {trimmed ? t('Start planning') : t('Create with AI')}
          </Button>
        </MessageTooltip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('Try')}</span>
        {HOME_AI_EXAMPLES.map((example) => (
          <Button
            key={example.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-xs"
            disabled={disabled}
            onClick={() => onSubmit(t(example.prompt))}
          >
            {t(example.label)}
          </Button>
        ))}
      </div>
    </section>
  );
}

const HOME_AI_PLACEHOLDER =
  'For example: when an employee is onboarded in Beisen, create their Feishu account by department and tell the HR group';

const HOME_AI_EXAMPLES = [
  {
    label: 'Onboarding: create accounts',
    prompt:
      'When an employee is onboarded in Beisen, create their Feishu account by department and post a welcome message to the HR group',
  },
  {
    label: 'Offboarding: suspend account',
    prompt:
      'When an employee leaves in Beisen, suspend their Feishu account and notify IT to collect equipment',
  },
  {
    label: 'Transfer: sync department',
    prompt:
      'When an employee transfers in Beisen, update their department and manager in Feishu',
  },
];

import { t } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Button } from '@/components/ui/button';

import { HOME_AI_PROMPT_MAX_LENGTH } from '../utils/home-utils';

export function HomeAiBox({
  disabledReason,
  onSubmit,
}: {
  disabledReason: string | null;
  onSubmit: (prompt: string) => void;
}) {
  const [text, setText] = useState('');
  const disabled = disabledReason !== null;
  const submit = () => {
    if (disabled) {
      return;
    }
    onSubmit(text.trim());
    setText('');
  };
  return (
    <section
      aria-label={t('Create a workflow with AI')}
      className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="size-4" />
        <span>
          {t(
            'Describe what you want to automate in one sentence. AI lists the steps and open questions, then builds a draft for you.',
          )}
        </span>
      </div>
      <div className="flex items-end gap-2 rounded-lg border bg-background p-2 pl-3 focus-within:border-primary">
        <textarea
          rows={2}
          maxLength={HOME_AI_PROMPT_MAX_LENGTH}
          value={text}
          aria-label={t('Describe what you want to automate')}
          placeholder={t(
            'Describe what you want to automate, for example: after a new hire joins, create their record in Feishu, open accounts by department and notify the HR group',
          )}
          className="min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          onChange={(event) => setText(event.target.value)}
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
            {text.trim() ? t('Start planning') : t('Create with AI')}
          </Button>
        </MessageTooltip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t('Try')}</span>
        {AI_EXAMPLES.map((example) => (
          <Button
            key={example.labelKey}
            type="button"
            variant="outline"
            size="xs"
            className="rounded-full"
            disabled={disabled}
            onClick={() => onSubmit(t(example.promptKey))}
          >
            {t(example.labelKey)}
          </Button>
        ))}
      </div>
    </section>
  );
}

const AI_EXAMPLES = [
  {
    labelKey: 'Onboarding accounts',
    promptKey:
      'After an employee completes onboarding in Beisen, create their record in a Feishu Base, open GitHub and Jira accounts by department, and notify the HR group',
  },
  {
    labelKey: 'Expense receipts to ledger',
    promptKey:
      'When the expense system sends a receipt image, use AI to read the invoice number, amount and seller, send large receipts for review, and write the result to the Feishu expense ledger',
  },
  {
    labelKey: 'WeCom leads to CRM',
    promptKey:
      'When a salesperson adds a customer in WeCom, create a lead in the CRM and remind the sales group to follow up',
  },
  {
    labelKey: 'IT help desk agent',
    promptKey:
      'When an employee asks the IT assistant in Feishu, the agent first answers from the internal knowledge base, otherwise opens a Jira ticket and replies with the ticket number',
  },
  {
    labelKey: 'Daily sales report',
    promptKey:
      "Every weekday at 9:00, summarize yesterday's Salesforce opportunities, write a short AI summary and post it to the sales operations group",
  },
];

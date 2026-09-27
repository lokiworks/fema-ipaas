import i18next, { t } from 'i18next';
import { Plus, Search } from 'lucide-react';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Button } from '@/components/ui/button';

import { homeUtils } from '../utils/home-utils';

export function HomeHero({
  userName,
  tenantName,
  now,
  newWorkflowDisabledReason,
  onSearch,
  onNewWorkflow,
}: {
  userName: string;
  tenantName: string;
  now: Date;
  newWorkflowDisabledReason: string | null;
  onSearch: () => void;
  onNewWorkflow: () => void;
}) {
  const isMac =
    typeof navigator !== 'undefined' && /(Mac)/i.test(navigator.userAgent);
  const date = new Intl.DateTimeFormat(i18next.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('{greeting}, {name}', {
            greeting: t(homeUtils.greetingKey(now.getHours())),
            name: userName,
          })}
        </h1>
        <span className="text-sm text-muted-foreground">
          {tenantName} · {date}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onSearch}>
          <Search className="size-4" />
          {t('Search')}
          <kbd className="pointer-events-none ml-1 rounded border bg-muted px-1 font-mono text-[10px]">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </Button>
        <MessageTooltip
          isDisabled={newWorkflowDisabledReason !== null}
          message={newWorkflowDisabledReason ?? ''}
        >
          <Button
            disabled={newWorkflowDisabledReason !== null}
            onClick={onNewWorkflow}
          >
            <Plus className="size-4" />
            {t('New workflow')}
          </Button>
        </MessageTooltip>
      </div>
    </div>
  );
}

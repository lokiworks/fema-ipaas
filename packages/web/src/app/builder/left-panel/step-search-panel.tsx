import { WorkflowTriggerType, workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { LeftSideBarType } from '@/app/builder/types';
import { useStepDisplayNumbers } from '@/app/builder/use-step-display-numbers';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export function StepSearchPanel() {
  const [trigger, selectStepByName, setLeftSidebar, setHighlightedSteps] =
    useBuilderStateContext((state) => [
      state.workflowVersion.trigger,
      state.selectStepByName,
      state.setLeftSidebar,
      state.setHighlightedSteps,
    ]);
  const displayNumbers = useStepDisplayNumbers();
  const [query, setQuery] = useState('');
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((keyword) => keyword.length > 0);
  const steps = workflowStructureUtil
    .getAllSteps(trigger)
    .filter((step) => step.type !== WorkflowTriggerType.EMPTY)
    .filter((step) => {
      const haystack = `${step.displayName} ${
        displayNumbers[step.name] ?? ''
      } ${step.name}`.toLowerCase();
      return keywords.every((keyword) => haystack.includes(keyword));
    });
  return (
    <div className="flex h-full w-full flex-col">
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        <span className="truncate font-semibold">{t('Search steps')}</span>
      </SidebarHeader>
      <div className="relative px-3 pb-2">
        <Search className="absolute left-5 top-2 size-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t('Name or number, e.g. feishu-1')}
          className="h-8 pl-8"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {steps.length === 0 && (
            <span className="px-2 py-4 text-xs text-muted-foreground">
              {t('No steps match')}
            </span>
          )}
          {steps.map((step) => (
            <button
              key={step.name}
              type="button"
              onClick={() => {
                selectStepByName(step.name);
                setHighlightedSteps([step.name]);
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 grow truncate">{step.displayName}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {displayNumbers[step.name]}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { LayoutTemplate, SearchX } from 'lucide-react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { TemplateCenterTab } from '../utils/template-center-utils';

import { TemplateCard } from './template-card';

export function TemplateCenterTabs({
  value,
  onChange,
  counts,
  showPersonalTabs,
}: {
  value: TemplateCenterTab;
  onChange: (tab: TemplateCenterTab) => void;
  counts: Record<TemplateCenterTab, number>;
  showPersonalTabs: boolean;
}) {
  const tabs = showPersonalTabs
    ? TEMPLATE_CENTER_TABS
    : TEMPLATE_CENTER_TABS.filter(
        (tab) => tab.value === TemplateCenterTab.RECOMMENDED,
      );
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const tab = TEMPLATE_CENTER_TABS.find((item) => item.value === next);
        if (tab) {
          onChange(tab.value);
        }
      }}
    >
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {t(tab.label)}
            {tab.value !== TemplateCenterTab.RECOMMENDED && (
              <span className="text-xs text-muted-foreground">
                {counts[tab.value]}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function TemplateGrid({
  templates,
  onSelect,
  className,
}: {
  templates: Template[];
  onSelect: (template: Template) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onClick={onSelect}
        />
      ))}
    </div>
  );
}

export function TemplateGridSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="h-[150px] w-full rounded-lg" />
      ))}
    </div>
  );
}

export function TemplateCenterEmpty({
  tab,
  searching,
}: {
  tab: TemplateCenterTab;
  searching: boolean;
}) {
  const { title, description } = emptyCopy({ tab, searching });
  return (
    <Empty className="min-h-[260px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {searching ? <SearchX /> : <LayoutTemplate />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

function emptyCopy({
  tab,
  searching,
}: {
  tab: TemplateCenterTab;
  searching: boolean;
}): { title: string; description: string | null } {
  if (searching) {
    return {
      title: t('No matching templates'),
      description: t('Try another keyword.'),
    };
  }
  switch (tab) {
    case TemplateCenterTab.MINE:
      return {
        title: t('You have not generated any template yet'),
        description: t(
          'Open the "···" menu of a published workflow and choose "Generate template" to turn it into a reusable, shareable template.',
        ),
      };
    case TemplateCenterTab.SHARED:
      return {
        title: t('No templates shared with you yet'),
        description: t(
          'Templates your colleagues share inside the organization appear here.',
        ),
      };
    case TemplateCenterTab.RECOMMENDED:
      return {
        title: t('No templates in this category yet'),
        description: null,
      };
  }
}

const TEMPLATE_CENTER_TABS: { value: TemplateCenterTab; label: string }[] = [
  { value: TemplateCenterTab.RECOMMENDED, label: 'Recommended' },
  { value: TemplateCenterTab.MINE, label: 'My templates' },
  { value: TemplateCenterTab.SHARED, label: 'Shared with me' },
];

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

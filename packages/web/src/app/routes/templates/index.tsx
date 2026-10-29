import { isNil } from '@fema-ipaas/core-utils';
import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ConsolePage } from '@/components/custom/console-page';
import { SearchInput } from '@/components/custom/search-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OfficialSolutionsGrid, solutionsHooks } from '@/features/solutions';
import {
  TemplateCard,
  TemplateCenterSort,
  TemplateCenterTab,
  templateCenterUtils,
  TemplateDetailDrawer,
  templatesHooks,
} from '@/features/templates';
import {
  TemplateCenterEmpty,
  TemplateCenterTabs,
  TemplateGrid,
  TemplateGridSkeleton,
} from '@/features/templates/components/template-center-parts';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

const TemplatesPage = () => {
  const [searchParams] = useSearchParams();
  const isAuthenticated = !isNil(authenticationSession.getToken());
  const userId = authenticationSession.getCurrentUserId();
  const [tab, setTab] = useState<TemplateCenterTab>(() =>
    initialTab({ requested: searchParams.get('tab'), isAuthenticated }),
  );
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<TemplateCenterSort>(TemplateCenterSort.HOT);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Template | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isLoading } = templatesHooks.useTemplateCenter({
    primary: true,
  });

  const templates = data ?? [];
  const searching = search.trim() !== '';
  const categories = templateCenterUtils.categoriesOf(
    templates.filter(
      (template) =>
        templateCenterUtils.tabOf({ template, userId }) ===
        TemplateCenterTab.RECOMMENDED,
    ),
  );
  const list = templateCenterUtils.listFor({
    templates,
    userId,
    tab,
    category,
    search,
    sort,
  });
  const featured =
    tab === TemplateCenterTab.RECOMMENDED && !searching && isNil(category)
      ? templateCenterUtils.featuredOf({ templates, userId })
      : [];

  const showSolutions =
    isAuthenticated &&
    tab === TemplateCenterTab.RECOMMENDED &&
    !searching &&
    isNil(category);
  const { data: officialSolutions } = solutionsHooks.useOfficialSolutions({
    enabled: showSolutions,
  });
  const solutionsShown = showSolutions ? officialSolutions ?? [] : [];

  const openTemplate = (template: Template) => {
    setSelected(template);
    setDrawerOpen(true);
  };

  return (
    <ConsolePage
      title={t('Template center')}
      description={t(
        'Start from common integration scenarios, create a workflow in one click, then adjust it to your systems.',
      )}
    >
      <div className="flex flex-col gap-4 pb-8">
        {featured.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featured.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={openTemplate}
                featured={true}
                className="bg-primary/5"
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <TemplateCenterTabs
            value={tab}
            onChange={(next) => {
              setTab(next);
              setCategory(null);
            }}
            counts={templateCenterUtils.countByTab({ templates, userId })}
            showPersonalTabs={isAuthenticated}
          />
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <Select
              value={sort}
              onValueChange={(value) =>
                setSort(
                  value === TemplateCenterSort.NEW
                    ? TemplateCenterSort.NEW
                    : TemplateCenterSort.HOT,
                )
              }
            >
              <SelectTrigger className="w-[110px]" aria-label={t('Sort')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TemplateCenterSort.HOT}>
                  {t('Most used')}
                </SelectItem>
                <SelectItem value={TemplateCenterSort.NEW}>
                  {t('Newest')}
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('Search templates by name or description')}
              />
            </div>
          </div>
        </div>
        {tab === TemplateCenterTab.RECOMMENDED && categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[null, ...categories].map((item) => (
              <button
                key={item ?? ALL_CATEGORIES_KEY}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent',
                  category === item &&
                    'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {item ?? t('All')}
              </button>
            ))}
          </div>
        )}
        {solutionsShown.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold">
                  {t('Official solutions')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t(
                    'A solution is a set of ready-made workflows. Install it into a project and the wizard walks you through connections and settings.',
                  )}
                </span>
              </div>
              <Link
                to="/solutions"
                className="text-xs text-primary hover:underline"
              >
                {t('Solution library')}
              </Link>
            </div>
            <OfficialSolutionsGrid solutions={solutionsShown} />
          </section>
        )}
        {solutionsShown.length > 0 && (
          <h2 className="text-base font-semibold">{t('Workflow templates')}</h2>
        )}
        {isLoading ? (
          <TemplateGridSkeleton />
        ) : list.length === 0 && solutionsShown.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'No workflow templates yet. Open the "···" menu of a published workflow and choose "Generate template" to create one.',
            )}
          </p>
        ) : list.length === 0 ? (
          <TemplateCenterEmpty tab={tab} searching={searching} />
        ) : (
          <TemplateGrid templates={list} onSelect={openTemplate} />
        )}
      </div>
      <TemplateDetailDrawer
        template={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        projectId={null}
      />
    </ConsolePage>
  );
};

function initialTab({
  requested,
  isAuthenticated,
}: {
  requested: string | null;
  isAuthenticated: boolean;
}): TemplateCenterTab {
  const match = Object.values(TemplateCenterTab).find(
    (tab) => tab === requested,
  );
  if (isNil(match) || !isAuthenticated) {
    return TemplateCenterTab.RECOMMENDED;
  }
  return match;
}

const ALL_CATEGORIES_KEY = '__all__';

export { TemplatesPage };

import {
  Template,
  TemplateTelemetryEventType,
  TemplateType,
  UncategorizedFolderId,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/custom/page-header';
import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { templatesTelemetryApi, templatesHooks } from '@/features/templates';
import { workflowHooks } from '@/features/workflows';
import { DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

import { EmptyTemplatesView } from './empty-templates-view';
import { SelectedCategoryView } from './selected-category-view';

const TemplatesPage = () => {
  const navigate = useNavigate();
  const { templates, isLoading, search, setSearch, category } =
    templatesHooks.useTemplates(TemplateType.CUSTOM);
  const selectedCategory = category as string;
  const { mutate: createWorkflow, isPending: isCreateWorkflowPending } =
    workflowHooks.useStartFromScratch(UncategorizedFolderId);

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleTemplateSelect = useCallback(
    (template: Template) => {
      navigate(`/templates/${template.id}`);
      if (template.type === TemplateType.OFFICIAL) {
        templatesTelemetryApi.sendEvent({
          eventType: TemplateTelemetryEventType.VIEW,
          templateId: template.id,
        });
      }
    },
    [navigate],
  );

  const selectedCategoryTemplates = useMemo(() => templates || [], [templates]);

  const hasTemplates = templates && templates.length > 0;

  return (
    <div>
      <div>
        <div className="sticky top-0 z-10 bg-background">
          <PageHeader
            showSidebarToggle={true}
            className="static"
            title={
              <div className="flex flex-row w-full justify-between gap-1">
                <SearchInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder={t('Search templates by name or description')}
                ></SearchInput>
                <div className="flex flex-row justify-end w-[50%]">
                  <Button
                    variant="outline"
                    className="gap-2 h-full"
                    onClick={() => createWorkflow()}
                    disabled={isCreateWorkflowPending}
                  >
                    <Plus className="w-4 h-4" />
                    {t('Start from scratch')}
                  </Button>
                </div>
              </div>
            }
          ></PageHeader>
        </div>
        <div className={DASHBOARD_CONTENT_PADDING_X}>
          {!hasTemplates && !isLoading ? (
            <EmptyTemplatesView />
          ) : (
            <SelectedCategoryView
              category={selectedCategory}
              templates={selectedCategoryTemplates}
              onTemplateSelect={handleTemplateSelect}
              isLoading={isLoading}
              showCategoryTitle={false}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export { TemplatesPage };

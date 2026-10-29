import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OfficialSolutionsGrid, solutionsHooks } from '@/features/solutions';
import {
  TemplateCard,
  TemplateDetailDrawer,
  templatesHooks,
} from '@/features/templates';

import { HOME_TEMPLATE_BATCH_SIZE, homeUtils } from '../utils/home-utils';

import { HomeSection } from './home-section';

export function HomeTemplates({ projectId }: { projectId: string | null }) {
  const { templates, isLoading } = templatesHooks.useRecommendedTemplates();
  const noTemplates = !isLoading && templates.length === 0;
  const { data: solutions, isLoading: solutionsLoading } =
    solutionsHooks.useOfficialSolutions({ enabled: noTemplates });
  if (noTemplates && (solutionsLoading || (solutions ?? []).length > 0)) {
    return (
      <HomeSection
        title={t('Start from an official solution')}
        description={t(
          'A solution is a set of ready-made workflows. Install it into a project and the wizard walks you through connections and settings.',
        )}
        action={
          <Link
            to="/solutions"
            className="text-xs text-primary hover:underline"
          >
            {t('Solution library')}
          </Link>
        }
      >
        {solutionsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: HOME_TEMPLATE_BATCH_SIZE }, (_, index) => (
              <Skeleton key={index} className="h-36 w-full" />
            ))}
          </div>
        ) : (
          <OfficialSolutionsGrid
            solutions={(solutions ?? []).slice(0, HOME_TEMPLATE_BATCH_SIZE)}
          />
        )}
      </HomeSection>
    );
  }
  return (
    <HomeTemplateList
      projectId={projectId}
      templates={templates}
      isLoading={isLoading}
    />
  );
}

function HomeTemplateList({
  projectId,
  templates,
  isLoading,
}: {
  projectId: string | null;
  templates: Template[];
  isLoading: boolean;
}) {
  const [batch, setBatch] = useState(0);
  const [picked, setPicked] = useState<Template | null>(null);
  const shown = homeUtils
    .nextBatch({
      total: templates.length,
      batch,
      size: HOME_TEMPLATE_BATCH_SIZE,
    })
    .map((index) => templates[index]);
  return (
    <HomeSection
      title={t('Start from a template')}
      action={
        <div className="flex items-center gap-2">
          {templates.length > HOME_TEMPLATE_BATCH_SIZE && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setBatch(batch + 1)}
            >
              <RefreshCw className="size-3" />
              {t('Show others')}
            </Button>
          )}
          <Link
            to="/templates"
            className="text-xs text-primary hover:underline"
          >
            {t('Template center')}
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: HOME_TEMPLATE_BATCH_SIZE }, (_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          {t('No recommended templates yet')}
        </span>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={setPicked}
            />
          ))}
        </div>
      )}
      <TemplateDetailDrawer
        template={picked}
        open={picked !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPicked(null);
          }
        }}
        projectId={projectId}
      />
    </HomeSection>
  );
}

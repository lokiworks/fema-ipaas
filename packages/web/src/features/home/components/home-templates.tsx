import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TemplateCard,
  TemplateDetailDrawer,
  templatesHooks,
} from '@/features/templates';

import { HOME_TEMPLATE_BATCH_SIZE, homeUtils } from '../utils/home-utils';

import { HomeSection } from './home-section';

export function HomeTemplates({ projectId }: { projectId: string | null }) {
  const { templates, isLoading } = templatesHooks.useRecommendedTemplates();
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
          <Button
            size="xs"
            variant="ghost"
            disabled={templates.length <= HOME_TEMPLATE_BATCH_SIZE}
            onClick={() => setBatch(batch + 1)}
          >
            <RefreshCw className="size-3" />
            {t('Show others')}
          </Button>
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

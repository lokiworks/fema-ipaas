import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Flame } from 'lucide-react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { TemplateConnectorChain } from './template-connector-chain';

export function TemplateCard({
  template,
  onClick,
  featured = false,
  className,
}: {
  template: Template;
  onClick: (template: Template) => void;
  featured?: boolean;
  className?: string;
}) {
  const description = template.summary || template.description;
  const category = template.categories[0];
  return (
    <button
      type="button"
      onClick={() => onClick(template)}
      className={cn(
        'relative flex h-full w-full min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <TemplateConnectorChain template={template} />
        {featured && <Badge variant="secondary">{t('Featured')}</Badge>}
      </div>
      <TextWithTooltip tooltipMessage={template.name}>
        <p className="truncate text-sm font-medium">{template.name}</p>
      </TextWithTooltip>
      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {description || t('No description')}
      </p>
      {(category || template.usageCount !== undefined) && (
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{category}</span>
          {template.usageCount !== undefined && (
            <span className="flex shrink-0 items-center gap-1">
              <Flame className="size-3" aria-hidden="true" />
              {formatUtils.formatNumber(template.usageCount)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

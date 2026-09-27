import { t } from 'i18next';
import { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ViewOnlyTooltip({
  canWrite,
  children,
}: {
  canWrite: boolean;
  children: ReactNode;
}) {
  if (canWrite) {
    return <>{children}</>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t('dataStoreViewOnly')}</TooltipContent>
    </Tooltip>
  );
}

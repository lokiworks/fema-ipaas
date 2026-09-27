import { isNil } from '@fema-ipaas/core-utils';
import { ReactElement } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function DisabledReason({
  reason,
  children,
}: {
  reason: string | null;
  children: ReactElement;
}) {
  if (isNil(reason)) {
    return children;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

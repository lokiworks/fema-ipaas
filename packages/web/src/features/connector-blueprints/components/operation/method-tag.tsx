import { BlueprintHttpMethod } from '@fema-ipaas/shared';

import { cn } from '@/lib/utils';

export function MethodTag({
  method,
  className,
}: {
  method: BlueprintHttpMethod;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded bg-muted px-1 font-mono text-[10px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {method}
    </span>
  );
}

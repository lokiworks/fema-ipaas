import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function CharacterCounter({
  length,
  max,
  multiline = false,
  children,
}: {
  length: number;
  max: number;
  multiline?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative',
        multiline ? '[&>textarea]:pb-7' : '[&>input]:pr-16',
      )}
    >
      {children}
      <span
        className={cn(
          'pointer-events-none absolute right-3 text-xs text-muted-foreground',
          multiline ? 'bottom-2' : 'top-1/2 -translate-y-1/2',
        )}
      >
        {length}/{max}
      </span>
    </div>
  );
}

import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { cn } from '@/lib/utils';

export function ListEmptyState({
  icon: Icon,
  title,
  description,
  className,
  align = 'start',
  testId,
  children,
}: ListEmptyStateProps) {
  const start = align === 'start';
  return (
    <Empty
      className={cn(
        'rounded-lg border py-10',
        start &&
          'items-start justify-start px-6 py-6 text-left md:px-6 md:py-6',
        className,
      )}
      data-testid={testId}
    >
      <EmptyHeader className={cn(start && 'max-w-xl items-start text-left')}>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className={cn(start && 'text-base')}>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && (
        <EmptyContent className={cn(start && 'items-start')}>
          {children}
        </EmptyContent>
      )}
    </Empty>
  );
}

export type ListEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  align?: 'center' | 'start';
  testId?: string;
  children?: ReactNode;
};

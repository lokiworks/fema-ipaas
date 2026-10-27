import { LucideIcon } from 'lucide-react';

import {
  Empty,
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
}: ListEmptyStateProps) {
  return (
    <Empty className={cn('rounded-lg border py-10', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

export type ListEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
};

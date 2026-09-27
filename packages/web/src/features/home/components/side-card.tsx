import { ChevronRight, LucideIcon } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function SideCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function SideRow({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  to,
  external = false,
  onClick,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  to?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0 text-muted-foreground',
          iconClassName,
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TextWithTooltip tooltipMessage={title}>
          <div className="truncate text-sm">{title}</div>
        </TextWithTooltip>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    </>
  );
  const className =
    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted';
  if (to && external) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

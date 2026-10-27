import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function ConsolePage({
  title,
  description,
  actions,
  children,
  className,
}: ConsolePageProps) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-4 px-4 py-5 md:px-6',
        className,
      )}
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

export function ConsoleTableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(TABLE_ALIGN_CLASSES, className)}>{children}</div>;
}

const TABLE_ALIGN_CLASSES =
  '[&>div>div.py-3]:px-0 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4';

type ConsolePageProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

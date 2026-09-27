import React from 'react';

export function HomeSection({
  title,
  description,
  action,
  tourTarget,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  tourTarget?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" data-tour={tourTarget}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

import { FlowComponentCategory } from '@fema-ipaas/component-sdk';
import { t } from 'i18next';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { componentLogoUrl, componentsHooks } from '@/features/components';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';

const CATEGORY_TITLES: Record<FlowComponentCategory, () => string> = {
  [FlowComponentCategory.CONTROL]: () => t('Control'),
  [FlowComponentCategory.DATA]: () => t('Data'),
  [FlowComponentCategory.RUNTIME]: () => t('Runtime'),
  [FlowComponentCategory.HUMAN]: () => t('Human'),
};

const PALETTE_CONNECTOR_LIMIT = 40;

export function NodePalette() {
  const [collapsed, setCollapsed] = useState(true);
  const [search, setSearch] = useState('');
  const { data: components, isLoading: isLoadingComponents } =
    componentsHooks.useComponents();
  const { connectors, isLoading: isLoadingConnectors } =
    connectorsHooks.useConnectors({ searchQuery: search });

  const matchingComponents = useMemo(
    () =>
      (components ?? []).filter((component) =>
        matches(search, component.displayName, component.description),
      ),
    [components, search],
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-r bg-background py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          aria-label={t('Show node palette')}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-background">
      <div className="flex items-center gap-1 border-b p-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search')}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          aria-label={t('Hide node palette')}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <PaletteSection title={t('Core Components')}>
          {isLoadingComponents ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            Object.values(FlowComponentCategory)
              .filter((category) =>
                matchingComponents.some(
                  (component) => component.category === category,
                ),
              )
              .map((category) => (
                <div key={category} className="mb-2">
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_TITLES[category]()}
                  </div>
                  {matchingComponents
                    .filter((component) => component.category === category)
                    .map((component) => (
                      <PaletteItem
                        key={component.type}
                        logoUrl={componentLogoUrl(component.icon)}
                        displayName={component.displayName}
                      />
                    ))}
                </div>
              ))
          )}
        </PaletteSection>

        <PaletteSection title={t('Connectors')}>
          {isLoadingConnectors ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            (connectors ?? [])
              .slice(0, PALETTE_CONNECTOR_LIMIT)
              .map((connector) => (
                <PaletteItem
                  key={connector.name}
                  logoUrl={connector.logoUrl}
                  displayName={connector.displayName}
                />
              ))
          )}
        </PaletteSection>
      </div>

      <div className="border-t p-2 text-[10px] text-muted-foreground">
        {t('Click + on the canvas to add a node.')}
      </div>
    </div>
  );
}

function PaletteSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="px-1 pb-1 text-xs font-medium">{title}</div>
      {children}
    </div>
  );
}

function PaletteItem({
  logoUrl,
  displayName,
}: {
  logoUrl: string;
  displayName: string;
}) {
  return (
    <div
      className="flex cursor-default items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted"
      title={displayName}
    >
      <ConnectorIcon
        logoUrl={logoUrl}
        displayName={displayName}
        showTooltip={false}
        size="sm"
      />
      <span className="truncate">{displayName}</span>
    </div>
  );
}

function matches(search: string, ...values: string[]): boolean {
  if (search.trim().length === 0) {
    return true;
  }
  const needle = search.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}

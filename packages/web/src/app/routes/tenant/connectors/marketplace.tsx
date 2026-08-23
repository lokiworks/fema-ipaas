import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { ConnectorSource } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';

const SOURCE_LABELS: Record<string, () => string> = {
  [ConnectorSource.BUILT_IN]: () => t('Built-in'),
  [ConnectorSource.OFFICIAL]: () => t('Official'),
  [ConnectorSource.COMMUNITY]: () => t('Community'),
  [ConnectorSource.PRIVATE]: () => t('Private'),
};

export default function ConnectorMarketplacePage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const { connectors, isLoading } = connectorsHooks.useConnectors({
    searchQuery: debouncedSearch,
    includeHidden: true,
    isTableQuery: true,
    skipWorkspaceFilter: true,
  });

  const grouped = useMemo(() => groupBySource(connectors ?? []), [connectors]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Connector Marketplace')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Every connector available on this instance, grouped by where it came from.',
          )}
        </p>
      </div>

      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search connectors')}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([source, entries]) => (
          <div key={source} className="flex flex-col gap-2">
            <div className="text-sm font-medium text-muted-foreground">
              {(SOURCE_LABELS[source] ?? (() => source))()} · {entries.length}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((connector) => (
                <Card
                  key={`${connector.name}@${connector.version}`}
                  className="flex items-start gap-3 p-3"
                >
                  <ConnectorIcon
                    logoUrl={connector.logoUrl}
                    displayName={connector.displayName}
                    showTooltip={false}
                    size="md"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {connector.displayName}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {connector.version}
                      </Badge>
                    </div>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {connector.description}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function groupBySource(
  connectors: ConnectorMetadataModelSummary[],
): Record<string, ConnectorMetadataModelSummary[]> {
  const order = [
    ConnectorSource.BUILT_IN,
    ConnectorSource.OFFICIAL,
    ConnectorSource.COMMUNITY,
    ConnectorSource.PRIVATE,
  ];
  const grouped: Record<string, ConnectorMetadataModelSummary[]> = {};
  for (const source of order) {
    const entries = connectors.filter(
      (connector) => connector.source === source,
    );
    if (entries.length > 0) {
      grouped[source] = entries;
    }
  }
  return grouped;
}

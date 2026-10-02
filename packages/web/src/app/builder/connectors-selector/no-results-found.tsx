import { t } from 'i18next';
import {
  ChevronRight,
  Globe,
  LucideIcon,
  MessageSquarePlusIcon,
  SearchXIcon,
  Server,
  SquareCode,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useEmbedding } from '@/components/providers/embed-provider';
import { ConnectorRequestDialog } from '@/features/connector-demands';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';

const NoResultsFound = () => {
  const navigate = useNavigate();
  const isEmbedding = useEmbedding().embedState.isEmbedded;
  const isTenantAdmin = useIsTenantAdmin();
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchXIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-foreground">
          {t('No results found')}
        </div>
        <div className="text-xs text-muted-foreground">
          {t(
            'There is no ready-made connector for it yet. You can still connect it in one of these ways:',
          )}
        </div>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2 text-left">
        <GuideRow
          icon={Globe}
          title={t('Call its API with the HTTP connector')}
          description={t(
            'Search for "HTTP" and add the HTTP request step with the API address and credentials',
          )}
        />
        {isTenantAdmin && !isEmbedding && (
          <GuideRow
            icon={Server}
            title={t('It has an MCP server: connect the MCP server')}
            description={t('Its tools then show up under Apps')}
            onClick={() => navigate('/tenant/connectors?cat=mcp')}
          />
        )}
        {isTenantAdmin && !isEmbedding && (
          <GuideRow
            icon={SquareCode}
            title={t('Build the connector yourself')}
            description={t(
              'Import an OpenAPI document and publish it for your organization',
            )}
            onClick={() => navigate('/tenant/connectors/builder')}
          />
        )}
        {!isEmbedding && (
          <GuideRow
            icon={MessageSquarePlusIcon}
            title={t('Ask the administrator for a connector')}
            description={t(
              'Apps many teams need are built as official connectors',
            )}
            onClick={() => setRequestOpen(true)}
          />
        )}
      </div>
      <ConnectorRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
      />
    </div>
  );
};

function GuideRow({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      {onClick && <ChevronRight className="size-4 text-muted-foreground" />}
    </>
  );
  if (!onClick) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-2.5">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/60 hover:bg-muted/40"
    >
      {content}
    </button>
  );
}

export { NoResultsFound };

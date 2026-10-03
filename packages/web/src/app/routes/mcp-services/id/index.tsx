import { McpService, McpServiceIssue } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ResourceNotFound } from '@/components/custom/resource-not-found';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  McpAvailabilityTab,
  McpConnectionsTab,
  McpDebugDrawer,
  McpPublishDialog,
  McpReleasesTab,
  McpServiceDetailHeader,
  McpToolsTab,
  McpUsageTab,
  mcpServiceUiUtils,
  mcpServicesHooks,
} from '@/features/mcp-services';
import { authenticationSession } from '@/lib/authentication-session';
import { notFoundError } from '@/lib/not-found-error';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

type TabValue = 'tools' | 'connections' | 'usage' | 'availability' | 'releases';

function McpServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const {
    data: service,
    isLoading,
    error,
  } = mcpServicesHooks.useService(serviceId ?? '');

  if (notFoundError.isNotFound(error)) {
    return <ResourceNotFound kind="mcpService" />;
  }

  if (isLoading || !service) {
    return (
      <div
        className={cn(
          'flex flex-col gap-4 w-full max-w-5xl py-4',
          DASHBOARD_CONTENT_PADDING_X,
        )}
      >
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return <McpServiceDetail key={service.id} service={service} />;
}

function McpServiceDetail({ service }: { service: McpService }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabValue>('tools');
  const [initialWizardConnector] = useState(() => {
    const newTool = searchParams.get('newTool');
    const connectorName = searchParams.get('connector');
    const actionName = searchParams.get('action');
    if (newTool === 'connector' && connectorName && actionName) {
      return { connectorName, actionName };
    }
    return null;
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!initialWizardConnector) {
      return;
    }
    setTab('tools');
    searchParams.delete('newTool');
    searchParams.delete('connector');
    searchParams.delete('action');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: issuesData } = mcpServicesHooks.useIssues({
    id: service.id,
    enabled: service.canEdit,
  });
  const issues = issuesData?.issues ?? [];

  const handleIssuePick = (issue: McpServiceIssue) => {
    const target = mcpServiceUiUtils.issueTargetTab(issue);
    if (target) {
      setTab(target);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 w-full max-w-5xl py-4',
        DASHBOARD_CONTENT_PADDING_X,
      )}
    >
      <Link
        to={authenticationSession.appendProjectRoutePrefix('/mcp-services')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('MCP services')}
      </Link>
      <McpServiceDetailHeader
        service={service}
        issues={issues}
        canPublish={issuesData?.canPublish ?? false}
        onDebug={() => setDebugOpen(true)}
        onPublish={() => setPublishOpen(true)}
        onIssuePick={handleIssuePick}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList>
          <TabsTrigger value="tools">
            {t('Tools ({count})', { count: service.tools.length })}
          </TabsTrigger>
          <TabsTrigger value="connections">{t('Connections')}</TabsTrigger>
          <TabsTrigger value="usage">{t('Usage')}</TabsTrigger>
          <TabsTrigger value="availability">{t('Availability')}</TabsTrigger>
          <TabsTrigger value="releases">
            {t('Releases ({count})', { count: service.releases.length })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tools" className="pt-3">
          <McpToolsTab
            key={initialWizardConnector ? 'deep-link' : 'default'}
            service={service}
            canEdit={service.canEdit}
            initialWizard={
              initialWizardConnector && service.canEdit
                ? { mode: 'CONNECTOR', ...initialWizardConnector }
                : null
            }
          />
        </TabsContent>
        <TabsContent value="connections" className="pt-3">
          <McpConnectionsTab
            service={service}
            canEdit={service.canEdit}
            issues={issues}
          />
        </TabsContent>
        <TabsContent value="usage" className="pt-3">
          <McpUsageTab service={service} canEdit={service.canEdit} />
        </TabsContent>
        <TabsContent value="availability" className="pt-3">
          <McpAvailabilityTab service={service} canEdit={service.canEdit} />
        </TabsContent>
        <TabsContent value="releases" className="pt-3">
          <McpReleasesTab service={service} canEdit={service.canEdit} />
        </TabsContent>
      </Tabs>
      {service.canEdit && issuesData && (
        <McpPublishDialog
          service={service}
          issues={issues}
          nextVersion={issuesData.nextVersion}
          canPublish={issuesData.canPublish}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          onIssuePick={(issue) => {
            setPublishOpen(false);
            handleIssuePick(issue);
          }}
        />
      )}
      {service.canEdit && (
        <McpDebugDrawer
          service={service}
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
        />
      )}
    </div>
  );
}

export { McpServiceDetailPage };

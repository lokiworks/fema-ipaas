import { t } from 'i18next';
import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { workersQueries } from '@/features/platform-admin';
import { workspaceCollectionUtils } from '@/features/workspaces/stores/workspace-collection';
import { platformHooks } from '@/hooks/platform-hooks';

import { ByGroupView } from './by-group-view';
import { ByWorkspaceView } from './by-workspace-view';

export function WorkerAssignmentsTab() {
  const { platform } = platformHooks.useCurrentPlatform();
  const { data: workspaces } =
    workspaceCollectionUtils.useAllPlatformWorkspaces();
  const { data: capacity } = workersQueries.useWorkerGroups(
    platform.plan.workerGroupsEnabled,
  );
  const { data: workersData } = workersQueries.useWorkerMachines();

  const workerGroups = capacity?.groups ?? [];
  const sharedSlots = capacity?.sharedSlots ?? 0;
  const workers = workersData ?? [];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Alert variant="primary">
        <Info className="size-4" />
        <AlertDescription className="text-sm">
          {t(
            'Worker groups reserve a dedicated queue for the workspaces you assign. Defined in your deployment with FEMA_WORKER_GROUP_ID.',
          )}{' '}
          <a
            href="https://github.com/lokiworks/fema-ipaas/docs/install/configure-operate/worker-groups"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {t('Learn more')}
          </a>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="by-workspace" className="w-full">
        <TabsList variant="default">
          <TabsTrigger variant="default" value="by-workspace">
            {t('By workspace')}
          </TabsTrigger>
          <TabsTrigger variant="default" value="by-group">
            {t('By group')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-workspace">
          <ByWorkspaceView
            workerGroups={workerGroups}
            sharedSlots={sharedSlots}
          />
        </TabsContent>

        <TabsContent value="by-group">
          <ByGroupView
            workspaces={workspaces}
            workerGroups={workerGroups}
            workers={workers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

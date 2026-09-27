import { isNil } from '@fema-ipaas/core-utils';
import { PopulatedWorkflow } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { t } from 'i18next';
import { FileX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { BuilderPage } from '@/app/builder';
import { BuilderSnapshotProvider } from '@/app/builder/snapshot-context';
import { BuilderStateProvider } from '@/app/builder/state/builder-state-provider';
import { LoadingSpinner } from '@/components/custom/spinner';
import { buttonVariants } from '@/components/ui/button';
import { workflowsApi, sampleDataHooks } from '@/features/workflows';
import { authenticationSession } from '@/lib/authentication-session';
import { recentVisits } from '@/lib/recent-visits';
import { cn } from '@/lib/utils';

const WorkflowBuilderPage = () => {
  const { workflowId, versionId } = useParams();
  const snapshotVersionId = versionId ?? null;

  const {
    data: workflow,
    isLoading,
    isError,
  } = useQuery<PopulatedWorkflow, Error>({
    queryKey: [
      'workflow',
      workflowId,
      authenticationSession.getProjectId(),
      snapshotVersionId,
    ],
    queryFn: async () => {
      const loaded = await workflowsApi.get(
        workflowId!,
        snapshotVersionId ? { versionId: snapshotVersionId } : undefined,
      );
      recentVisits.record({
        type: 'workflow',
        id: loaded.id,
        projectId: loaded.projectId,
        name: loaded.version.displayName,
      });
      return loaded;
    },
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: sampleData, isLoading: isSampleDataLoading } =
    sampleDataHooks.useSampleDataForWorkflow(
      workflow?.version,
      workflow?.projectId,
    );

  const { data: sampleDataInput, isLoading: isSampleDataInputLoading } =
    sampleDataHooks.useSampleDataInputForWorkflow(
      workflow?.version,
      workflow?.projectId,
    );
  if (isLoading || isSampleDataLoading || isSampleDataInputLoading) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center ">
        <LoadingSpinner isLarge={true}></LoadingSpinner>
      </div>
    );
  }

  if (isNil(workflow) || isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <div className="rounded-full bg-muted p-4">
          <FileX className="size-9 text-muted-foreground" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">{t('Workflow not found')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "The workflow you are looking for doesn't exist or was removed.",
            )}
          </p>
        </div>

        <Link
          className={cn(buttonVariants({ variant: 'outline' }))}
          to="/dashboard"
        >
          {t('Go to Dashboard')}
        </Link>
      </div>
    );
  }

  return (
    <ReactFlowProvider key={snapshotVersionId ?? 'current'}>
      <BuilderSnapshotProvider versionId={snapshotVersionId}>
        <BuilderStateProvider
          workflow={workflow}
          workflowVersion={workflow!.version}
          readonly={!!snapshotVersionId}
          hideTestWidget={false}
          run={null}
          outputSampleData={sampleData ?? {}}
          inputSampleData={sampleDataInput ?? {}}
        >
          <BuilderPage />
        </BuilderStateProvider>
      </BuilderSnapshotProvider>
    </ReactFlowProvider>
  );
};

export { WorkflowBuilderPage };

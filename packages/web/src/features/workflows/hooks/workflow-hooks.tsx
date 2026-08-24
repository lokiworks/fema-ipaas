import {
  ApplicationErrorParams,
  isNil,
  ErrorCode,
  SeekPage,
} from '@fema-ipaas/core-utils';
import {
  FlagId,
  WorkflowOperationType,
  WorkflowStatus,
  WorkflowVersion,
  WorkflowVersionMetadata,
  WorkflowVersionTemplate,
  ListWorkflowsRequest,
  PopulatedWorkflow,
  WorkflowTrigger,
  WorkflowTriggerType,
  Template,
  TelemetryEventName,
  UncategorizedFolderId,
  UpdateRunProgressRequest,
} from '@fema-ipaas/shared';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useApErrorDialogStore } from '@/components/custom/error-dialog/error-dialog-store';
import { useSocket } from '@/components/providers/socket-provider';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { internalErrorToast } from '@/components/ui/sonner';
import { connectorsApi } from '@/features/connectors/api/connectors-api';
import { connectorSelectorUtils } from '@/features/connectors/utils/connector-selector-utils';
import { stepUtils } from '@/features/connectors/utils/step-utils';
import { executionsApi } from '@/features/executions/api/executions-api';
import { foldersApi } from '@/features/folders/api/folders-api';
import { templatesApi } from '@/features/templates/api/templates-api';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { downloadFile } from '@/lib/dom-utils';
import { NEW_WORKFLOW_QUERY_PARAM } from '@/lib/route-utils';

import { workflowsApi } from '../api/workflows-api';
import { workflowsUtils } from '../utils/workflows-utils';

const createWorkflowsQueryKey = (workspaceId: string) => [
  'workflows',
  workspaceId,
];
export const workflowHooks = {
  invalidateWorkflowsQuery: (queryClient: QueryClient) => {
    queryClient.invalidateQueries({
      queryKey: createWorkflowsQueryKey(
        authenticationSession.getWorkspaceId()!,
      ),
    });
  },
  useWorkflows: (request: Omit<ListWorkflowsRequest, 'workspaceId'>) => {
    return useQuery({
      queryKey: createWorkflowsQueryKey(
        authenticationSession.getWorkspaceId()!,
      ),
      queryFn: async () => {
        return await workflowsApi.list({
          ...request,
          workspaceId: authenticationSession.getWorkspaceId()!,
        });
      },
      staleTime: 5 * 1000,
    });
  },
  useChangeWorkflowStatus: ({
    workflowId,
    change,
    onSuccess,
    setIsPublishing,
  }: UseChangeWorkflowStatusParams) => {
    const { data: enableWorkflowOnPublish } = flagsHooks.useFlag<boolean>(
      FlagId.ENABLE_WORKFLOW_ON_PUBLISH,
    );
    const { data: triggerTimeout } = flagsHooks.useFlag<number>(
      FlagId.TRIGGER_TIMEOUT_SECONDS,
    );
    const { openDialog } = useApErrorDialogStore();
    const { capture } = useTelemetry();
    return useMutation({
      mutationFn: async () => {
        if (change === 'publish') {
          setIsPublishing?.(true);
        }
        return workflowsApi.update(workflowId, {
          type:
            change === 'publish'
              ? WorkflowOperationType.LOCK_AND_PUBLISH
              : WorkflowOperationType.CHANGE_STATUS,
          request: {
            status:
              change === 'publish'
                ? enableWorkflowOnPublish
                  ? WorkflowStatus.ENABLED
                  : WorkflowStatus.DISABLED
                : change,
          },
        });
      },
      onSuccess: (workflow: PopulatedWorkflow) => {
        if (change === 'publish') {
          setIsPublishing?.(false);
          capture({
            name: TelemetryEventName.WORKFLOW_PUBLISHED,
            payload: { workflowId: workflow.id },
          });
        }
        onSuccess?.(workflow);
      },
      onError: (error: unknown) => {
        if (change === 'publish') {
          setIsPublishing?.(false);
        }
        if (!api.isError(error)) {
          internalErrorToast();
          return;
        }
        if (
          !error.response ||
          error.response.status === api.httpStatus.GatewayTimeout
        ) {
          toast.error(t('Request Timed Out'), {
            description: t(
              'The operation exceeded the {timeout} second timeout. Please refresh and try again.',
              { timeout: triggerTimeout ?? 60 },
            ),
            duration: 5000,
          });
          return;
        }
        const applicationError = error.response.data as ApplicationErrorParams;
        if (applicationError.code === ErrorCode.TRIGGER_UPDATE_STATUS) {
          const params = applicationError.params as Record<string, string>;
          openDialog({
            title:
              change === 'publish'
                ? t('Publish failed')
                : t('Status update failed'),
            description: (
              <p>
                {t(
                  'An error occurred while changing the workflow status. This may be due to an issue in the trigger connector or its settings.',
                )}
              </p>
            ),
            error: {
              standardError: params.standardError || '',
              standardOutput: params.standardOutput || '',
            },
          });
        } else if (applicationError.code === ErrorCode.QUOTA_EXCEEDED) {
          toast.error(t('Active workflows limit reached'), {
            description: t(
              'You have reached the maximum number of active workflows. Disable another workflow or increase the limit.',
            ),
            duration: 5000,
          });
        } else {
          internalErrorToast();
        }
      },
    });
  },
  useExportWorkflows: () => {
    return useMutation({
      mutationFn: async (workflows: PopulatedWorkflow[]) => {
        if (workflows.length === 0) {
          return workflows;
        }
        if (workflows.length === 1) {
          await workflowsUtils.downloadWorkflow(workflows[0].id);
          return workflows;
        }
        await downloadFile({
          obj: await workflowsUtils.zipWorkflows(workflows),
          fileName: 'workflows',
          extension: 'zip',
        });
        return workflows;
      },
      onSuccess: (res) => {
        if (res.length > 0) {
          toast.success(
            res.length === 1
              ? t(`${res[0].version.displayName} has been exported.`)
              : t('Workflows have been exported.'),
            {
              duration: 3000,
            },
          );
        }
      },
      onError: () => {
        toast.error(t('Failed to export workflows'));
      },
    });
  },

  useFetchWorkflowVersion: ({
    onSuccess,
  }: {
    onSuccess: (workflowVersion: WorkflowVersion) => void;
  }) => {
    return useMutation<WorkflowVersion, Error, WorkflowVersionMetadata>({
      mutationFn: async (workflowVersion) => {
        const result = await workflowsApi.get(workflowVersion.workflowId, {
          versionId: workflowVersion.id,
        });
        return result.version;
      },
      onSuccess,
    });
  },
  useOverWriteDraftWithVersion: ({
    onSuccess,
  }: {
    onSuccess: (workflow: PopulatedWorkflow) => void;
  }) => {
    return useMutation<
      PopulatedWorkflow,
      Error,
      { workflowId: string; versionId: string }
    >({
      mutationFn: async ({ workflowId, versionId }) => {
        const result = await workflowsApi.update(workflowId, {
          type: WorkflowOperationType.USE_AS_DRAFT,
          request: {
            versionId,
          },
        });
        return result;
      },
      onSuccess,
    });
  },
  useCreateMcpWorkflow: () => {
    const navigate = useNavigate();
    return useMutation({
      mutationFn: async () => {
        const workflow = await workflowsApi.create({
          workspaceId: authenticationSession.getWorkspaceId()!,
          displayName: t('Untitled'),
        });
        const mcpConnector = await connectorsApi.get({
          name: '@fema-ipaas/connector-mcp',
        });
        const trigger = mcpConnector.triggers['mcp_tool'];
        if (!trigger) {
          throw new Error('MCP trigger not found');
        }
        const stepData = connectorSelectorUtils.getDefaultStepValues({
          stepName: 'trigger',
          connectorSelectorItem: {
            actionOrTrigger: trigger,
            type: WorkflowTriggerType.CONNECTOR,
            connectorMetadata: stepUtils.mapConnectorToMetadata({
              connector: mcpConnector,
              type: 'trigger',
            }),
          },
        }) as WorkflowTrigger;
        await workflowsApi.update(workflow.id, {
          type: WorkflowOperationType.UPDATE_TRIGGER,
          request: stepData,
        });
        return workflow;
      },
      onSuccess: (workflow) => {
        navigate(`/workflows/${workflow.id}/`);
      },
    });
  },
  useGetWorkflow: ({
    workflowId,
    versionId,
    enabled = true,
  }: {
    workflowId: string;
    versionId?: string;
    enabled?: boolean;
  }) => {
    return useQuery({
      queryKey: workflowHooks.createWorkflowQueryKeys({
        workflowId,
        versionId,
      }),
      queryFn: async () => {
        try {
          return await workflowsApi.get(
            workflowId,
            versionId ? { versionId } : undefined,
          );
        } catch (err) {
          console.error(err);
          return null;
        }
      },
      enabled: enabled && !!workflowId,
      staleTime: 0,
    });
  },
  useUpdateWorkflowOwner: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation<
      PopulatedWorkflow,
      Error,
      { workflowId: string; ownerId: string }
    >({
      mutationFn: async ({ workflowId, ownerId }) => {
        return await workflowsApi.update(workflowId, {
          type: WorkflowOperationType.UPDATE_OWNER,
          request: { ownerId },
        });
      },
      onSuccess,
    });
  },
  useCreateTemplateFromWorkflow: ({
    onSuccess,
  }: {
    onSuccess: (template: Template) => void;
  }) => {
    return useMutation<
      Template,
      Error,
      {
        workflowId: string;
        workflowVersionId: string;
        description: string;
        author: string;
      }
    >({
      mutationFn: async ({
        workflowId,
        workflowVersionId,
        description,
        author,
      }) => {
        const template = await workflowsApi.getTemplate(workflowId, {
          versionId: workflowVersionId,
        });
        const workflowTemplate = await templatesApi.create({
          name: template.name,
          description,
          summary: template.summary,
          tags: template.tags,
          blogUrl: template.blogUrl ?? undefined,
          metadata: template.metadata,
          author,
          categories: template.categories,
          type: template.type,
          workflows: template.workflows,
        });
        return workflowTemplate;
      },
      onSuccess,
    });
  },
  useTestWorkflowOrStartManualTrigger: ({
    workflowVersionId,
    onUpdateRun,
    isForManualTrigger,
  }: {
    workflowVersionId: string;
    onUpdateRun: (stepResponse: UpdateRunProgressRequest) => void;
    isForManualTrigger: boolean;
  }) => {
    const socket = useSocket();
    return useMutation<void>({
      mutationFn: () =>
        executionsApi.subscribeToTestWorkflowOrManualRun(
          socket,
          {
            workflowVersionId,
          },
          onUpdateRun,
          isForManualTrigger,
        ),
    });
  },

  useListWorkflowVersions: (workflowId: string) => {
    return useQuery<SeekPage<WorkflowVersionMetadata>, Error>({
      queryKey: ['workflow-versions', workflowId],
      queryFn: () =>
        workflowsApi.listVersions(workflowId, {
          limit: 1000,
          cursor: undefined,
        }),
      staleTime: 0,
    });
  },
  useGetWorkflowVersionNumber: ({
    workflowId,
    versionId,
  }: {
    workflowId: string;
    versionId: string;
  }) => {
    const { data: workflowVersions } =
      workflowHooks.useListWorkflowVersions(workflowId);
    return workflowVersions?.data
      ? workflowVersions.data.length -
          workflowVersions.data.findIndex((version) => version.id === versionId)
      : '';
  },
  useStartFromScratch: (folderId: string) => {
    const navigate = useNavigate();
    return useMutation<PopulatedWorkflow, Error, void>({
      mutationFn: async () => {
        const folder =
          folderId !== UncategorizedFolderId
            ? await foldersApi.get(folderId)
            : undefined;
        const workflow = await workflowsApi.create({
          workspaceId: authenticationSession.getWorkspaceId()!,
          displayName: t('Untitled'),
          folderName: folder?.displayName,
        });
        return workflow;
      },
      onSuccess: (workflow) => {
        navigate(`/workflows/${workflow.id}?${NEW_WORKFLOW_QUERY_PARAM}=true`);
      },
    });
  },
  importWorkflowIntoExisting: async ({
    template,
    existingWorkflowId,
  }: {
    template: Template;
    existingWorkflowId: string;
  }): Promise<PopulatedWorkflow> => {
    const workflows = template.workflows || [];
    if (workflows.length === 0) {
      throw new Error('Template has no workflows');
    }

    const templateWorkflow = workflows[0];
    const workflow = await workflowsApi.get(existingWorkflowId);

    const oldExternalId = !isNil(template.metadata?.externalId)
      ? (template.metadata['externalId'] as string)
      : workflow.externalId;

    const triggerString = JSON.stringify(templateWorkflow.trigger).replaceAll(
      oldExternalId,
      workflow.externalId,
    );
    const updatedTrigger = JSON.parse(triggerString);

    return await workflowsApi.update(workflow.id, {
      type: WorkflowOperationType.IMPORT_WORKFLOW,
      request: {
        displayName: workflow.version.displayName,
        trigger: updatedTrigger,
        schemaVersion: templateWorkflow.schemaVersion,
        notes: templateWorkflow.notes,
      },
    });
  },
  importWorkflowsFromTemplates: async ({
    templates,
    workspaceId,
    folderName,
  }: {
    templates: Template[];
    workspaceId: string;
    folderName?: string;
  }): Promise<PopulatedWorkflow[]> => {
    if (templates.length === 0) {
      return [];
    }

    const allWorkflowsToImport: Array<{
      workflow: PopulatedWorkflow;
      templateWorkflow: WorkflowVersionTemplate;
      oldExternalId: string;
    }> = [];

    for (const template of templates) {
      const workflows = template.workflows || [];
      if (workflows.length === 0) {
        continue;
      }

      for (const templateWorkflow of workflows) {
        const workflow = await workflowsApi.create({
          displayName: templateWorkflow.displayName,
          templateId: template.id,
          workspaceId,
          folderName,
        });

        const oldExternalId = !isNil(template.metadata?.externalId)
          ? (template.metadata['externalId'] as string)
          : workflow.externalId;

        allWorkflowsToImport.push({
          workflow,
          templateWorkflow,
          oldExternalId,
        });
      }
    }

    const externalIdMap = new Map<string, string>();
    for (const { oldExternalId, workflow } of allWorkflowsToImport) {
      externalIdMap.set(oldExternalId, workflow.externalId);
    }

    const importPromises = allWorkflowsToImport.map(
      async ({ workflow, templateWorkflow }) => {
        let triggerString = JSON.stringify(templateWorkflow.trigger);

        for (const [oldId, newId] of externalIdMap.entries()) {
          triggerString = triggerString.replaceAll(oldId, newId);
        }

        const updatedTrigger = JSON.parse(triggerString);

        return await workflowsApi.update(workflow.id, {
          type: WorkflowOperationType.IMPORT_WORKFLOW,
          request: {
            displayName: templateWorkflow.displayName,
            trigger: updatedTrigger,
            schemaVersion: templateWorkflow.schemaVersion,
            notes: templateWorkflow.notes,
          },
        });
      },
    );

    return await Promise.all(importPromises);
  },
  useFetchNpmPackageVersion: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (result: {
      packageName: string;
      packageVersion: string;
    }) => void;
    onError: () => void;
  }) => {
    return useMutation({
      mutationFn: async (packageName: string) => {
        const response = await api.get<{ 'dist-tags': { latest: string } }>(
          `https://registry.npmjs.org/${packageName}`,
        );
        return {
          packageName,
          packageVersion: response['dist-tags'].latest,
        };
      },
      onSuccess,
      onError,
    });
  },
  createWorkflowQueryKeys: ({
    workflowId,
    versionId,
  }: {
    workflowId: string;
    versionId: string | undefined;
  }) => ['workflow', workflowId, versionId],
};

type UseChangeWorkflowStatusParams = {
  workflowId: string;
  change: 'publish' | WorkflowStatus;
  onSuccess: (workflow: PopulatedWorkflow) => void;
  setIsPublishing?: (isPublishing: boolean) => void;
};

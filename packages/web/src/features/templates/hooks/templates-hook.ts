import { isNil, tryCatch } from '@fema-ipaas/core-utils';
import {
  GenerateTemplateFromWorkflowRequestBody,
  PopulatedWorkflow,
  Template,
  TemplateTelemetryEventType,
  TemplateType,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';

import { foldersApi } from '@/features/folders';
import { workflowHooks } from '@/features/workflows';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { templatesApi } from '../api/templates-api';
import { templatesTelemetryApi } from '../api/templates-telemetry-api';
import {
  TemplateCenterSort,
  TemplateCenterTab,
  templateCenterUtils,
} from '../utils/template-center-utils';

export const templatesHooks = {
  useTemplateCategories: () => {
    return useQuery<string[], Error>({
      queryKey: ['template', 'categories'],
      queryFn: async () => {
        const result = await templatesApi.getCategories();
        return (result?.value ?? []) as string[];
      },
      staleTime: 5 * 60 * 1000,
    });
  },

  useTemplate: (id: string) => {
    return useQuery<Template, Error>({
      queryKey: ['template', id],
      queryFn: () => templatesApi.getTemplate(id),
    });
  },

  useTemplateById: ({
    id,
    enabled,
  }: {
    id: string | null;
    enabled: boolean;
  }) => {
    return useQuery<Template, Error>({
      queryKey: ['template', id],
      queryFn: () => templatesApi.getTemplate(id ?? ''),
      enabled: enabled && !isNil(id),
    });
  },

  useTemplateCenter: ({ primary = false }: { primary?: boolean } = {}) => {
    return useQuery<Template[], Error>({
      queryKey: TEMPLATE_CENTER_QUERY_KEY,
      queryFn: async () => {
        const result = await templatesApi.list({});
        return result.data;
      },
      staleTime: 60 * 1000,
      meta: primary
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
    });
  },

  useRecommendedTemplates: ({ limit }: { limit?: number } = {}) => {
    const { data, isLoading, isError } = templatesHooks.useTemplateCenter();
    const templates = useMemo(() => {
      const recommended = templateCenterUtils.listFor({
        templates: data ?? [],
        userId: authenticationSession.getCurrentUserId(),
        tab: TemplateCenterTab.RECOMMENDED,
        category: null,
        search: '',
        sort: TemplateCenterSort.HOT,
      });
      return isNil(limit) ? recommended : recommended.slice(0, limit);
    }, [data, limit]);
    return { templates, isLoading, isError };
  },

  useAllOfficialTemplates: () => {
    return useQuery<Template[], Error>({
      queryKey: ['templates', 'all'],
      queryFn: async () => {
        const result = await templatesApi.list({
          type: TemplateType.OFFICIAL,
        });
        return result.data;
      },
      staleTime: 5 * 60 * 1000,
    });
  },

  useTemplates: (type?: TemplateType) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const search = searchParams.get('search') ?? '';
    const category = searchParams.get('category') ?? undefined;

    const [debouncedSearch] = useDebounce(search, 300);

    const { data: templates, isLoading } = useQuery<Template[], Error>({
      queryKey: ['templates', debouncedSearch, category],
      queryFn: async () => {
        const templates = await templatesApi.list({
          type,
          search: debouncedSearch || undefined,
          category,
        });
        return templates.data;
      },
      staleTime: 5 * 60 * 1000,
    });

    const setSearch = (newSearch: string) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (newSearch) {
          params.set('search', newSearch);
        } else {
          params.delete('search');
        }
        return params;
      });
    };

    const setCategory = (newCategory: string) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (newCategory && newCategory !== 'All') {
          params.set('category', newCategory);
        } else {
          params.delete('category');
        }
        return params;
      });
    };

    return {
      templates,
      isLoading,
      search,
      setSearch,
      category: category || 'All',
      setCategory,
    };
  },
};

export const templateKeys = {
  all: ['templates'] as const,
  custom: ['custom-templates'] as const,
};

export const templatesMutations = {
  useGenerateTemplate: ({
    onSuccess,
  }: {
    onSuccess: (template: Template) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation<
      Template,
      Error,
      GenerateTemplateFromWorkflowRequestBody
    >({
      mutationFn: (request) => templatesApi.generateFromWorkflow(request),
      onSuccess: (template) => {
        queryClient.invalidateQueries({
          queryKey: TEMPLATE_CENTER_QUERY_KEY,
        });
        onSuccess(template);
      },
    });
  },
  useUseTemplate: ({ onSuccess }: { onSuccess?: () => void } = {}) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    return useMutation<
      UseTemplateResult,
      Error,
      { template: Template; projectId: string }
    >({
      mutationFn: async ({ template, projectId }) => {
        const prepared = templateCenterUtils.stripTemplateConnections(template);
        const hasMultipleWorkflows = (prepared.workflows ?? []).length > 1;
        const folderName = hasMultipleWorkflows
          ? (
              await foldersApi.create({
                displayName: template.name,
                projectId,
              })
            ).displayName
          : undefined;
        const workflows = await workflowHooks.importWorkflowsFromTemplates({
          templates: [prepared],
          projectId,
          folderName,
        });
        await tryCatch(() => templatesApi.recordUsage(template.id));
        sendInstallTelemetry(template);
        return { workflows, projectId };
      },
      onSuccess: ({ workflows, projectId }) => {
        queryClient.invalidateQueries({ queryKey: TEMPLATE_CENTER_QUERY_KEY });
        toast.success(
          t(
            'Workflow created from the template. Complete the configuration in the validation panel.',
          ),
        );
        onSuccess?.();
        navigate(
          workflows.length === 1
            ? `/projects/${projectId}/workflows/${workflows[0].id}`
            : `/projects/${projectId}/workflows`,
        );
      },
      onError: (error) => {
        toast.error(
          t(
            api.extractServerErrorMessage(
              error,
              'Failed to create workflow from template',
            ),
          ),
        );
      },
    });
  },
  useCreateTemplate: ({
    onDone,
    onError,
  }: {
    onDone: () => void;
    onError?: (error: Error) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: Parameters<typeof templatesApi.create>[0]) =>
        templatesApi.create(request),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: templateKeys.custom });
        toast.success(t('Template created successfully'), { duration: 3000 });
        onDone();
      },
      onError,
    });
  },
  useUpdateTemplate: ({
    onDone,
    onError,
  }: {
    onDone: () => void;
    onError?: (error: Error) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        templateId,
        request,
      }: {
        templateId: string;
        request: Parameters<typeof templatesApi.update>[1];
      }) => templatesApi.update(templateId, request),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: templateKeys.custom });
        toast.success(t('Template updated successfully'), { duration: 3000 });
        onDone();
      },
      onError,
    });
  },
  useBulkDeleteTemplates: ({ onSuccess }: { onSuccess: () => void }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (templateIds: string[]) => {
        await Promise.all(templateIds.map((id) => templatesApi.delete(id)));
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: templateKeys.custom });
        onSuccess();
      },
    });
  },
};

function sendInstallTelemetry(template: Template): void {
  const userId = authenticationSession.getCurrentUserId();
  if (template.type !== TemplateType.OFFICIAL || isNil(userId)) {
    return;
  }
  templatesTelemetryApi.sendEvent({
    eventType: TemplateTelemetryEventType.INSTALL,
    templateId: template.id,
    userId,
  });
}

export const TEMPLATE_CENTER_QUERY_KEY = ['templates', 'center'];

type UseTemplateResult = {
  workflows: PopulatedWorkflow[];
  projectId: string;
};

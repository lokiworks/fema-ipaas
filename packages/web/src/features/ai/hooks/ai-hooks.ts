import {
  ApplyWorkflowPlanRequestBody,
  CopilotRequestBody,
  GenerateWorkflowPlanRequestBody,
  ListAiUsageRequestQuery,
  SuggestFieldMappingRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { aiApi } from '../api/ai-api';

function useModelConnections(projectId: string) {
  return useQuery({
    queryKey: [AI_KEY, 'model-connections', projectId],
    queryFn: () => aiApi.listModelConnections(projectId),
  });
}

function useModelSelection(projectId: string) {
  const { data, isLoading, isError } = useModelConnections(projectId);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const connections = data ?? [];
  const chosen = connections.find(
    (connection) => connection.externalId === chosenId,
  );
  const selectedId = chosen?.externalId ?? connections[0]?.externalId ?? null;
  return {
    connections,
    isLoading,
    isError,
    selectedId,
    select: setChosenId,
  };
}

function useGeneratePlan({ onError }: ErrorHandler) {
  return useMutation({
    mutationFn: (request: GenerateWorkflowPlanRequestBody) =>
      aiApi.generatePlan(request),
    onError: (error) => onError(serverMessage(error)),
  });
}

function useApplyPlan() {
  return useMutation({
    mutationFn: (request: ApplyWorkflowPlanRequestBody) =>
      aiApi.applyPlan(request),
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useSuggestFieldMapping({ onError }: ErrorHandler) {
  return useMutation({
    mutationFn: (request: SuggestFieldMappingRequestBody) =>
      aiApi.suggestFieldMapping(request),
    onError: (error) => onError(serverMessage(error)),
  });
}

function useCopilot({ onError }: ErrorHandler) {
  return useMutation({
    mutationFn: (request: CopilotRequestBody) => aiApi.copilot(request),
    onError: (error) => onError(serverMessage(error)),
  });
}

function useUsage(request: ListAiUsageRequestQuery) {
  return useQuery({
    queryKey: [AI_KEY, 'usage', request],
    queryFn: () => aiApi.usage(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function serverMessage(error: unknown): string {
  return api.extractServerErrorMessage(error, t('Something went wrong'));
}

const AI_KEY = 'ai';

export const aiHooks = {
  useModelConnections,
  useModelSelection,
  useGeneratePlan,
  useApplyPlan,
  useCopilot,
  useUsage,
  useSuggestFieldMapping,
};

type ErrorHandler = { onError: (message: string) => void };

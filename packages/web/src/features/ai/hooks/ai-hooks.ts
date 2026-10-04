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

function usePlanModelSelection(projectId: string) {
  const { data, isLoading } = useModelConnections(projectId);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const connections = data ?? [];
  const chosen = connections.find(
    (connection) => connection.externalId === chosenId,
  );
  const selectedId =
    chosenId === RULES_MODEL_ID
      ? null
      : chosen?.externalId ?? connections[0]?.externalId ?? null;
  return {
    connections,
    isLoading,
    selectedId,
    usesRules: selectedId === null,
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

function usePlanTemplates({
  projectId,
  prompt,
  enabled,
}: {
  projectId: string;
  prompt: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [AI_KEY, 'plan-templates', projectId, prompt],
    queryFn: () => aiApi.listPlanTemplates({ projectId, prompt }),
    enabled: enabled && projectId.length > 0,
    staleTime: 60_000,
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
  return localizedModelMessage(
    api.extractServerErrorMessage(error, t('Something went wrong')),
  );
}

function localizedModelMessage(message: string): string {
  const modelError = message.match(MODEL_ERROR_PATTERN);
  if (modelError) {
    return t('Model error (HTTP {status}): {reason}', {
      status: modelError[1],
      reason: modelError[2],
    });
  }
  const unreachable = message.match(MODEL_UNREACHABLE_PATTERN);
  if (unreachable) {
    return t('Could not reach the model: {reason}', { reason: unreachable[1] });
  }
  return KNOWN_SERVER_MESSAGES.has(message)
    ? t(message, { defaultValue: message })
    : message;
}

const AI_KEY = 'ai';
const MODEL_ERROR_PATTERN = /^Model error \(HTTP (\d+)\): (.*)$/s;
const MODEL_UNREACHABLE_PATTERN = /^Could not reach the model: (.*)$/s;
const KNOWN_SERVER_MESSAGES = new Set([
  'The model did not return a usable plan. Try describing the workflow in more detail.',
  'The suggested trigger is not available. Try naming the system that starts the workflow.',
  'Model connection not found in this project',
]);

export const aiHooks = {
  useModelConnections,
  useModelSelection,
  usePlanModelSelection,
  useGeneratePlan,
  usePlanTemplates,
  useApplyPlan,
  useCopilot,
  useUsage,
  useSuggestFieldMapping,
};

export const RULES_MODEL_ID = '__rules__';

export type PlanModelSelection = ReturnType<typeof usePlanModelSelection>;

type ErrorHandler = { onError: (message: string) => void };

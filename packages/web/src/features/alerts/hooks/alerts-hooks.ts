import {
  ListAlertRecordsRequestQuery,
  UpsertAlertPolicyRequestBody,
  UpsertNotificationChannelRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { alertsApi } from '../api/alerts-api';

function useCapabilities() {
  return useQuery({
    queryKey: [ALERTS_KEY, 'capabilities'],
    queryFn: () => alertsApi.capabilities(),
  });
}

function useChannels() {
  return useQuery({
    queryKey: [ALERTS_KEY, 'channels'],
    queryFn: () => alertsApi.listChannels(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function usePolicies() {
  return useQuery({
    queryKey: [ALERTS_KEY, 'policies'],
    queryFn: () => alertsApi.listPolicies(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useRecords(request: ListAlertRecordsRequestQuery) {
  return useQuery({
    queryKey: [ALERTS_KEY, 'records', request],
    queryFn: () => alertsApi.listRecords(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useRecordStats() {
  return useQuery({
    queryKey: [ALERTS_KEY, 'record-stats'],
    queryFn: () => alertsApi.recordStats(),
  });
}

function useSaveChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string | null;
      request: UpsertNotificationChannelRequestBody;
    }) =>
      id === null
        ? alertsApi.createChannel(request)
        : alertsApi.updateChannel(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ALERTS_KEY] });
      toast.success(t('Channel saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.deleteChannel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ALERTS_KEY] });
      toast.success(t('Channel deleted'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useTestChannel() {
  return useMutation({
    mutationFn: (id: string) => alertsApi.testChannel(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t('Test message sent'));
        return;
      }
      toast.error(
        t('Test message failed: {error}', { error: result.error ?? '' }),
      );
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useSavePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string | null;
      request: UpsertAlertPolicyRequestBody;
    }) =>
      id === null
        ? alertsApi.createPolicy(request)
        : alertsApi.updatePolicy(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ALERTS_KEY] });
      toast.success(t('Alert policy saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useDeletePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.deletePolicy(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ALERTS_KEY] });
      toast.success(t('Alert policy deleted'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const ALERTS_KEY = 'alerts';

export const alertsHooks = {
  useCapabilities,
  useChannels,
  usePolicies,
  useRecords,
  useRecordStats,
  useSaveChannel,
  useDeleteChannel,
  useTestChannel,
  useSavePolicy,
  useDeletePolicy,
};

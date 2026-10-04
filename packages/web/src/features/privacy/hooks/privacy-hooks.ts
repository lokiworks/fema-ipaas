import {
  ConfirmDataErasureRequestBody,
  CreateDataErasureRequestBody,
  ErasureStatus,
  RevealExecutionPayloadRequestBody,
  UpdatePrivacySettingsRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { privacyApi } from '../api/privacy-api';

function useSettings({
  showErrorDialog = false,
}: { showErrorDialog?: boolean } = {}) {
  return useQuery({
    queryKey: [PRIVACY_KEY],
    queryFn: () => privacyApi.get(),
    meta: { showErrorDialog, loadSubsetOptions: {} },
  });
}

function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdatePrivacySettingsRequestBody) =>
      privacyApi.update(request),
    onSuccess: (settings) => {
      queryClient.setQueryData([PRIVACY_KEY], settings);
      queryClient.invalidateQueries({ queryKey: [OVERVIEW_KEY] });
      toast.success(t('Privacy settings saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useOverview() {
  return useQuery({
    queryKey: [OVERVIEW_KEY],
    queryFn: () => privacyApi.overview(),
  });
}

function useReveal(executionId: string) {
  return useMutation({
    mutationFn: (request: RevealExecutionPayloadRequestBody) =>
      privacyApi.reveal(executionId, request),
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useErasures() {
  return useQuery({
    queryKey: [ERASURES_KEY],
    queryFn: () => privacyApi.listErasures(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((request) =>
        ACTIVE_ERASURE_STATUSES.includes(request.status),
      )
        ? ERASURE_POLL_MS
        : false,
  });
}

function useCreateErasure({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDataErasureRequestBody) =>
      privacyApi.createErasure(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ERASURES_KEY] });
      toast.success(t('Searching run logs. This can take a few minutes.'));
      onSuccess();
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useCancelErasure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => privacyApi.cancelErasure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ERASURES_KEY] });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useConfirmErasure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: ConfirmDataErasureRequestBody;
    }) => privacyApi.confirmErasure(id, request),
    onError: () => undefined,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ERASURES_KEY] });
      queryClient.invalidateQueries({ queryKey: [OVERVIEW_KEY] });
    },
  });
}

function useDownloadReceipt() {
  return useMutation({
    mutationFn: async (id: string) => {
      const receipt = await privacyApi.erasureReceipt(id);
      downloadJson({ fileName: `erasure-receipt-${id}.json`, data: receipt });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function downloadJson({ fileName, data }: { fileName: string; data: unknown }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const PRIVACY_KEY = 'privacy-settings';
const OVERVIEW_KEY = 'privacy-overview';
const ERASURES_KEY = 'privacy-erasures';
const ERASURE_POLL_MS = 3000;
const ACTIVE_ERASURE_STATUSES = [ErasureStatus.SCANNING, ErasureStatus.ERASING];

export const privacyHooks = {
  useSettings,
  useUpdateSettings,
  useOverview,
  useReveal,
  useErasures,
  useCreateErasure,
  useCancelErasure,
  useConfirmErasure,
  useDownloadReceipt,
};

import {
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

function useSettings() {
  return useQuery({
    queryKey: [PRIVACY_KEY],
    queryFn: () => privacyApi.get(),
  });
}

function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdatePrivacySettingsRequestBody) =>
      privacyApi.update(request),
    onSuccess: (settings) => {
      queryClient.setQueryData([PRIVACY_KEY], settings);
      toast.success(t('Privacy settings saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
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

function useErasureAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'confirm' | 'cancel';
    }) =>
      action === 'confirm'
        ? privacyApi.confirmErasure(id)
        : privacyApi.cancelErasure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ERASURES_KEY] });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const PRIVACY_KEY = 'privacy-settings';
const ERASURES_KEY = 'privacy-erasures';
const ERASURE_POLL_MS = 3000;
const ACTIVE_ERASURE_STATUSES = [ErasureStatus.SCANNING, ErasureStatus.ERASING];

export const privacyHooks = {
  useSettings,
  useUpdateSettings,
  useReveal,
  useErasures,
  useCreateErasure,
  useErasureAction,
};

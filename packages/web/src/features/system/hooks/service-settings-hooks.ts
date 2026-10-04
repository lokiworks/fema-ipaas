import { ServiceSettingDraft } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { serviceSettingsApi } from '../api/service-settings-api';

function useList() {
  return useQuery({
    queryKey: [SERVICE_SETTINGS_KEY],
    queryFn: () => serviceSettingsApi.list(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useSave({ onSaved }: { onSaved: () => void }) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (draft: ServiceSettingDraft) => serviceSettingsApi.save(draft),
    onSuccess: (response) => {
      if (!response.saved) {
        return;
      }
      refresh();
      toast.success(t('Service settings saved'));
      onSaved();
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useClear() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: serviceSettingsApi.clear,
    onSuccess: () => {
      refresh();
      toast.success(t('Saved settings removed'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useTest() {
  return useMutation({
    mutationFn: serviceSettingsApi.test,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [SERVICE_SETTINGS_KEY] });
    void queryClient.invalidateQueries({ queryKey: [SYSTEM_OVERVIEW_KEY] });
    void queryClient.invalidateQueries({ queryKey: [SETUP_CHECKLIST_KEY] });
  };
}

const SERVICE_SETTINGS_KEY = 'service-settings';
const SYSTEM_OVERVIEW_KEY = 'system-overview';
const SETUP_CHECKLIST_KEY = 'setup-checklist';

export const serviceSettingsHooks = {
  useList,
  useSave,
  useClear,
  useTest,
};

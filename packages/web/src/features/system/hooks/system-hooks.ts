import { SetupCheckKind, SetupCheckLevel } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { downloadFile } from '@/lib/dom-utils';

import { systemApi } from '../api/system-api';

function useOverview() {
  return useQuery({
    queryKey: [SYSTEM_OVERVIEW_KEY],
    queryFn: () => systemApi.getOverview(),
    staleTime: 60_000,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useRecheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => systemApi.getOverview(),
    onSuccess: (overview) => {
      queryClient.setQueryData([SYSTEM_OVERVIEW_KEY], overview);
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useDownloadDiagnostics() {
  return useMutation({
    mutationFn: async () => {
      const bundle = await systemApi.getDiagnosticsBundle();
      await downloadFile({
        obj: JSON.stringify(bundle, null, 2),
        fileName: `diagnostics-${dayjs().format('YYYYMMDD-HHmm')}`,
        extension: 'json',
      });
    },
    onSuccess: () =>
      toast.success(
        t(
          'Diagnostics downloaded. It has no passwords, keys or business data.',
        ),
      ),
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useSetupStatus({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: [SETUP_STATUS_KEY],
    queryFn: () => systemApi.getSetupStatus(),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.checks.some(
        (check) =>
          check.kind === SetupCheckKind.WORKERS &&
          check.level !== SetupCheckLevel.OK,
      )
        ? SETUP_POLL_MS
        : false,
  });
}

function useSetupChecklist() {
  return useQuery({
    queryKey: [SETUP_CHECKLIST_KEY],
    queryFn: () => systemApi.getSetupChecklist(),
  });
}

const SYSTEM_OVERVIEW_KEY = 'system-overview';
const SETUP_STATUS_KEY = 'setup-status';
const SETUP_CHECKLIST_KEY = 'setup-checklist';
const SETUP_POLL_MS = 5000;

export const systemHooks = {
  useOverview,
  useRecheck,
  useDownloadDiagnostics,
  useSetupStatus,
  useSetupChecklist,
};

import {
  BackupListItem,
  BackupStatus,
  CreateBackupRequestBody,
  UpdateBackupSettingsRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { backupApi } from '../api/backup-api';

function useOverview() {
  return useQuery({
    queryKey: [BACKUP_OVERVIEW_KEY],
    queryFn: () => backupApi.getOverview(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useList() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [BACKUP_LIST_KEY],
    queryFn: async () => {
      const previous = queryClient.getQueryData<BackupListItem[]>([
        BACKUP_LIST_KEY,
      ]);
      const next = await backupApi.list();
      if (hasRunning({ backups: previous }) && !hasRunning({ backups: next })) {
        void queryClient.invalidateQueries({ queryKey: [BACKUP_OVERVIEW_KEY] });
        void queryClient.invalidateQueries({ queryKey: [SYSTEM_OVERVIEW_KEY] });
      }
      return next;
    },
    refetchInterval: (query) =>
      hasRunning({ backups: query.state.data }) ? POLL_MS : false,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (request: CreateBackupRequestBody) => backupApi.create(request),
    onSuccess: () => {
      refresh();
      toast.info(t('Backup started. You can leave this page.'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useUpdateSettings() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (request: UpdateBackupSettingsRequestBody) =>
      backupApi.updateSettings(request),
    onSuccess: () => {
      refresh();
      toast.success(t('Backup plan saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function usePrecheck({ id }: { id: string }) {
  return useQuery({
    queryKey: [BACKUP_PRECHECK_KEY, id],
    queryFn: () => backupApi.precheck({ id }),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}

function hasRunning({
  backups,
}: {
  backups: BackupListItem[] | undefined;
}): boolean {
  return (backups ?? []).some(
    (backup) => backup.status === BackupStatus.RUNNING,
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [BACKUP_LIST_KEY] });
    void queryClient.invalidateQueries({ queryKey: [BACKUP_OVERVIEW_KEY] });
    void queryClient.invalidateQueries({ queryKey: [SYSTEM_OVERVIEW_KEY] });
  };
}

const BACKUP_OVERVIEW_KEY = 'backup-overview';
const BACKUP_LIST_KEY = 'backup-list';
const BACKUP_PRECHECK_KEY = 'backup-precheck';
const SYSTEM_OVERVIEW_KEY = 'system-overview';
const POLL_MS = 2000;

export const backupHooks = {
  useOverview,
  useList,
  useCreate,
  useUpdateSettings,
  useRefresh,
  usePrecheck,
};

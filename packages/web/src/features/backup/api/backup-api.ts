import {
  BackupListItem,
  BackupOverview,
  BackupRecord,
  BackupSettings,
  CreateBackupRequestBody,
  RestorePrecheck,
  UpdateBackupSettingsRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const backupApi = {
  getOverview(): Promise<BackupOverview> {
    return api.get<BackupOverview>('/v1/backups/overview');
  },
  list(): Promise<BackupListItem[]> {
    return api.get<BackupListItem[]>('/v1/backups');
  },
  create(request: CreateBackupRequestBody): Promise<BackupRecord> {
    return api.post<BackupRecord>('/v1/backups', request);
  },
  updateSettings(
    request: UpdateBackupSettingsRequestBody,
  ): Promise<BackupSettings> {
    return api.post<BackupSettings>('/v1/backups/settings', request);
  },
  precheck({ id }: { id: string }): Promise<RestorePrecheck> {
    return api.get<RestorePrecheck>(`/v1/backups/${id}/restore-precheck`);
  },
  remove({ id }: { id: string }): Promise<void> {
    return api.delete<void>(`/v1/backups/${id}`);
  },
};

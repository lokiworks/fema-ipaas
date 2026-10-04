import {
  LOG_RETENTION_DAYS_OPTIONS,
  PrivacySettings,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectCollectionUtils } from '@/features/projects';

export function ProjectRetentionSection({
  settings,
}: {
  settings: PrivacySettings;
}) {
  const { data: projects } = projectCollectionUtils.useAllTenantProjects();
  const shorterOptions = LOG_RETENTION_DAYS_OPTIONS.filter(
    (days) => days < settings.logRetentionDays,
  );
  const change = (projectId: string, value: string) => {
    const days = value === FOLLOW_PLATFORM ? null : Number(value);
    const transaction = projectCollectionUtils.update(projectId, {
      executionDataRetentionDays: days,
    });
    transaction.isPersisted.promise.then(
      () => toast.success(t('Retention saved')),
      () => toast.error(t('Something went wrong')),
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Retention by project')}</CardTitle>
        <CardDescription>
          {t(
            'A project can only keep run logs for a shorter time than the platform default of {days} days. Changes here are saved right away.',
            { days: settings.logRetentionDays },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {projects.map((project) => {
          const current = project.executionDataRetentionDays;
          const value =
            current !== null &&
            current !== undefined &&
            shorterOptions.some((days) => days === current)
              ? String(current)
              : FOLLOW_PLATFORM;
          return (
            <div
              key={project.id}
              className="flex items-center justify-between gap-4 py-2"
            >
              <span className="truncate text-sm">{project.displayName}</span>
              <Select
                value={value}
                onValueChange={(next) => change(project.id, next)}
              >
                <SelectTrigger
                  className="w-56"
                  aria-label={project.displayName}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FOLLOW_PLATFORM}>
                    {t('Follow platform ({days} days)', {
                      days: settings.logRetentionDays,
                    })}
                  </SelectItem>
                  {shorterOptions.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {t('{days} days', { days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const FOLLOW_PLATFORM = 'follow';

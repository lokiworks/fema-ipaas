import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowVersionState } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo, useState } from 'react';

import { LoadingSpinner } from '@/components/custom/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  releasesHooks,
  versionDiff,
  versionReleaseInfo,
} from '@/features/releases';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import { VersionChangeList } from './version-change-list';
import { versionNumbers } from './version-numbers';

export function CompareVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  leftVersionId,
  rightVersionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  leftVersionId: string | null;
  rightVersionId: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Compare versions')}</DialogTitle>
          <DialogDescription>
            {t('Pick any two versions, or the draft, to see what changed.')}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CompareVersionsBody
            key={`${leftVersionId}-${rightVersionId}`}
            workflowId={workflowId}
            initialLeft={leftVersionId}
            initialRight={rightVersionId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompareVersionsBody({
  workflowId,
  initialLeft,
  initialRight,
}: {
  workflowId: string;
  initialLeft: string | null;
  initialRight: string | null;
}) {
  const { data: versionsPage } =
    workflowHooks.useListWorkflowVersions(workflowId);
  const versions = useMemo(() => versionsPage?.data ?? [], [versionsPage]);
  const numbers = useMemo(
    () => versionNumbers.numberVersions(versions),
    [versions],
  );
  const { data: changesPage } = releasesHooks.useWorkflowChanges({
    projectId: authenticationSession.getProjectId() ?? '',
    workflowId,
  });
  const releaseInfo = useMemo(
    () => versionReleaseInfo.byVersion(changesPage?.data ?? []),
    [changesPage],
  );
  const [left, setLeft] = useState<string | null>(initialLeft);
  const [right, setRight] = useState<string | null>(initialRight);
  const leftId = left ?? versions[1]?.id ?? null;
  const rightId = right ?? versions[0]?.id ?? null;
  const leftQuery = useVersion({ workflowId, versionId: leftId });
  const rightQuery = useVersion({ workflowId, versionId: rightId });
  const optionLabel = (id: string) => {
    const version = versions.find((candidate) => candidate.id === id);
    if (!version) {
      return id;
    }
    const label =
      version.state === WorkflowVersionState.DRAFT
        ? t('Draft')
        : versionNumbers.label({ numbers, versionId: id }) ?? '';
    const date = versionNumbers.shownAt({
      version,
      publishedAt: releaseInfo[id]?.production?.created,
    });
    return `${label} · ${formatUtils.formatDateWithTime(
      new Date(date),
      false,
    )}`;
  };

  const isLoading = leftQuery.isLoading || rightQuery.isLoading;
  const hasChanges =
    !isNil(leftQuery.data) &&
    !isNil(rightQuery.data) &&
    (versionDiff.diffSteps({
      before: leftQuery.data.trigger,
      after: rightQuery.data.trigger,
    }).length > 0 ||
      versionDiff.workflowChanges({
        before: leftQuery.data,
        after: rightQuery.data,
      }).length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <VersionSelect
          label={t('Older version')}
          value={leftId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setLeft}
        />
        <VersionSelect
          label={t('Newer version')}
          value={rightId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setRight}
        />
      </div>
      {isLoading ? (
        <div className="flex py-10">
          <LoadingSpinner />
        </div>
      ) : !hasChanges || isNil(rightQuery.data) ? (
        <p className="py-6 text-sm text-muted-foreground">
          {t('These two versions have the same steps and settings.')}
        </p>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <VersionChangeList
            before={leftQuery.data ?? null}
            after={rightQuery.data}
          />
        </ScrollArea>
      )}
    </div>
  );
}

function VersionSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  optionLabel: (id: string) => string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('Choose a version')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((id) => (
            <SelectItem key={id} value={id}>
              {optionLabel(id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function useVersion({
  workflowId,
  versionId,
}: {
  workflowId: string;
  versionId: string | null;
}) {
  return useQuery({
    queryKey: ['workflow-version-compare', workflowId, versionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflowId, {
          versionId: versionId ?? undefined,
        })
      ).version,
    enabled: versionId !== null,
  });
}

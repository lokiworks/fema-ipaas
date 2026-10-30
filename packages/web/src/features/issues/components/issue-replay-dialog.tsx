import {
  ReplayCategory,
  ReplayCheckItem,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RerunPreview } from '@/features/run-logs/components/rerun-preview';
import { RerunStrategyOptions } from '@/features/run-logs/components/rerun-strategy-options';
import { rerunPreviewUtils } from '@/features/run-logs/utils/rerun-preview-utils';

import { issuesHooks } from '../hooks/issues-hooks';
import { issueUiUtils } from '../utils/issue-ui-utils';

import { LikelyToFailBlock } from './likely-to-fail-block';

export function IssueReplayDialog({
  issueId,
  workflowName,
  open,
  initialStrategy = WorkflowRetryStrategy.FROM_FAILED_STEP,
  onOpenChange,
}: {
  issueId: string;
  workflowName: string | null;
  open: boolean;
  initialStrategy?: WorkflowRetryStrategy;
  onOpenChange: (open: boolean) => void;
}) {
  const [strategy, setStrategy] =
    useState<WorkflowRetryStrategy>(initialStrategy);
  const [includeDataProblems, setIncludeDataProblems] = useState(false);
  const [confirmedUnsafeSteps, setConfirmedUnsafeSteps] = useState<string[]>(
    [],
  );
  const { data: check, isLoading } = issuesHooks.useReplayCheck(
    issueId,
    open,
    strategy,
  );
  const { mutate: replay, isPending } = issuesHooks.useReplay(issueId);

  const groups = useMemo(() => groupByCategory(check?.items ?? []), [check]);
  const replayableCount = groups[ReplayCategory.REPLAYABLE].length;
  const dataProblemCount = groups[ReplayCategory.DATA_PROBLEM].length;
  const expiredCount = check?.rawDataExpiredCount ?? 0;
  const toRun = replayableCount + (includeDataProblems ? dataProblemCount : 0);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement =
    strategy === WorkflowRetryStrategy.ON_LATEST_VERSION;
  const previewGroups = rerunPreviewUtils.groupRuns({
    runs: [
      ...groups[ReplayCategory.REPLAYABLE],
      ...(includeDataProblems ? groups[ReplayCategory.DATA_PROBLEM] : []),
    ].map((item) => ({
        workflowId: item.workflowId,
        workflowName,
        workflowVersionId: item.workflowVersionId,
        versionNumber: item.versionNumber,
        failedStepName: item.failedStepName,
      })),
  });

  const writeSteps = (check?.items ?? [])
    .filter(
      (item) =>
        item.category === ReplayCategory.REPLAYABLE ||
        (includeDataProblems && item.category === ReplayCategory.DATA_PROBLEM),
    )
    .flatMap((item) =>
      item.writeSteps
        .filter((step) => step.willRun)
        .map((step) => ({
          ...step,
          key: `${item.executionId}:${step.stepName}`,
        })),
    );
  const unconfirmed = writeSteps.some(
    (step) =>
      step.needsConfirmation && !confirmedUnsafeSteps.includes(step.key),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Rerun the failed runs of this issue?')}</DialogTitle>
          <DialogDescription>{t('rerunDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RerunStrategyOptions
            value={strategy}
            onChange={(next) => {
              setAcknowledged(false);
              setConfirmedUnsafeSteps([]);
              setStrategy(next);
            }}
          />

          {expiredCount > 0 && (
            <p className="text-sm text-warning-700">
              {t('replayRawDataExpired', {
                count: expiredCount,
                days: check?.rawRetentionDays ?? 0,
              })}
            </p>
          )}

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
              <LikelyToFailBlock
                reasons={groups[ReplayCategory.DATA_PROBLEM].map(
                  (item) => item.reason,
                )}
                included={includeDataProblems}
                onIncludedChange={setIncludeDataProblems}
              />
              {CATEGORY_ORDER.map((category) =>
                groups[category].length === 0 ? null : (
                  <div key={category} className="rounded-md border">
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                      <span className="text-sm font-medium">
                        {issueUiUtils.replayCategoryLabel(category)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {groups[category].length}
                      </span>
                    </div>
                    <ul className="px-3 py-2 text-sm text-muted-foreground flex flex-col gap-1">
                      {summarizeReasons(groups[category]).map(
                        ({ reason, count, blockedUntil }) => (
                          <li key={reason} className="flex justify-between">
                            <span>
                              {issueUiUtils.replayReasonLabel(
                                reason,
                                blockedUntil,
                              )}
                            </span>
                            <span>{count}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ),
              )}
              {(check?.items.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('There are no runs to rerun.')}
                </p>
              )}
            </div>
          )}
          {open && !isLoading && (
            <RerunPreview groups={previewGroups} strategy={strategy} />
          )}
          {writeSteps.length > 0 && (
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-sm">
              <p className="font-medium">{t('Steps that will write data')}</p>
              {writeSteps.map((step) => (
                <label key={step.key} className="flex items-start gap-2">
                  {step.needsConfirmation && (
                    <Checkbox
                      checked={confirmedUnsafeSteps.includes(step.key)}
                      onCheckedChange={(checked) =>
                        setConfirmedUnsafeSteps((current) =>
                          checked === true
                            ? [...current, step.key]
                            : current.filter((key) => key !== step.key),
                        )
                      }
                    />
                  )}
                  <span>
                    {step.displayName}
                    {step.needsConfirmation
                      ? ` — ${t(
                          'Running this step again may create duplicates.',
                        )}`
                      : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
          {needsAcknowledgement && toRun > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
              />
              {t(
                'I understand that steps which write data are called again and may create duplicates',
              )}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={
              toRun === 0 ||
              isPending ||
              isLoading ||
              unconfirmed ||
              (needsAcknowledgement && !acknowledged)
            }
            loading={isPending}
            onClick={() =>
              replay(
                { strategy, includeDataProblems, confirmedUnsafeSteps },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {t('Rerun {count}', { count: toRun })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function groupByCategory(
  items: ReplayCheckItem[],
): Record<ReplayCategory, ReplayCheckItem[]> {
  return {
    [ReplayCategory.REPLAYABLE]: items.filter(
      (item) => item.category === ReplayCategory.REPLAYABLE,
    ),
    [ReplayCategory.DATA_PROBLEM]: items.filter(
      (item) => item.category === ReplayCategory.DATA_PROBLEM,
    ),
    [ReplayCategory.BLOCKED]: items.filter(
      (item) => item.category === ReplayCategory.BLOCKED,
    ),
    [ReplayCategory.NOT_NEEDED]: items.filter(
      (item) => item.category === ReplayCategory.NOT_NEEDED,
    ),
  };
}

function summarizeReasons(items: ReplayCheckItem[]): ReasonSummary[] {
  return items.reduce<ReasonSummary[]>((acc, item) => {
    const existing = acc.find((summary) => summary.reason === item.reason);
    if (!existing) {
      return [
        ...acc,
        {
          reason: item.reason,
          count: 1,
          blockedUntil: item.blockedUntil ?? null,
        },
      ];
    }
    return acc.map((summary) =>
      summary.reason === item.reason
        ? {
            ...summary,
            count: summary.count + 1,
            blockedUntil: laterOf(summary.blockedUntil, item.blockedUntil),
          }
        : summary,
    );
  }, []);
}

function laterOf(
  first: string | null,
  second: string | null | undefined,
): string | null {
  if (!second) {
    return first;
  }
  if (!first) {
    return second;
  }
  return new Date(second).getTime() > new Date(first).getTime()
    ? second
    : first;
}

const CATEGORY_ORDER = [
  ReplayCategory.REPLAYABLE,
  ReplayCategory.BLOCKED,
  ReplayCategory.NOT_NEEDED,
];

type ReasonSummary = {
  reason: ReplayCheckItem['reason'];
  count: number;
  blockedUntil: string | null;
};

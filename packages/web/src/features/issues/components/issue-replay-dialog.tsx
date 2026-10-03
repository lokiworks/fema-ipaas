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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';

import { issuesHooks } from '../hooks/issues-hooks';
import { issueUiUtils } from '../utils/issue-ui-utils';

export function IssueReplayDialog({
  issueId,
  open,
  onOpenChange,
}: {
  issueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [strategy, setStrategy] = useState<WorkflowRetryStrategy>(
    WorkflowRetryStrategy.FROM_FAILED_STEP,
  );
  const [includeDataProblems, setIncludeDataProblems] = useState(false);
  const { data: check, isLoading } = issuesHooks.useReplayCheck(issueId, open);
  const { mutate: replay, isPending } = issuesHooks.useReplay(issueId);

  const groups = useMemo(() => groupByCategory(check?.items ?? []), [check]);
  const replayableCount = groups[ReplayCategory.REPLAYABLE].length;
  const dataProblemCount = groups[ReplayCategory.DATA_PROBLEM].length;
  const expiredCount =
    strategy === WorkflowRetryStrategy.FROM_FAILED_STEP
      ? [
          ...groups[ReplayCategory.REPLAYABLE],
          ...(includeDataProblems ? groups[ReplayCategory.DATA_PROBLEM] : []),
        ].filter((item) => item.rawDataExpired).length
      : 0;
  const toRun =
    replayableCount +
    (includeDataProblems ? dataProblemCount : 0) -
    expiredCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Replay failed runs')}</DialogTitle>
          <DialogDescription>
            {t(
              'Runs are checked first. Runs whose connection is still broken are held back instead of failing again.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RadioGroup
            value={strategy}
            onValueChange={(value) =>
              setStrategy(
                value === WorkflowRetryStrategy.ON_LATEST_VERSION
                  ? WorkflowRetryStrategy.ON_LATEST_VERSION
                  : WorkflowRetryStrategy.FROM_FAILED_STEP,
              )
            }
            className="grid grid-cols-2 gap-3"
          >
            <Label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <RadioGroupItem value={WorkflowRetryStrategy.FROM_FAILED_STEP} />
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {t('Replay from the failed step')}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {t('Steps that succeeded keep their original results.')}
                </span>
              </span>
            </Label>
            <Label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <RadioGroupItem value={WorkflowRetryStrategy.ON_LATEST_VERSION} />
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {t('Replay the whole run on the latest version')}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {t('Starts from the trigger and may create duplicate data.')}
                </span>
              </span>
            </Label>
          </RadioGroup>

          {expiredCount > 0 && (
            <p className="text-sm text-warning-700">
              {t(
                '{count, plural, =1 {1 run has} other {# runs have}} passed the retention period for original data and can only be rerun as a whole. They are skipped here.',
                { count: expiredCount },
              )}
            </p>
          )}

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
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
                    {category === ReplayCategory.DATA_PROBLEM && (
                      <label className="flex items-center gap-2 px-3 pb-3 text-sm">
                        <Checkbox
                          checked={includeDataProblems}
                          onCheckedChange={(value) =>
                            setIncludeDataProblems(value === true)
                          }
                        />
                        {t('Replay these {count} runs anyway', {
                          count: dataProblemCount,
                        })}
                      </label>
                    )}
                  </div>
                ),
              )}
              {(check?.items.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('There are no runs to replay.')}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={toRun === 0 || isPending}
            loading={isPending}
            onClick={() =>
              replay(
                { strategy, includeDataProblems },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {t('Replay {count} runs', { count: toRun })}
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
  ReplayCategory.DATA_PROBLEM,
  ReplayCategory.BLOCKED,
  ReplayCategory.NOT_NEEDED,
];

type ReasonSummary = {
  reason: ReplayCheckItem['reason'];
  count: number;
  blockedUntil: string | null;
};

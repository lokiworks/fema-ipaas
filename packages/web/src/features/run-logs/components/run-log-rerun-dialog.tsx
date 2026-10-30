import {
  RunLogRow,
  RunRerunBlockReason,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LikelyToFailBlock } from '@/features/issues/components/likely-to-fail-block';

import { runLogsHooks } from '../hooks/run-logs-hooks';
import { rerunPreviewUtils } from '../utils/rerun-preview-utils';
import { runLogUiUtils } from '../utils/run-log-ui-utils';

import { RerunPreview } from './rerun-preview';
import { RerunStrategyOptions } from './rerun-strategy-options';

export function RunLogRerunDialog({
  rows,
  initialStrategy,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  rows: RunLogRow[];
  initialStrategy: WorkflowRetryStrategy;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: {
    executionIds: string[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <RerunChoice
            rows={rows}
            initialStrategy={initialStrategy}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RerunChoice({
  rows,
  initialStrategy,
  pending,
  onCancel,
  onConfirm,
}: {
  rows: RunLogRow[];
  initialStrategy: WorkflowRetryStrategy;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (request: {
    executionIds: string[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}) {
  const [strategy, setStrategy] =
    useState<WorkflowRetryStrategy>(initialStrategy);
  const reasonOf = (row: RunLogRow): RunRerunBlockReason | null =>
    strategy === WorkflowRetryStrategy.FROM_FAILED_STEP
      ? row.fromFailedStepBlockReason ?? null
      : row.rerunBlockReason ?? null;
  const eligible = rows.filter((row) => reasonOf(row) === null);
  const { data: check, isLoading: checking } = runLogsHooks.useRerunCheck({
    executionIds: eligible.map((row) => row.id),
    strategy,
    enabled: true,
  });
  const likelyReasons = new Map(
    (check?.likelyToFailAgain ?? []).map((item) => [
      item.executionId,
      item.reason,
    ]),
  );
  const [includeLikely, setIncludeLikely] = useState(false);
  const toRun = eligible.filter(
    (row) => includeLikely || !likelyReasons.has(row.id),
  );
  const blocked = rows.flatMap((row) => {
    const reason = reasonOf(row);
    return reason === null ? [] : [{ reason, blockedUntil: row.blockedUntil }];
  });
  const reasons = [...new Set(blocked.map((item) => item.reason))];
  const latestBlockedUntil = blocked
    .map((item) => item.blockedUntil)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement =
    strategy === WorkflowRetryStrategy.ON_LATEST_VERSION;
  const groups = rerunPreviewUtils.groupRuns({
    runs: toRun.map((row) => ({
      workflowId: row.workflowId,
      workflowName: row.workflowDisplayName ?? null,
      workflowVersionId: row.workflowVersionId,
      versionNumber: row.versionNumber ?? null,
      failedStepName: row.failedStep?.name ?? null,
    })),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {rows.length === 1
            ? t('Rerun this run?')
            : t('Rerun {count} runs?', { count: rows.length })}
        </DialogTitle>
        <DialogDescription>{t('rerunDialogDescription')}</DialogDescription>
      </DialogHeader>
      <RerunStrategyOptions
        value={strategy}
        onChange={(next) => {
          setAcknowledged(false);
          setStrategy(next);
        }}
      />
      {reasons.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border bg-muted/50 p-3 text-xs">
          <span className="font-medium">
            {t(
              '{count, plural, =1 {1 run will be skipped:} other {# runs will be skipped:}}',
              { count: blocked.length },
            )}
          </span>
          {reasons.map((reason) => (
            <span key={reason} className="text-muted-foreground">
              {runLogUiUtils.blockReasonLabel(reason, latestBlockedUntil)}
            </span>
          ))}
        </div>
      )}
      <LikelyToFailBlock
        reasons={[...likelyReasons.values()]}
        included={includeLikely}
        onIncludedChange={setIncludeLikely}
      />
      <RerunPreview groups={groups} strategy={strategy} />
      {needsAcknowledgement && toRun.length > 0 && (
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
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                loading={pending}
                disabled={
                  checking ||
                  toRun.length === 0 ||
                  (needsAcknowledgement && !acknowledged)
                }
                onClick={() =>
                  onConfirm({
                    executionIds: toRun.map((row) => row.id),
                    strategy,
                  })
                }
              >
                {t('Rerun {count}', { count: toRun.length })}
              </Button>
            </span>
          </TooltipTrigger>
          {toRun.length === 0 && (
            <TooltipContent>
              {t('None of the selected runs can be rerun this way')}
            </TooltipContent>
          )}
        </Tooltip>
      </DialogFooter>
    </>
  );
}

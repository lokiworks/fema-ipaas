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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { rerunPreviewUtils } from '../utils/rerun-preview-utils';
import { runLogUiUtils } from '../utils/run-log-ui-utils';

import { RerunPreview } from './rerun-preview';

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
    runs: eligible.map((row) => ({
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
        <DialogDescription>
          {t(
            'Reruns use the environment and connections of the original run. Every rerun is recorded in the audit log.',
          )}
        </DialogDescription>
      </DialogHeader>
      <RadioGroup
        value={strategy}
        onValueChange={(value) => {
          setAcknowledged(false);
          setStrategy(
            value === WorkflowRetryStrategy.ON_LATEST_VERSION
              ? WorkflowRetryStrategy.ON_LATEST_VERSION
              : WorkflowRetryStrategy.FROM_FAILED_STEP,
          );
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-start gap-3">
          <RadioGroupItem
            value={WorkflowRetryStrategy.FROM_FAILED_STEP}
            id="rerun-from-failed-step"
          />
          <span className="flex flex-col gap-0.5">
            <Label htmlFor="rerun-from-failed-step">
              {t('Rerun from the failed step')}
            </Label>
            <span className="text-xs text-muted-foreground">
              {t(
                'Continues the same run on its original version. Steps that already succeeded keep their results and are not called again.',
              )}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <RadioGroupItem
            value={WorkflowRetryStrategy.ON_LATEST_VERSION}
            id="rerun-whole-run"
          />
          <span className="flex flex-col gap-0.5">
            <Label htmlFor="rerun-whole-run">{t('Rerun the whole run')}</Label>
            <span className="text-xs text-muted-foreground">
              {t(
                'Starts a new run from the trigger with the same input on the latest published version. The new log links back to this one.',
              )}
            </span>
          </span>
        </label>
      </RadioGroup>
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
      <RerunPreview groups={groups} strategy={strategy} />
      {needsAcknowledgement && eligible.length > 0 && (
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
                  eligible.length === 0 ||
                  (needsAcknowledgement && !acknowledged)
                }
                onClick={() =>
                  onConfirm({
                    executionIds: eligible.map((row) => row.id),
                    strategy,
                  })
                }
              >
                {t('Rerun {count}', { count: eligible.length })}
              </Button>
            </span>
          </TooltipTrigger>
          {eligible.length === 0 && (
            <TooltipContent>
              {t('None of the selected runs can be rerun this way')}
            </TooltipContent>
          )}
        </Tooltip>
      </DialogFooter>
    </>
  );
}

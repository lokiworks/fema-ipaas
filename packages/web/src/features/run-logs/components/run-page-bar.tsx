import { WorkflowRetryStrategy } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authenticationSession } from '@/lib/authentication-session';

import { runLogsHooks } from '../hooks/run-logs-hooks';
import { runFocusUtils } from '../utils/run-focus-utils';
import { runLogUiUtils } from '../utils/run-log-ui-utils';

import { RunLogRerunDialog } from './run-log-rerun-dialog';

export function RunPageBar({
  runId,
  issueId,
}: {
  runId: string;
  issueId: string;
}) {
  const navigate = useNavigate();
  const { data: detail } = runLogsHooks.useDetail({ runId });
  const [strategy, setStrategy] = useState<WorkflowRetryStrategy | null>(null);
  const rerun = runLogsHooks.useRerun({
    onDone: (response) => {
      setStrategy(null);
      const created = response.results.find(
        (result) =>
          result.rerunExecutionId !== null &&
          result.rerunExecutionId !== result.executionId,
      );
      if (created?.rerunExecutionId) {
        navigate(
          authenticationSession.appendProjectRoutePrefix(
            runFocusUtils.runPath({
              runId: created.rerunExecutionId,
              stepName: null,
              panel: null,
              issueId,
            }),
          ),
        );
      }
    },
  });
  const row = detail?.row ?? null;
  const blockReason =
    row && row.fromFailedStepBlockReason && row.rerunBlockReason
      ? row.fromFailedStepBlockReason
      : null;
  const initialStrategy =
    row && row.fromFailedStepBlockReason === null
      ? WorkflowRetryStrategy.FROM_FAILED_STEP
      : WorkflowRetryStrategy.ON_LATEST_VERSION;
  return (
    <div
      className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2"
      data-testid="run-page-bar"
    >
      <Link
        to={authenticationSession.appendProjectRoutePrefix(
          `/issues/${issueId}`,
        )}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('Back to the issue')}
      </Link>
      {row && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={blockReason ? 0 : -1}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={blockReason !== null}
                onClick={() => setStrategy(initialStrategy)}
              >
                <RotateCcw className="size-4" />
                {t('Rerun')}
              </Button>
            </span>
          </TooltipTrigger>
          {blockReason && (
            <TooltipContent className="max-w-64">
              {runLogUiUtils.blockReasonLabel(blockReason, row.blockedUntil)}
            </TooltipContent>
          )}
        </Tooltip>
      )}
      {row && strategy !== null && (
        <RunLogRerunDialog
          rows={[row]}
          initialStrategy={strategy}
          open
          pending={rerun.isPending}
          onOpenChange={(open) => !open && setStrategy(null)}
          onConfirm={(request) => rerun.mutate(request)}
        />
      )}
    </div>
  );
}

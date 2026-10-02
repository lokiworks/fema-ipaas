import { SolutionCheckResult, SolutionCheckStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleAlert, CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { solutionsHooks, solutionsUtils } from '@/features/solutions';

import { WizardFooter } from './wizard-parts';

function ChecksStep({
  solutionId,
  projectId,
  connections,
  acknowledged,
  onBack,
  onNext,
}: ChecksStepProps) {
  const [acknowledgedKeys, setAcknowledgedKeys] = useState(acknowledged);
  const { data, isLoading, isFetching, isError, refetch } =
    solutionsHooks.useInstallChecks({ id: solutionId, projectId, connections });
  const results = data?.results ?? [];
  const gate = solutionsUtils.checkGate({
    results,
    acknowledged: acknowledgedKeys,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <p className="grow text-sm text-muted-foreground">
          {t(
            'A required check has to pass before installing. For the others, confirm that you know and continue.',
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className="size-4" />
          {t('Check again')}
        </Button>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('The checks could not run. Check again in a moment.')}
          </AlertDescription>
        </Alert>
      )}
      {results.map((result) => (
        <CheckResultRow
          key={result.key}
          result={result}
          acknowledged={acknowledgedKeys.includes(result.key)}
          onAcknowledge={(checked) =>
            setAcknowledgedKeys(
              solutionsUtils.toggleAcknowledged({
                acknowledged: acknowledgedKeys,
                key: result.key,
                checked,
              }),
            )
          }
        />
      ))}
      {gate.failedBlocking.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(
              '{count, plural, =1 {1 required check has} other {# required checks have}} not passed. Fix it and check again.',
              { count: gate.failedBlocking.length },
            )}
          </AlertDescription>
        </Alert>
      )}
      <WizardFooter
        onBack={onBack}
        nextDisabled={isLoading || isFetching || isError || !gate.canContinue}
        onNext={() => onNext(acknowledgedKeys)}
      />
    </div>
  );
}

function CheckResultRow({
  result,
  acknowledged,
  onAcknowledge,
}: CheckResultRowProps) {
  const passed = result.status === SolutionCheckStatus.PASS;
  const message = solutionsUtils.checkMessage(result.message);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <StatusIcon status={result.status} />
        <div className="flex min-w-0 grow flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{result.label}</span>
            <Badge variant={result.blocking ? 'destructive' : 'secondary'}>
              {result.blocking ? t('Required') : t('Recommended')}
            </Badge>
            {result.who && (
              <span className="text-xs text-muted-foreground">
                {t('Handled by {who}', { who: result.who })}
              </span>
            )}
          </div>
          {result.detail && (
            <span className="text-xs text-muted-foreground">
              {result.detail}
            </span>
          )}
          {message && (
            <span className="text-xs text-destructive">{message}</span>
          )}
        </div>
      </div>
      {!passed && result.fixSteps.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <ol className="list-decimal pl-5 text-xs">
            {result.fixSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CopyButton textToCopy={fixInstructions(result)} />
            {t('Copy the steps to send them to whoever handles this')}
          </div>
        </div>
      )}
      {!passed && !result.blocking && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked) => onAcknowledge(checked === true)}
          />
          {t('I know about this and want to continue')}
        </label>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: SolutionCheckStatus }) {
  switch (status) {
    case SolutionCheckStatus.PASS:
      return <CircleCheck className="size-5 shrink-0 text-success" />;
    case SolutionCheckStatus.FAIL:
      return <CircleX className="size-5 shrink-0 text-destructive" />;
    case SolutionCheckStatus.NEEDS_CONFIRM:
      return <CircleAlert className="size-5 shrink-0 text-warning" />;
  }
}

function fixInstructions(result: SolutionCheckResult): string {
  return [
    result.label,
    ...result.fixSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}

export { ChecksStep };

type ChecksStepProps = {
  solutionId: string;
  projectId: string;
  connections: Record<string, string>;
  acknowledged: string[];
  onBack: () => void;
  onNext: (acknowledged: string[]) => void;
};

type CheckResultRowProps = {
  result: SolutionCheckResult;
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
};

import { isNil, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils';
import { WorkflowAction, WorkflowTrigger } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Lightbulb } from 'lucide-react';

import { DebugHint, debugRecordsUtils } from '../debug/debug-records-utils';

import { FriendlyErrorView } from './friendly-error-view';
import { useStepExplanationContext } from './use-step-explanation-context';

export function StepErrorDetails({
  errorText,
  step,
}: {
  errorText: string;
  step: WorkflowAction | WorkflowTrigger | null;
}) {
  const friendly = tryParseFriendlyConnectorError(errorText);
  const explanation = useStepExplanationContext(step);
  return (
    <div className="flex flex-col gap-3">
      {friendly ? (
        <FriendlyErrorView
          error={friendly}
          explanationContext={explanation.context}
          connectorDisplayName={explanation.connectorDisplayName}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-destructive/5 p-3 text-xs text-destructive">
          {errorText}
        </pre>
      )}
      <TroubleshootingHints errorText={errorText} />
    </div>
  );
}

export function TroubleshootingHints({
  errorText,
}: {
  errorText: string | null;
}) {
  const hints = debugRecordsUtils.troubleshootingHints(errorText);
  if (isNil(errorText) || hints.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Lightbulb className="size-3.5 text-warning" />
        {t('Where to look')}
      </span>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {hints.map((hint) => (
          <li key={hint}>{HINT_TEXT[hint]()}</li>
        ))}
      </ul>
    </div>
  );
}

const HINT_TEXT: Record<DebugHint, () => string> = {
  [DebugHint.CHECK_CONNECTION]: () =>
    t(
      'The connection was rejected. Reconnect it or check that the credentials are still valid.',
    ),
  [DebugHint.CHECK_PERMISSION]: () =>
    t(
      'The account behind the connection lacks permission. Grant the scope or use another connection.',
    ),
  [DebugHint.CHECK_RESOURCE]: () =>
    t(
      'The target record or URL was not found. Check ids and paths in the inputs.',
    ),
  [DebugHint.RATE_LIMITED]: () =>
    t(
      'The service is rate limiting. Retry later or add a delay or retry strategy.',
    ),
  [DebugHint.TIMEOUT]: () =>
    t('The call timed out. Check the service status or raise the timeout.'),
  [DebugHint.CHECK_NETWORK]: () =>
    t(
      'The address could not be reached. Check the URL and that the worker can reach it.',
    ),
  [DebugHint.CHECK_INPUT]: () =>
    t(
      'The service rejected the inputs. Compare the input with what the service expects.',
    ),
  [DebugHint.CHECK_REFERENCE]: () =>
    t(
      'A referenced value was empty. Check the upstream output and the reference path.',
    ),
  [DebugHint.CHECK_CODE_NAME]: () =>
    t(
      'The code uses a variable or function that does not exist. Check the spelling; globals such as setTimeout are not available in the code sandbox.',
    ),
  [DebugHint.STEP_TIMEOUT]: () =>
    t(
      'The step ran past its time limit. Narrow the query or split the work into batches, or ask the platform administrator to raise the step time limit.',
    ),
};

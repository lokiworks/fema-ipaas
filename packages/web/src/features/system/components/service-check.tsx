import {
  OptionalServiceKind,
  ServiceCheckFailure,
  ServiceCheckRequest,
  ServiceCheckResult,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { CircleCheck, CircleX, Plug, Send } from 'lucide-react';
import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

import { serviceMeta } from '../utils/service-meta';

export function ServiceCheck({
  kind,
  check,
  testRecipient,
}: {
  kind: OptionalServiceKind;
  check: (request: ServiceCheckRequest) => Promise<ServiceCheckResult>;
  testRecipient?: string;
}) {
  const mutation = useMutation<ServiceCheckResult, Error, ServiceCheckRequest>({
    mutationFn: check,
  });
  const canMail = kind === OptionalServiceKind.SMTP && testRecipient;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={mutation.isPending}
          onClick={() => mutation.mutate({ kind })}
        >
          <Plug className="size-4" />
          {t('Test connection')}
        </Button>
        {canMail && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ kind, recipient: testRecipient })}
          >
            <Send className="size-4" />
            {t('Send test email to {email}', { email: testRecipient })}
          </Button>
        )}
      </div>
      <div aria-live="polite">
        {mutation.data && <CheckOutcome kind={kind} result={mutation.data} />}
        {mutation.isError && (
          <OutcomeLine ok={false}>
            {api.extractServerErrorMessage(
              mutation.error,
              t('The check could not be run.'),
            )}
          </OutcomeLine>
        )}
      </div>
    </div>
  );
}

export function CheckOutcome({
  kind,
  result,
}: {
  kind: OptionalServiceKind;
  result: ServiceCheckResult;
}) {
  if (result.ok) {
    return <OutcomeLine ok>{successText({ kind, result })}</OutcomeLine>;
  }
  return (
    <OutcomeLine ok={false}>
      <span className="flex flex-col gap-0.5">
        <span>
          {serviceMeta.failureHint({
            kind,
            failure: result.failure ?? ServiceCheckFailure.OTHER,
          })}
        </span>
        {result.reason && (
          <span className="break-all font-mono text-[11px] opacity-80">
            {result.reason}
          </span>
        )}
      </span>
    </OutcomeLine>
  );
}

function OutcomeLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <div
      className={`flex items-start gap-2 text-xs ${
        ok ? 'text-success-700' : 'text-destructive'
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function successText({
  kind,
  result,
}: {
  kind: OptionalServiceKind;
  result: ServiceCheckResult;
}): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return result.sentTo
        ? t(
            'A test email was sent to {email}. Check the inbox, and the spam folder if it is not there.',
            { email: result.sentTo },
          )
        : t('Connected to the mail server and signed in.');
    case OptionalServiceKind.OBJECT_STORAGE:
      return t('The bucket accepts writes, reads and deletes.');
    case OptionalServiceKind.CONNECTOR_REGISTRY:
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return t('The registry answered.');
  }
}

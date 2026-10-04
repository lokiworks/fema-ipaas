import { OptionalServiceProblem, ServiceProblemKind } from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';

export function ServiceProblem({
  problem,
}: {
  problem: OptionalServiceProblem;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span>{headline({ problem })}</span>
        <span className="break-all font-mono text-[11px] opacity-80">
          {problem.message}
        </span>
      </div>
    </div>
  );
}

function headline({ problem }: { problem: OptionalServiceProblem }): string {
  if (problem.kind === ServiceProblemKind.RECENT_FAILURE) {
    return t(
      'The last email was not delivered ({time}). Send a test email to find out why.',
      {
        time: dayjs(problem.at).format('YYYY-MM-DD HH:mm'),
      },
    );
  }
  return t(
    'The setting is invalid, so this service stays off until it is fixed and the app is restarted.',
  );
}

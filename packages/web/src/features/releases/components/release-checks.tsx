import { ReleaseCheck, ReleaseCheckLevel } from '@fema-ipaas/shared';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';

import { cn } from '@/lib/utils';

import { releaseUiUtils } from '../utils/release-ui-utils';

export function ReleaseChecks({ checks }: { checks: ReleaseCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check, index) => (
        <li
          key={`${check.code}-${check.subject}-${index}`}
          className="flex items-start gap-2 text-sm"
        >
          <CheckIcon level={check.level} />
          <span className="min-w-0 break-words">
            {releaseUiUtils.checkText(check)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CheckIcon({ level }: { level: ReleaseCheckLevel }) {
  const className = cn('size-4 shrink-0 mt-0.5', {
    'text-success': level === ReleaseCheckLevel.OK,
    'text-warning': level === ReleaseCheckLevel.WARNING,
    'text-destructive': level === ReleaseCheckLevel.ERROR,
    'text-muted-foreground': level === ReleaseCheckLevel.INFO,
  });
  switch (level) {
    case ReleaseCheckLevel.OK:
      return <CircleCheck className={className} />;
    case ReleaseCheckLevel.WARNING:
      return <CircleAlert className={className} />;
    case ReleaseCheckLevel.ERROR:
      return <CircleX className={className} />;
    case ReleaseCheckLevel.INFO:
      return <Info className={className} />;
  }
}

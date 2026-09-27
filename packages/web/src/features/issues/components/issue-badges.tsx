import { IssueSeverity, IssueStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { BellOff, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { issueUiUtils } from '../utils/issue-ui-utils';

export function IssueStatusBadge({
  status,
  reopened,
  muted,
}: {
  status: IssueStatus;
  reopened: boolean;
  muted: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={STATUS_VARIANT[status]}>
        {issueUiUtils.statusLabel(status)}
      </Badge>
      {reopened && status === IssueStatus.OPEN && (
        <Badge variant="destructive">
          <RotateCcw className="size-3" />
          {t('Reopened')}
        </Badge>
      )}
      {muted && (
        <span
          className="text-muted-foreground inline-flex"
          aria-label={t('Muted')}
          title={t('Muted')}
        >
          <BellOff className="size-3.5" />
        </span>
      )}
    </span>
  );
}

export function IssueSeverityBadge({ severity }: { severity: IssueSeverity }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]}>
      {issueUiUtils.severityLabel(severity)}
    </Badge>
  );
}

const STATUS_VARIANT: Record<
  IssueStatus,
  'destructive' | 'info' | 'success' | 'outline'
> = {
  [IssueStatus.OPEN]: 'destructive',
  [IssueStatus.INVESTIGATING]: 'info',
  [IssueStatus.RESOLVED]: 'success',
  [IssueStatus.IGNORED]: 'outline',
};

const SEVERITY_VARIANT: Record<
  IssueSeverity,
  'destructive' | 'accent' | 'outline'
> = {
  [IssueSeverity.HIGH]: 'destructive',
  [IssueSeverity.MEDIUM]: 'accent',
  [IssueSeverity.LOW]: 'outline',
};

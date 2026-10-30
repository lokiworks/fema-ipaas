import { ReplayCategory, ReplayReason } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Checkbox } from '@/components/ui/checkbox';

import { issueUiUtils } from '../utils/issue-ui-utils';

export function LikelyToFailBlock({
  reasons,
  included,
  onIncludedChange,
}: {
  reasons: ReplayReason[];
  included: boolean;
  onIncludedChange: (included: boolean) => void;
}) {
  if (reasons.length === 0) {
    return null;
  }
  const counts = reasons.reduce<Map<ReplayReason, number>>(
    (acc, reason) => new Map(acc).set(reason, (acc.get(reason) ?? 0) + 1),
    new Map(),
  );
  return (
    <div className="rounded-md border" data-testid="likely-to-fail-block">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-medium">
          {issueUiUtils.replayCategoryLabel(ReplayCategory.DATA_PROBLEM)}
        </span>
        <span className="text-sm text-muted-foreground">{reasons.length}</span>
      </div>
      <ul className="flex flex-col gap-1 px-3 py-2 text-sm text-muted-foreground">
        {[...counts.entries()].map(([reason, count]) => (
          <li key={reason} className="flex justify-between gap-2">
            <span>{issueUiUtils.replayReasonLabel(reason)}</span>
            <span>{count}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 px-3 pb-2 text-sm">
        <Checkbox
          checked={included}
          onCheckedChange={(value) => onIncludedChange(value === true)}
        />
        {t('Rerun these {count} runs anyway', { count: reasons.length })}
      </label>
      {!included && (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          {t('likelyToFailSkippedHint')}
        </p>
      )}
    </div>
  );
}

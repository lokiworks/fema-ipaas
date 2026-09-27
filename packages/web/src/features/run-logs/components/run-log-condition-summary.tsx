import {
  RunLogCondition,
  RunLogFilterState,
  runLogFilterUtils,
  RunLogMatch,
  RunLogScope,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { X } from 'lucide-react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUtils } from '@/lib/format-utils';

import { runLogUiUtils } from '../utils/run-log-ui-utils';

export function RunLogConditionSummary({
  state,
  scope,
  ignoredParams,
  connectorName,
  onRemove,
  onClear,
}: {
  state: RunLogFilterState;
  scope: RunLogScope | undefined;
  ignoredParams: string[];
  connectorName: (name: string) => string;
  onRemove: (condition: RunLogCondition) => void;
  onClear: () => void;
}) {
  const { match, complete } = runLogFilterUtils.effective(state);
  const timeLabel = state.customRange
    ? t('Logs from {from} to {to}', {
        from: formatUtils.formatDateWithTime(
          new Date(state.customRange.createdAfter),
          false,
        ),
        to: state.customRange.createdBefore
          ? formatUtils.formatDateWithTime(
              new Date(state.customRange.createdBefore),
              false,
            )
          : t('now'),
      })
    : t('{range} logs', { range: runLogUiUtils.timeRangeLabel(state.time) });
  const timeChip = (
    <Badge variant="outline" className="font-normal">
      {timeLabel}
    </Badge>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {match === RunLogMatch.ANY ? (
        <>
          {timeChip}
          <span className="text-muted-foreground">
            {t('matching any of the conditions:')}
          </span>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            {t('Matching all of the conditions:')}
          </span>
          {timeChip}
        </>
      )}
      {state.runIds.length > 0 && (
        <Badge variant="outline" className="gap-1 font-normal">
          {t('{count, plural, =1 {1 selected run} other {# selected runs}}', {
            count: state.runIds.length,
          })}
        </Badge>
      )}
      {complete.map((condition) => {
        const label = runLogUiUtils.conditionLabel({
          condition,
          scope,
          connectorName,
        });
        return (
          <Badge
            key={condition.field}
            variant="outline"
            className="max-w-80 gap-1 font-normal"
          >
            <TextWithTooltip tooltipMessage={label}>
              <span className="truncate">{label}</span>
            </TextWithTooltip>
            <button
              type="button"
              aria-label={t('Remove condition')}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(condition)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
      {ignoredParams.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {t('Invalid link parameters were ignored: {params}', {
            params: ignoredParams.join(', '),
          })}
        </span>
      )}
      {(complete.length > 0 || state.runIds.length > 0) && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={onClear}
        >
          {t('Clear conditions')}
        </Button>
      )}
    </div>
  );
}

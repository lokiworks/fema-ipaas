import { t } from 'i18next';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  CoverageEntry,
  CoverageOrigin,
  mappingCoverageUtils,
} from '../utils/mapping-coverage-utils';

export function MappingCoveragePanel({
  entries,
  valueLabelOf,
  canWrite,
  addDisabledReason,
  pendingKey,
  onAdd,
}: {
  entries: CoverageEntry[];
  valueLabelOf: (tableId: string) => string;
  canWrite: boolean;
  addDisabledReason?: string;
  pendingKey: string | null;
  onAdd: (params: { tableId: string; key: string; value: string }) => void;
}) {
  if (entries.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="mapping-coverage-empty"
      >
        {t(
          'No runs or sample data have looked up this table yet, so there is nothing to measure.',
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="mapping-coverage">
      {entries.map((entry) => (
        <CoverageEntryView
          key={entry.id}
          entry={entry}
          valueLabel={valueLabelOf(entry.tableId)}
          canWrite={canWrite}
          addDisabledReason={addDisabledReason}
          pendingKey={pendingKey}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

function CoverageEntryView({
  entry,
  valueLabel,
  canWrite,
  addDisabledReason,
  pendingKey,
  onAdd,
}: {
  entry: CoverageEntry;
  valueLabel: string;
  canWrite: boolean;
  addDisabledReason?: string;
  pendingKey: string | null;
  onAdd: (params: { tableId: string; key: string; value: string }) => void;
}) {
  const rate = mappingCoverageUtils.percent(entry);
  const full = rate === 100;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      data-testid="mapping-coverage-entry"
      data-origin={entry.origin}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{entry.title}</span>
        <Badge
          variant="outline"
          className={cn(!full && rate !== null && 'text-warning-700')}
          data-testid="mapping-coverage-rate"
        >
          {mappingCoverageUtils.summary(entry)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {entry.origin === CoverageOrigin.RUNS
          ? t(
              'Counted from the last {runs} runs of this workflow. Only keys that are visible in the masked run log are counted.',
              { runs: entry.runsScanned ?? 0 },
            )
          : t('Counted from the sample output you tested in the editor.')}
      </p>
      {entry.runsWithoutPayload > 0 && (
        <p className="text-xs text-muted-foreground">
          {t(
            '{count} runs kept no input in the log, so they are not counted.',
            { count: entry.runsWithoutPayload },
          )}
        </p>
      )}
      {entry.maskedSkipped > 0 && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="mapping-coverage-masked"
        >
          {t(
            '{count} lookups used a value that is masked in the log. They are left out of the numbers and the list below.',
            { count: entry.maskedSkipped },
          )}
        </p>
      )}
      {entry.uncovered.length === 0 && entry.total > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('Every value seen so far has a row in the table.')}
        </p>
      )}
      {entry.uncovered.map((found) => (
        <UncoveredRow
          key={found.key}
          tableId={entry.tableId}
          found={found}
          valueLabel={valueLabel}
          canWrite={canWrite}
          addDisabledReason={addDisabledReason}
          pending={pendingKey === `${entry.tableId}:${found.key}`}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

function UncoveredRow({
  tableId,
  found,
  valueLabel,
  canWrite,
  addDisabledReason,
  pending,
  onAdd,
}: {
  tableId: string;
  found: CoverageEntry['uncovered'][number];
  valueLabel: string;
  canWrite: boolean;
  addDisabledReason?: string;
  pending: boolean;
  onAdd: (params: { tableId: string; key: string; value: string }) => void;
}) {
  const [value, setValue] = useState('');
  const blocked = !canWrite || addDisabledReason !== undefined;
  return (
    <div
      className="grid grid-cols-[minmax(80px,1fr)_auto_minmax(120px,1.4fr)_auto] items-center gap-2"
      data-testid="mapping-coverage-uncovered"
    >
      <span className="truncate font-mono text-sm" title={found.key}>
        {found.key}
      </span>
      <span className="text-xs text-muted-foreground">
        {t('seen {count, plural, =1 {once} other {# times}}', {
          count: found.count,
        })}
      </span>
      <Input
        className="h-8 text-xs"
        value={value}
        disabled={blocked}
        placeholder={valueLabel}
        aria-label={`${valueLabel} · ${found.key}`}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={blocked || value.trim().length === 0 || pending}
        loading={pending}
        title={addDisabledReason}
        onClick={() => onAdd({ tableId, key: found.key, value })}
      >
        {t('Add to mapping table')}
      </Button>
    </div>
  );
}

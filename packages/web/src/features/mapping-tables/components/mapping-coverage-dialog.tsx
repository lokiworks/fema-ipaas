import { t } from 'i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { mappingTablesHooks } from '../hooks/mapping-tables-hooks';
import { CoverageEntry } from '../utils/mapping-coverage-utils';

import { MappingCoveragePanel } from './mapping-coverage-panel';
import { TableOption } from './mapping-rows';

export function MappingCoverageDialog({
  tableId,
  tables,
  entries,
  canWrite,
  onClose,
}: {
  tableId: string | null;
  tables: TableOption[];
  entries: CoverageEntry[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const {
    mutate: addRows,
    variables,
    isPending,
  } = mappingTablesHooks.useAddRows();
  const table = tables.find((candidate) => candidate.id === tableId);
  const shown = entries.filter((entry) => entry.tableId === tableId);
  const pendingKey =
    isPending && variables && tableId
      ? `${tableId}:${variables.rows[0]?.k ?? ''}`
      : null;
  return (
    <Dialog
      open={tableId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="mapping-coverage-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {t('Coverage of {name}', { name: table?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Values that recent runs and your sample data looked up but the table has no row for. Give each one its value and add it; runs pick the new row up immediately.',
            )}
          </DialogDescription>
        </DialogHeader>
        <MappingCoveragePanel
          entries={shown}
          valueLabelOf={() => table?.valueLabel ?? t('Value')}
          canWrite={canWrite}
          pendingKey={pendingKey}
          onAdd={({ key, value }) =>
            tableId !== null &&
            addRows({ id: tableId, rows: [{ k: key, v: value }] })
          }
        />
      </DialogContent>
    </Dialog>
  );
}

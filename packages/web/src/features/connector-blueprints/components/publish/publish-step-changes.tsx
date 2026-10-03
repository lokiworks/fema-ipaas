import {
  BlueprintChangeKind,
  BlueprintChangeType,
  BlueprintChangeView,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheckIcon } from 'lucide-react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import { blueprintLineDiff } from '../../utils/blueprint-line-diff';

export function BlueprintPublishChangesStep({
  changes,
  picked,
  onPickedChange,
  selectedId,
  onSelectedChange,
}: {
  changes: BlueprintChangeView[];
  picked: string[];
  onPickedChange: (ids: string[]) => void;
  selectedId: string | null;
  onSelectedChange: (id: string) => void;
}) {
  const selected =
    changes.find((change) => change.id === selectedId) ??
    changes.find((change) => picked.includes(change.id)) ??
    changes[0] ??
    null;

  if (changes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheckIcon />
          </EmptyMedia>
          <EmptyTitle>{t('No changes to publish')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'The draft is already identical to the latest published version. Modify an operation, trigger, the base URL or status codes, then come back to publish',
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    label: kindLabelOf(kind),
    items: changes.filter((change) => change.kind === kind),
  })).filter((group) => group.items.length > 0);

  const togglePicked = (id: string, checked: boolean) => {
    onPickedChange(
      checked
        ? [...picked, id]
        : picked.filter((candidate) => candidate !== id),
    );
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-96 shrink-0 flex-col gap-2 overflow-y-auto">
        <label className="flex items-center gap-2 px-1 text-sm">
          <Checkbox
            checked={
              picked.length === 0
                ? false
                : picked.length === changes.length
                ? true
                : 'indeterminate'
            }
            onCheckedChange={(checked) =>
              onPickedChange(checked ? changes.map((change) => change.id) : [])
            }
          />
          {t('Select all ({picked}/{total})', {
            picked: picked.length,
            total: changes.length,
          })}
        </label>
        {groups.map((group) => (
          <div key={group.kind} className="flex flex-col gap-1">
            <div className="px-1 text-xs font-medium text-muted-foreground">
              {group.label}
            </div>
            {group.items.map((change) => (
              <div
                key={change.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectedChange(change.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSelectedChange(change.id);
                  }
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 text-sm',
                  selected?.id === change.id
                    ? 'border-primary bg-primary/5'
                    : '',
                )}
              >
                <Checkbox
                  checked={picked.includes(change.id)}
                  onCheckedChange={(checked) =>
                    togglePicked(change.id, checked === true)
                  }
                  onClick={(event) => event.stopPropagation()}
                />
                {change.method && (
                  <Badge variant="outline" className="font-mono">
                    {change.method}
                  </Badge>
                )}
                <span className="grow truncate">{change.name}</span>
                <Badge variant={changeTypeVariant(change.change)}>
                  {changeTypeLabel(change.change)}
                </Badge>
              </div>
            ))}
          </div>
        ))}
        {picked.length === 0 && (
          <p className="px-1 text-xs text-destructive">
            {t('Select at least one change')}
          </p>
        )}
        <p className="px-1 text-xs text-muted-foreground">
          {t('Changes left unchecked stay in the draft for the next publish')}
        </p>
      </div>
      <div className="min-w-0 grow overflow-y-auto rounded-md border p-3">
        {selected && <BlueprintChangeDiff change={selected} />}
      </div>
    </div>
  );
}

function BlueprintChangeDiff({ change }: { change: BlueprintChangeView }) {
  const beforeText = change.before
    ? JSON.stringify(change.before, null, 2)
    : '';
  const afterText = change.after ? JSON.stringify(change.after, null, 2) : '';
  const diff = blueprintLineDiff.compute({
    before: beforeText,
    after: afterText,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{change.name}</span>
        <Badge variant={changeTypeVariant(change.change)}>
          {changeTypeLabel(change.change)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {kindLabelOf(change.kind)}
          {change.kind !== BlueprintChangeKind.CONFIG ? ` · ${change.key}` : ''}
        </span>
      </div>
      {change.changedFields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('Changed fields: {fields}', {
            fields: change.changedFields
              .map((field) => fieldLabelOf(field))
              .join('、'),
          })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <DiffPane
          title={t('Before (latest published version)')}
          lines={diff.before}
          empty={t('(did not exist)')}
        />
        <DiffPane
          title={t('After (current draft)')}
          lines={diff.after}
          empty={t('(removed)')}
        />
      </div>
    </div>
  );
}

function DiffPane({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: { text: string; kind: 'same' | 'added' | 'removed' }[];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="overflow-x-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <div
              key={index}
              className={cn(
                'whitespace-pre',
                line.kind === 'added' &&
                  'bg-success-100/50 text-success-700 dark:bg-success-950/50',
                line.kind === 'removed' &&
                  'bg-destructive-100/50 text-destructive-700 dark:bg-destructive-950/50',
              )}
            >
              {line.text || ' '}
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">{empty}</div>
        )}
      </div>
    </div>
  );
}

function kindLabelOf(kind: BlueprintChangeKind): string {
  switch (kind) {
    case BlueprintChangeKind.OPERATION:
      return t('Operations');
    case BlueprintChangeKind.TRIGGER:
      return t('Triggers');
    case BlueprintChangeKind.CONFIG:
      return t('Connector configuration');
  }
}

function changeTypeLabel(change: BlueprintChangeType): string {
  switch (change) {
    case BlueprintChangeType.ADD:
      return t('New change');
    case BlueprintChangeType.UPDATE:
      return t('Changed');
    case BlueprintChangeType.REMOVE:
      return t('Removed');
  }
}

function changeTypeVariant(
  change: BlueprintChangeType,
): 'success' | 'info' | 'destructive' {
  switch (change) {
    case BlueprintChangeType.ADD:
      return 'success';
    case BlueprintChangeType.UPDATE:
      return 'info';
    case BlueprintChangeType.REMOVE:
      return 'destructive';
  }
}

function fieldLabelOf(field: string): string {
  switch (field) {
    case 'name':
      return t('Name');
    case 'method':
      return t('Method');
    case 'path':
      return t('Path');
    case 'description':
      return t('Description');
    case 'group':
      return t('Group');
    case 'inputs':
      return t('Inputs');
    case 'request':
      return t('API configuration');
    case 'sample':
      return t('Sample output');
    case 'statusOverride':
    case 'status':
      return t('Status codes');
    case 'displayName':
      return t('Connector name');
    case 'baseUrl':
      return t('Base URL');
    case 'auth':
      return t('Authentication');
    case 'helpUrl':
      return t('Help documentation');
    case 'iconColor':
      return t('Icon color');
    case 'type':
      return t('Type');
    default:
      return field;
  }
}

const GROUP_ORDER = [
  BlueprintChangeKind.OPERATION,
  BlueprintChangeKind.TRIGGER,
  BlueprintChangeKind.CONFIG,
];

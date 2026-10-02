import {
  WorkflowTrigger,
  WorkflowVersionState,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  ChevronRight,
  CircleMinus,
  CirclePlus,
  PencilLine,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { LoadingSpinner } from '@/components/custom/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StepChangeKind, versionDiff } from '@/features/releases';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { versionNumbers } from './version-numbers';

export function CompareVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  leftVersionId,
  rightVersionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  leftVersionId: string | null;
  rightVersionId: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Compare versions')}</DialogTitle>
          <DialogDescription>
            {t('Pick any two versions, or the draft, to see what changed.')}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CompareVersionsBody
            key={`${leftVersionId}-${rightVersionId}`}
            workflowId={workflowId}
            initialLeft={leftVersionId}
            initialRight={rightVersionId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompareVersionsBody({
  workflowId,
  initialLeft,
  initialRight,
}: {
  workflowId: string;
  initialLeft: string | null;
  initialRight: string | null;
}) {
  const { data: versionsPage } =
    workflowHooks.useListWorkflowVersions(workflowId);
  const versions = versionsPage?.data ?? [];
  const numbers = useMemo(
    () => versionNumbers.numberVersions(versions),
    [versions],
  );
  const [left, setLeft] = useState<string | null>(initialLeft);
  const [right, setRight] = useState<string | null>(initialRight);
  const leftId = left ?? versions[1]?.id ?? null;
  const rightId = right ?? versions[0]?.id ?? null;
  const leftQuery = useVersion({ workflowId, versionId: leftId });
  const rightQuery = useVersion({ workflowId, versionId: rightId });
  const optionLabel = (id: string) => {
    const version = versions.find((candidate) => candidate.id === id);
    if (!version) {
      return id;
    }
    const label =
      version.state === WorkflowVersionState.DRAFT
        ? t('Draft')
        : versionNumbers.label({ numbers, versionId: id }) ?? '';
    return `${label} · ${formatUtils.formatDate(new Date(version.created))}`;
  };

  const changes =
    leftQuery.data && rightQuery.data
      ? versionDiff.diffSteps({
          before: leftQuery.data.trigger,
          after: rightQuery.data.trigger,
        })
      : [];
  const workflowChanges =
    leftQuery.data && rightQuery.data
      ? versionDiff.workflowChanges({
          before: leftQuery.data,
          after: rightQuery.data,
        })
      : [];
  const isLoading = leftQuery.isLoading || rightQuery.isLoading;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <VersionSelect
          label={t('Before')}
          value={leftId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setLeft}
        />
        <VersionSelect
          label={t('After')}
          value={rightId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setRight}
        />
      </div>
      {isLoading ? (
        <div className="flex py-10">
          <LoadingSpinner />
        </div>
      ) : changes.length === 0 && workflowChanges.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {t('These two versions have the same steps and settings.')}
        </p>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-1">
            {workflowChanges.length > 0 && (
              <StepChangeRow
                kind={StepChangeKind.MODIFIED}
                displayName={t('Workflow')}
                fields={workflowChanges}
              />
            )}
            {changes.map((change) => (
              <StepChangeRow
                key={`${change.kind}-${change.name}`}
                kind={change.kind}
                displayName={change.displayName}
                fields={versionDiff.fieldChanges({
                  before: stepOf({
                    trigger: leftQuery.data?.trigger,
                    name: change.name,
                  }),
                  after: stepOf({
                    trigger: rightQuery.data?.trigger,
                    name: change.name,
                  }),
                })}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function StepChangeRow({
  kind,
  displayName,
  fields,
}: {
  kind: StepChangeKind;
  displayName: string;
  fields: { path: string; before: string | null; after: string | null }[];
}) {
  const [expanded, setExpanded] = useState(kind === StepChangeKind.MODIFIED);
  const Icon = KIND_ICONS[kind];
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <Icon className={cn('size-3.5', KIND_COLORS[kind])} />
        <span className="font-medium">{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABELS[kind]()}
        </span>
      </button>
      {expanded && fields.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 border-t px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {t('Field')}
          </span>
          <span className="font-medium text-muted-foreground">
            {t('Before')}
          </span>
          <span className="font-medium text-muted-foreground">
            {t('After')}
          </span>
          {fields.map((field) => (
            <FieldRow key={field.path} field={field} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
}: {
  field: { path: string; before: string | null; after: string | null };
}) {
  return (
    <>
      <span className="break-all font-mono">{field.path}</span>
      <span className="break-all text-destructive">{field.before ?? '—'}</span>
      <span className="break-all text-success-700">{field.after ?? '—'}</span>
    </>
  );
}

function VersionSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  optionLabel: (id: string) => string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('Choose a version')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((id) => (
            <SelectItem key={id} value={id}>
              {optionLabel(id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function useVersion({
  workflowId,
  versionId,
}: {
  workflowId: string;
  versionId: string | null;
}) {
  return useQuery({
    queryKey: ['workflow-version-compare', workflowId, versionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflowId, {
          versionId: versionId ?? undefined,
        })
      ).version,
    enabled: versionId !== null,
  });
}

function stepOf({
  trigger,
  name,
}: {
  trigger: WorkflowTrigger | undefined;
  name: string;
}) {
  if (!trigger) {
    return null;
  }
  return workflowStructureUtil.getStep(name, trigger) ?? null;
}

const KIND_ICONS = {
  [StepChangeKind.ADDED]: CirclePlus,
  [StepChangeKind.MODIFIED]: PencilLine,
  [StepChangeKind.REMOVED]: CircleMinus,
};

const KIND_COLORS = {
  [StepChangeKind.ADDED]: 'text-success-700',
  [StepChangeKind.MODIFIED]: 'text-primary',
  [StepChangeKind.REMOVED]: 'text-destructive',
};

const KIND_LABELS = {
  [StepChangeKind.ADDED]: () => t('Added'),
  [StepChangeKind.MODIFIED]: () => t('Modified'),
  [StepChangeKind.REMOVED]: () => t('Removed'),
};

import {
  MappingCoverageSource,
  MappingSpec,
  MappingTarget,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { Maximize2, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { MappingModel, useMappingModel } from '../hooks/mapping-editor-model';
import { TargetOption } from '../utils/target-schema';

import { AutoMappingButton } from './auto-mapping-dialog';
import { MappingCoverageDialog } from './mapping-coverage-dialog';
import { MappingJsonPreview } from './mapping-json-preview';
import {
  MappingRowCard,
  MappingRowLayout,
  SourceInputParams,
} from './mapping-rows';
import { MappingTargetPicker } from './mapping-target-picker';
import { MappingWideEditor } from './mapping-wide-editor';

export function MappingEditor({
  value,
  onChange,
  disabled,
  sampleData,
  targetOptions,
  runCoverage = NO_COVERAGE,
  canEditTables = false,
  expanded,
  onExpandedChange,
  renderSourceInput,
  renderSourcePanel,
  renderAddTarget,
}: {
  value: unknown;
  onChange: (value: MappingSpec) => void;
  disabled: boolean;
  sampleData: Record<string, unknown>;
  targetOptions: TargetOption[];
  runCoverage?: MappingCoverageSource[];
  canEditTables?: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
  renderSourcePanel?: () => React.ReactNode;
  renderAddTarget?: (params: AddTargetSlotParams) => React.ReactNode;
}) {
  const projectId = authenticationSession.getProjectId();
  const model = useMappingModel({
    value,
    onChange,
    sampleData,
    projectId,
    runCoverage,
  });
  const [addTargetOpen, setAddTargetOpen] = useState(false);
  const [coverageTableId, setCoverageTableId] = useState<string | null>(null);
  const hasSample = Object.keys(sampleData).length > 0;
  const body = (layout: MappingRowLayout) => (
    <MappingBody
      model={model}
      layout={layout}
      projectId={projectId}
      disabled={disabled}
      sampleData={sampleData}
      targetOptions={targetOptions}
      canAddTarget={renderAddTarget !== undefined}
      renderSourceInput={renderSourceInput}
      onExpand={() => onExpandedChange(true)}
      onAddTarget={() => setAddTargetOpen(true)}
      onOpenCoverage={setCoverageTableId}
    />
  );
  return (
    <div className="@container flex flex-col gap-3">
      {expanded ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
          <span className="text-xs text-muted-foreground">
            {t('The mapping is open in the wide editor.')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onExpandedChange(false)}
          >
            {t('Back to the compact view')}
          </Button>
        </div>
      ) : (
        body(MappingRowLayout.COMPACT)
      )}
      <MappingWideEditor
        open={expanded}
        onOpenChange={onExpandedChange}
        jsonPreview={
          <MappingJsonPreview
            spec={model.spec}
            preview={model.preview}
            hasSample={hasSample}
          />
        }
        sidePanel={renderSourcePanel?.()}
      >
        {expanded && body(MappingRowLayout.WIDE)}
      </MappingWideEditor>
      {renderAddTarget?.({
        open: addTargetOpen,
        onOpenChange: setAddTargetOpen,
        onCreated: (destination) => model.patchSpec({ destination }),
      })}
      <MappingCoverageDialog
        tableId={coverageTableId}
        tables={model.tableOptions}
        entries={model.coverage}
        canWrite={canEditTables}
        onClose={() => setCoverageTableId(null)}
      />
    </div>
  );
}

function MappingBody({
  model,
  layout,
  projectId,
  disabled,
  sampleData,
  targetOptions,
  canAddTarget,
  renderSourceInput,
  onExpand,
  onAddTarget,
  onOpenCoverage,
}: {
  model: MappingModel;
  layout: MappingRowLayout;
  projectId: string | null;
  disabled: boolean;
  sampleData: Record<string, unknown>;
  targetOptions: TargetOption[];
  canAddTarget: boolean;
  renderSourceInput: (params: SourceInputParams) => React.ReactNode;
  onExpand: () => void;
  onAddTarget: () => void;
  onOpenCoverage: (tableId: string) => void;
}) {
  const { spec, preview, entries, visible, hiddenCount, problems } = model;
  const wide = layout === MappingRowLayout.WIDE;
  return (
    <div className="flex flex-col gap-3">
      <MappingTargetPicker
        value={spec.destination}
        options={targetOptions}
        disabled={disabled}
        onChange={(destination) => model.patchSpec({ destination })}
        onAddRequested={canAddTarget && !disabled ? onAddTarget : undefined}
      />
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'text-xs text-muted-foreground',
            problems > 0 && 'text-destructive',
          )}
          data-testid="mapping-summary"
        >
          {spec.destination
            ? t('{mapped} of {total} fields mapped · {problems} problems', {
                mapped: model.mappedCount,
                total: entries.filter((entry) => entry.field !== null).length,
                problems,
              })
            : t('{fields} fields mapped · {errors} problems', {
                fields: spec.fields.filter(
                  (row) => row.target.trim().length > 0,
                ).length,
                errors: problems,
              })}
        </div>
        {!wide && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="mapping-expand"
            onClick={onExpand}
          >
            <Maximize2 className="size-4 mr-1" />
            {t('Expand')}
          </Button>
        )}
      </div>
      {wide && (
        <div
          className="hidden grid-cols-[minmax(140px,0.9fr)_minmax(200px,1.4fr)_minmax(220px,1.7fr)] gap-x-4 px-3 text-xs font-medium text-muted-foreground @xl:grid"
          data-testid="mapping-wide-columns"
        >
          <span>{t('Target field')}</span>
          <span>{t('Transform')}</span>
          <span>{t('Source')}</span>
        </div>
      )}
      {visible.map((entry) => {
        const rowId = entry.row?.id ?? null;
        const rowResult = preview.rows.find(
          (candidate) => candidate.id === rowId,
        );
        const rowIssues = preview.issues.filter((found) =>
          entry.row === null
            ? found.rowId === null && found.target === entry.field?.name
            : found.rowId === rowId,
        );
        return (
          <MappingRowCard
            key={entry.key}
            entry={entry}
            layout={layout}
            disabled={disabled}
            issues={rowIssues}
            value={rowResult?.value}
            hasPreview={rowResult !== undefined}
            sampleData={sampleData}
            tables={model.tableOptions}
            tableData={model.tableData}
            coverage={model.coverage}
            renderSourceInput={renderSourceInput}
            onPatch={(patch) => model.updateEntry({ entry, patch })}
            onRemove={() => rowId !== null && model.removeRow(rowId)}
            onOpenCoverage={onOpenCoverage}
          />
        );
      })}
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => model.setShowAll(true)}
        >
          {t('Show {count} optional fields', { count: hiddenCount })}
        </Button>
      )}
      {model.showAll && hiddenCount === 0 && spec.destination !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => model.setShowAll(false)}
        >
          {t('Hide unmapped optional fields')}
        </Button>
      )}
      {spec.destination === undefined && spec.fields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'Pick the step this data is written to, or add fields by hand. Each field takes its value from an earlier step or a fixed value.',
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {spec.destination === undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={model.addRow}
          >
            <Plus className="size-4 mr-1" />
            {t('Add field')}
          </Button>
        )}
        {projectId && (
          <AutoMappingButton
            projectId={projectId}
            targets={model.autoTargets}
            sampleData={sampleData}
            disabled={disabled}
            onApply={model.applySuggestions}
          />
        )}
      </div>
      {!disabled && (
        <p className="text-xs text-muted-foreground">
          {t(
            'In a source input, press Alt+Shift+R to pick an upstream step and field with the keyboard.',
          )}
        </p>
      )}
      {!wide && preview.rows.length > 0 && (
        <details className="rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t('Preview result')}
          </summary>
          <pre
            className="mt-2 max-h-60 overflow-auto font-mono break-all whitespace-pre-wrap"
            data-testid="mapping-result-json"
          >
            {JSON.stringify(preview.value, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

const NO_COVERAGE: MappingCoverageSource[] = [];

export type { SourceInputParams } from './mapping-rows';

export type AddTargetSlotParams = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (destination: MappingTarget) => void;
};

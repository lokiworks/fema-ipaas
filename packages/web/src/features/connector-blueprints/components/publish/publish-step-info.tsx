import {
  BLUEPRINT_LIMITS,
  BlueprintChangeType,
  BlueprintChangeView,
  BlueprintChangeKind,
  BlueprintPublishMode,
  BlueprintRollout,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function BlueprintPublishInfoStep({
  chosenChanges,
  mode,
  onModeChange,
  canUpdateCurrent,
  patchReason,
  version,
  onVersionChange,
  versionError,
  maxVersionDisplay,
  rollout,
  onRolloutChange,
  canaryProjectIds,
  onCanaryProjectIdsChange,
  canaryError,
  projects,
  description,
  onDescriptionChange,
  descriptionTouched,
  onDescriptionTouched,
  descriptionError,
}: {
  chosenChanges: BlueprintChangeView[];
  mode: BlueprintPublishMode;
  onModeChange: (mode: BlueprintPublishMode) => void;
  canUpdateCurrent: boolean;
  patchReason: string;
  version: string;
  onVersionChange: (version: string) => void;
  versionError: string;
  maxVersionDisplay: string;
  rollout: BlueprintRollout;
  onRolloutChange: (rollout: BlueprintRollout) => void;
  canaryProjectIds: string[];
  onCanaryProjectIdsChange: (ids: string[]) => void;
  canaryError: string;
  projects: { id: string; name: string }[];
  description: string;
  onDescriptionChange: (description: string) => void;
  descriptionTouched: boolean;
  onDescriptionTouched: () => void;
  descriptionError: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {t('This publish includes {count} changes: {summary}', {
          count: chosenChanges.length,
          summary: chosenChanges
            .map((change) => changeSummaryOf(change))
            .join(', '),
        })}
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">{t('Publish type')}</label>
        <RadioGroup
          value={mode}
          onValueChange={(value) => onModeChange(value as BlueprintPublishMode)}
          className="grid grid-cols-2 gap-3"
        >
          <ModeCard
            value={BlueprintPublishMode.NEW_VERSION}
            selected={mode === BlueprintPublishMode.NEW_VERSION}
            title={t('Publish a new version')}
            description={t(
              'Nodes need to switch to the new version before they use these changes',
            )}
            disabled={false}
            disabledReason=""
          />
          <ModeCard
            value={BlueprintPublishMode.UPDATE_CURRENT}
            selected={mode === BlueprintPublishMode.UPDATE_CURRENT}
            title={t('Publish an update in the current version')}
            description={
              canUpdateCurrent
                ? t(
                    'The update ships as a patch. Newly added nodes pick it up automatically, while already-published workflows keep the exact version they were published with',
                  )
                : patchReason
            }
            disabled={!canUpdateCurrent}
            disabledReason={patchReason}
          />
        </RadioGroup>
      </div>

      {mode === BlueprintPublishMode.NEW_VERSION && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Version number')}</label>
            <Input
              className="w-40 font-mono"
              value={version}
              onChange={(event) => onVersionChange(event.target.value)}
              aria-invalid={!!versionError}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Two-part version number, e.g. 1.3. Highest published version so far: {version}',
                { version: maxVersionDisplay },
              )}
            </p>
            {versionError && (
              <p className="text-xs text-destructive">{versionError}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t('Rollout')}</label>
            <RadioGroup
              value={rollout}
              onValueChange={(value) =>
                onRolloutChange(value as BlueprintRollout)
              }
              className="flex flex-row gap-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={BlueprintRollout.FULL} />
                {t('Full release')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={BlueprintRollout.CANARY} />
                {t('Canary rollout')}
              </label>
            </RadioGroup>
          </div>
          {rollout === BlueprintRollout.CANARY && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                {t('Canary projects')}
              </label>
              <MultiSelect
                value={canaryProjectIds}
                onValueChange={onCanaryProjectIdsChange}
                items={projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
              >
                <MultiSelectTrigger>
                  <MultiSelectValue placeholder={t('Select projects')} />
                </MultiSelectTrigger>
                <MultiSelectContent>
                  <MultiSelectSearch placeholder={t('Search...')} />
                  <MultiSelectList>
                    <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
                    {projects.map((project) => (
                      <MultiSelectItem key={project.id} value={project.id}>
                        {project.name}
                      </MultiSelectItem>
                    ))}
                  </MultiSelectList>
                </MultiSelectContent>
              </MultiSelect>
              <p className="text-xs text-muted-foreground">
                {t(
                  'These projects use {version} by default for newly added nodes. Other projects keep using the current version',
                  { version: version || t('the new version') },
                )}
              </p>
              {canaryError && (
                <p className="text-xs text-destructive">{canaryError}</p>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">
          {t('Version description')}
        </label>
        <Textarea
          value={description}
          rows={4}
          maxLength={BLUEPRINT_LIMITS.versionDescription}
          placeholder={t(
            'Describe which operations or triggers were added or changed',
          )}
          onChange={(event) => onDescriptionChange(event.target.value)}
          onBlur={onDescriptionTouched}
          aria-invalid={descriptionTouched && !!descriptionError}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            'Shown in the version history and in the version switcher on the node panel',
          )}
        </p>
        {descriptionTouched && descriptionError && (
          <p className="text-xs text-destructive">{descriptionError}</p>
        )}
      </div>
    </div>
  );
}

function ModeCard({
  value,
  selected,
  title,
  description,
  disabled,
  disabledReason,
}: {
  value: BlueprintPublishMode;
  selected: boolean;
  title: string;
  description: string;
  disabled: boolean;
  disabledReason: string;
}) {
  const card = (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-md border p-3',
        selected && 'border-primary bg-primary/5',
        disabled && 'opacity-60',
      )}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <RadioGroupItem value={value} disabled={disabled} />
        {title}
      </label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
  if (!disabled) {
    return card;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="tooltip-wrapper">{card}</div>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function changeSummaryOf(change: BlueprintChangeView): string {
  return t('{change} {kind} "{name}"', {
    change: changeTypeLabelOf(change),
    kind: kindLabelOf(change),
    name: change.name,
  });
}

function changeTypeLabelOf(change: BlueprintChangeView): string {
  switch (change.change) {
    case BlueprintChangeType.ADD:
      return t('added');
    case BlueprintChangeType.UPDATE:
      return t('updated');
    case BlueprintChangeType.REMOVE:
      return t('removed');
  }
}

function kindLabelOf(change: BlueprintChangeView): string {
  switch (change.kind) {
    case BlueprintChangeKind.OPERATION:
      return t('operation');
    case BlueprintChangeKind.TRIGGER:
      return t('trigger');
    case BlueprintChangeKind.CONFIG:
      return t('connector configuration');
  }
}

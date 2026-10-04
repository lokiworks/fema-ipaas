import { MappingFieldType, MappingTransform } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { aiHooks, ModelConnectionSelect } from '@/features/ai';

import {
  autoMapping,
  MappingSuggestion,
  MappingSuggestionBasis,
} from '../utils/auto-mapping';

export function AutoMappingButton({
  projectId,
  targets,
  sampleData,
  disabled,
  onApply,
}: AutoMappingButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || targets.length === 0}
        title={
          targets.length === 0
            ? t('Write target fields and leave their source empty first.')
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4 mr-1" />
        {t('AI auto-mapping')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          {open && (
            <AutoMappingContent
              projectId={projectId}
              targets={targets}
              sampleData={sampleData}
              onApply={(suggestions) => {
                onApply(suggestions);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AutoMappingContent({
  projectId,
  targets,
  sampleData,
  onApply,
  onCancel,
}: AutoMappingContentProps) {
  const sources = autoMapping.flattenSources({ sampleData });
  const targetNames = targets.map((target) => target.name);
  const labels = Object.fromEntries(
    targets.map((target) => [target.name, target.label]),
  );
  const byName = autoMapping.suggestByName({
    targets: targetNames,
    sources,
    labels,
  });
  const [byModel, setByModel] = useState<MappingSuggestion[]>([]);
  const suggestions = autoMapping.merge({ byName, byModel });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const models = aiHooks.useModelSelection(projectId);
  const {
    mutate: suggest,
    isPending,
    data,
  } = aiHooks.useSuggestFieldMapping({
    onError: (message) => toast.error(message),
  });
  const toggle = ({ target, value }: { target: string; value: boolean }) =>
    setChecked(withMembership({ set: checked, key: target, present: value }));
  const selected = suggestions.filter((suggestion) =>
    checked.has(suggestion.target),
  );
  const sourceOf = (path: string) =>
    sources.find((source) => source.path === path);
  const withTransforms = (suggestion: MappingSuggestion) => {
    const source = sourceOf(suggestion.sourcePath);
    return {
      ...suggestion,
      transforms: autoMapping.coercion({
        targetType: targets.find((target) => target.name === suggestion.target)
          ?.type,
        valueType: source?.valueType ?? 'other',
        sample: source?.sample ?? '',
      }),
    };
  };
  const hasModel = models.connections.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('AI auto-mapping')}</DialogTitle>
        <DialogDescription>
          {t(
            'Suggestions come from field names in the sample data and say why. Nothing is selected for you: tick the ones you want, apply them, then check the preview.',
          )}
        </DialogDescription>
      </DialogHeader>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'Test the earlier steps first so there is sample data to map from.',
          )}
        </p>
      ) : (
        <>
          {!models.isLoading && !hasModel && (
            <p className="text-xs text-muted-foreground">
              {t(
                'No model connection in this project, so these suggestions use field-name rules only. Map the rest by hand, or add a model connection to let a model suggest more.',
              )}
            </p>
          )}
          {hasModel && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ModelConnectionSelect
                  connections={models.connections}
                  isLoading={models.isLoading}
                  value={models.selectedId}
                  onChange={models.select}
                />
              </div>
              {models.selectedId && (
                <Button
                  type="button"
                  variant="outline"
                  loading={isPending}
                  onClick={() =>
                    suggest(
                      {
                        projectId,
                        modelConnectionExternalId: models.selectedId ?? '',
                        targets: targetNames,
                        sources: sources.map((source) => ({
                          path: source.path,
                          sample: source.sample,
                        })),
                      },
                      {
                        onSuccess: (response) =>
                          setByModel(
                            response.suggestions.map((suggestion) => ({
                              ...suggestion,
                              basis: MappingSuggestionBasis.MODEL,
                            })),
                          ),
                      },
                    )
                  }
                >
                  {t('Ask the model')}
                </Button>
              )}
            </div>
          )}
          {data && (
            <span className="text-xs text-muted-foreground">
              {t('Tokens: {input} in · {output} out', {
                input: data.inputTokens,
                output: data.outputTokens,
              })}
            </span>
          )}
          <div className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border">
            {targets.map((target) => {
              const suggestion = suggestions.find(
                (item) => item.target === target.name,
              );
              return (
                <div
                  key={target.name}
                  className="flex items-start gap-3 p-3"
                  data-testid={`auto-mapping-${target.name}`}
                >
                  <Checkbox
                    disabled={!suggestion}
                    checked={checked.has(target.name)}
                    aria-label={target.name}
                    onCheckedChange={(value) =>
                      toggle({ target: target.name, value: value === true })
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-mono text-sm">
                      {target.label.length > 0
                        ? `${target.label} · ${target.name}`
                        : target.name}
                    </span>
                    {suggestion ? (
                      <>
                        <span className="truncate font-mono text-xs">
                          ← {suggestion.sourcePath}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t('Basis')}: {basisText(suggestion.basis)} ·{' '}
                          {t('Sample')}:{' '}
                          {sourceOf(suggestion.sourcePath)?.sample ?? ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('No suggestion')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onApply(selected.map(withTransforms))}
        >
          {t('Apply {count}', { count: selected.length })}
        </Button>
      </DialogFooter>
    </div>
  );
}

function basisText(basis: MappingSuggestionBasis | undefined): string {
  switch (basis) {
    case MappingSuggestionBasis.SAME_NAME:
      return t('same field name');
    case MappingSuggestionBasis.SYNONYM:
      return t('same meaning, different name');
    case MappingSuggestionBasis.SIMILAR_NAME:
      return t('similar field name');
    default:
      return t('suggested by the model from names and samples');
  }
}

function withMembership({
  set,
  key,
  present,
}: {
  set: Set<string>;
  key: string;
  present: boolean;
}): Set<string> {
  const next = new Set(set);
  if (present) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

type AutoMappingButtonProps = {
  projectId: string;
  targets: AutoMappingTarget[];
  sampleData: Record<string, unknown>;
  disabled: boolean;
  onApply: (suggestions: AppliedSuggestion[]) => void;
};

type AutoMappingContentProps = {
  projectId: string;
  targets: AutoMappingTarget[];
  sampleData: Record<string, unknown>;
  onApply: (suggestions: AppliedSuggestion[]) => void;
  onCancel: () => void;
};

export type AutoMappingTarget = {
  name: string;
  label: string;
  type: MappingFieldType | undefined;
};

export type AppliedSuggestion = MappingSuggestion & {
  transforms: MappingTransform[];
};

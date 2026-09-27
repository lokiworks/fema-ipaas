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
import { cn } from '@/lib/utils';

import {
  AUTO_MAPPING_DEFAULT_THRESHOLD,
  autoMapping,
  MappingSuggestion,
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
  const byName = autoMapping.suggestByName({ targets, sources });
  const [byModel, setByModel] = useState<MappingSuggestion[]>([]);
  const suggestions = autoMapping.merge({ byName, byModel });
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const models = aiHooks.useModelSelection(projectId);
  const {
    mutate: suggest,
    isPending,
    data,
  } = aiHooks.useSuggestFieldMapping({
    onError: (message) => toast.error(message),
  });
  const isSelected = (suggestion: MappingSuggestion): boolean =>
    checked.has(suggestion.target) ||
    (suggestion.confidence >= AUTO_MAPPING_DEFAULT_THRESHOLD &&
      !unchecked.has(suggestion.target));
  const toggle = ({ target, value }: { target: string; value: boolean }) => {
    setChecked(withMembership({ set: checked, key: target, present: value }));
    setUnchecked(
      withMembership({ set: unchecked, key: target, present: !value }),
    );
  };
  const selected = suggestions.filter(isSelected);
  const sampleOf = (path: string) =>
    sources.find((source) => source.path === path)?.sample ?? '';

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('AI auto-mapping')}</DialogTitle>
        <DialogDescription>
          {t(
            'Suggestions come from field names in the sample data; a model can fill in the rest. Suggestions with confidence below 80% are not selected by default.',
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
                      targets,
                      sources,
                    },
                    {
                      onSuccess: (response) => setByModel(response.suggestions),
                    },
                  )
                }
              >
                {t('Ask the model')}
              </Button>
            )}
          </div>
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
                (item) => item.target === target,
              );
              return (
                <div key={target} className="flex items-start gap-3 p-3">
                  <Checkbox
                    disabled={!suggestion}
                    checked={suggestion ? isSelected(suggestion) : false}
                    onCheckedChange={(value) =>
                      toggle({ target, value: value === true })
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-mono text-sm">{target}</span>
                    {suggestion ? (
                      <>
                        <span className="truncate font-mono text-xs">
                          ← {suggestion.sourcePath}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {sampleOf(suggestion.sourcePath)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('No suggestion')}
                      </span>
                    )}
                  </div>
                  {suggestion && (
                    <span
                      className={cn(
                        'shrink-0 text-xs',
                        suggestion.confidence <
                          AUTO_MAPPING_DEFAULT_THRESHOLD && 'text-warning-700',
                      )}
                    >
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  )}
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
          onClick={() => onApply(selected)}
        >
          {t('Apply {count}', { count: selected.length })}
        </Button>
      </DialogFooter>
    </div>
  );
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
  targets: string[];
  sampleData: Record<string, unknown>;
  disabled: boolean;
  onApply: (suggestions: MappingSuggestion[]) => void;
};

type AutoMappingContentProps = {
  projectId: string;
  targets: string[];
  sampleData: Record<string, unknown>;
  onApply: (suggestions: MappingSuggestion[]) => void;
  onCancel: () => void;
};

import { ParallelAction } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MINIMUM_BRANCHES = 2;

const ParallelSettings = React.memo(({ readonly }: { readonly: boolean }) => {
  const form = useFormContext<ParallelAction>();
  const branches = form.watch('settings.branches') ?? [];

  const setBranches = (next: { branchName: string }[]) => {
    form.setValue('settings.branches', next, { shouldValidate: true });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm">{t('Branches')}</Label>
        <span className="text-xs text-muted-foreground">
          {t(
            'Every branch runs at the same time. The workflow continues once all of them finish.',
          )}
        </span>
      </div>

      {branches.map((branch, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={branch.branchName}
            disabled={readonly}
            onChange={(event) =>
              setBranches(
                branches.map((current, position) =>
                  position === index
                    ? { ...current, branchName: event.target.value }
                    : current,
                ),
              )
            }
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={readonly || branches.length <= MINIMUM_BRANCHES}
            onClick={() =>
              setBranches(
                branches.filter((_current, position) => position !== index),
              )
            }
            aria-label={t('Remove branch')}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}

      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={readonly}
          onClick={() =>
            setBranches([
              ...branches,
              { branchName: `${t('Branch')} ${branches.length + 1}` },
            ])
          }
        >
          <PlusIcon className="mr-1 size-3.5" />
          {t('Add branch')}
        </Button>
      </div>
    </div>
  );
});

ParallelSettings.displayName = 'ParallelSettings';
export { ParallelSettings };

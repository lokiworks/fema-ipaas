import { BLUEPRINT_LIMITS, BlueprintTrigger } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function TriggerBasicTab({
  trigger,
  onUpdate,
  isPending,
}: {
  trigger: BlueprintTrigger;
  onUpdate: (patch: Partial<BlueprintTrigger>) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trigger.name);
  const [description, setDescription] = useState(trigger.description);
  const nameValid =
    name.trim().length > 0 && name.length <= BLUEPRINT_LIMITS.name;

  const startEdit = () => {
    setName(trigger.name);
    setDescription(trigger.description);
    setEditing(true);
  };
  const save = () => {
    if (!nameValid) {
      return;
    }
    onUpdate({ name: name.trim(), description: description.trim() });
    setEditing(false);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('Basic information')}</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!nameValid}
              loading={isPending}
              onClick={save}
            >
              {t('Save')}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={startEdit}>
            {t('Edit')}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Trigger name')}</label>
            <Input
              value={name}
              maxLength={BLUEPRINT_LIMITS.name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {t('Unique identifier')}
            </label>
            <Input
              className="font-mono"
              value={trigger.key}
              readOnly
              disabled
            />
            <p className="text-xs text-muted-foreground">
              {t('Cannot be changed after creation')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Description')}</label>
            <Textarea
              rows={2}
              value={description}
              maxLength={BLUEPRINT_LIMITS.operationDescription}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('Trigger name')}</dt>
          <dd>{trigger.name}</dd>
          <dt className="text-muted-foreground">{t('Unique identifier')}</dt>
          <dd className="font-mono">{trigger.key}</dd>
          <dt className="text-muted-foreground">{t('Description')}</dt>
          <dd className={cn(!trigger.description && 'text-muted-foreground')}>
            {trigger.description || t('Not filled in yet')}
          </dd>
        </dl>
      )}
    </div>
  );
}

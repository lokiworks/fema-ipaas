import {
  BLUEPRINT_LIMITS,
  BlueprintAuthType,
  BlueprintOperation,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { blueprintWorkspaceUtils } from '../../utils/blueprint-workspace-utils';

export function OperationBasicTab({
  detail,
  operation,
  onUpdate,
  isPending,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
  onUpdate: (patch: Partial<BlueprintOperation>) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(operation.name);
  const [description, setDescription] = useState(operation.description);
  const [group, setGroup] = useState(operation.group);
  const groups = blueprintWorkspaceUtils.groupNames(detail.definition);
  const auth = detail.definition.auth;

  const startEdit = () => {
    setName(operation.name);
    setDescription(operation.description);
    setGroup(operation.group);
    setEditing(true);
  };
  const nameValid =
    name.trim().length > 0 && name.length <= BLUEPRINT_LIMITS.name;
  const invalid = !nameValid;
  const save = () => {
    if (invalid) {
      return;
    }
    onUpdate({
      name: name.trim(),
      description: description.trim(),
      group: group.trim(),
    });
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
              disabled={invalid}
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
            <label className="text-sm font-medium">
              {t('Operation display name')}
            </label>
            <Input
              value={name}
              maxLength={BLUEPRINT_LIMITS.name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {t('Operation identifier')}
            </label>
            <Input
              className="font-mono"
              value={operation.key}
              readOnly
              disabled
            />
            <p className="text-xs text-muted-foreground">
              {t('Cannot be changed after creation')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {t('Operation description')}
            </label>
            <Textarea
              rows={2}
              value={description}
              maxLength={BLUEPRINT_LIMITS.operationDescription}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Group')}</label>
            <Input
              value={group}
              maxLength={BLUEPRINT_LIMITS.group}
              placeholder={t('Ungrouped')}
              onChange={(event) => setGroup(event.target.value)}
            />
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {groups.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setGroup(candidate)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs',
                      group === candidate && 'border-primary text-primary',
                    )}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">
            {t('Operation display name')}
          </dt>
          <dd>{operation.name}</dd>
          <dt className="text-muted-foreground">{t('Operation identifier')}</dt>
          <dd className="font-mono">{operation.key}</dd>
          <dt className="text-muted-foreground">
            {t('Operation description')}
          </dt>
          <dd className={cn(!operation.description && 'text-muted-foreground')}>
            {operation.description || t('Not filled in yet')}
          </dd>
          <dt className="text-muted-foreground">{t('Group')}</dt>
          <dd>{operation.group || t('Ungrouped')}</dd>
          <dt className="text-muted-foreground">{t('Authentication')}</dt>
          <dd>
            {auth && auth.enabled
              ? t('Uses the connector authentication {name} ({type})', {
                  name: auth.name,
                  type: authTypeLabel(auth.type),
                })
              : t('No authentication')}
          </dd>
        </dl>
      )}
    </div>
  );
}

function authTypeLabel(type: BlueprintAuthType): string {
  switch (type) {
    case BlueprintAuthType.AUTHORIZATION_CODE:
      return t('Authorization code');
    case BlueprintAuthType.CLIENT_CREDENTIALS:
      return t('Client credentials');
    case BlueprintAuthType.API_KEY:
      return t('API key');
    case BlueprintAuthType.BASIC_AUTH:
      return t('Basic auth');
  }
}

import {
  BLUEPRINT_ICON_COLORS,
  BLUEPRINT_LIMITS,
  blueprintRules,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';
import { blueprintIconUtils } from '../../utils/blueprint-icon-utils';

export function BlueprintBasicSection({
  detail,
}: {
  detail: ConnectorBlueprintDetail;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('Basic information')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Name, description and developers take effect immediately. Base URL changes join the next published version',
          )}
        </p>
      </div>
      <IdentityCard detail={detail} />
      <BaseUrlCard detail={detail} />
      <DevelopersCard detail={detail} />
      <section className="flex flex-col gap-1 rounded-md border p-4">
        <h2 className="font-medium">{t('Availability')}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'Once published, every member of this tenant who can use connectors can add it to workflows. Limiting it to specific members or departments and English names are not supported yet.',
          )}
        </p>
      </section>
    </div>
  );
}

function IdentityCard({ detail }: { detail: ConnectorBlueprintDetail }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(detail.displayName);
  const [description, setDescription] = useState(detail.description);
  const [helpUrl, setHelpUrl] = useState(detail.definition.helpUrl);
  const [iconColor, setIconColor] = useState(detail.iconColor);
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onSuccess: () => setEditing(false),
    });

  const helpUrlValid =
    helpUrl.trim().length === 0 || blueprintRules.isHttpUrl(helpUrl);
  const nameValid =
    name.trim().length > 0 && name.length <= BLUEPRINT_LIMITS.name;
  const invalid = !nameValid || !helpUrlValid;

  const startEdit = () => {
    setName(detail.displayName);
    setDescription(detail.description);
    setHelpUrl(detail.definition.helpUrl);
    setIconColor(detail.iconColor);
    setEditing(true);
  };

  const save = () => {
    if (invalid) {
      return;
    }
    mutate({
      definition: {
        ...detail.definition,
        displayName: name.trim(),
        description: description.trim(),
        helpUrl: helpUrl.trim(),
        iconColor,
      },
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          {t('Name, description and help documentation')}
        </h2>
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
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-lg font-semibold text-white"
              style={{ background: iconColor }}
            >
              {blueprintIconUtils.letterOf(name)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {BLUEPRINT_ICON_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={t('Icon color {color}', { color })}
                  onClick={() => setIconColor(color)}
                  className={cn(
                    'size-6 rounded-full border-2',
                    color === iconColor
                      ? 'border-foreground'
                      : 'border-transparent',
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Connector name')}</label>
            <Input
              value={name}
              maxLength={BLUEPRINT_LIMITS.name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {t('Connector description')}
            </label>
            <Textarea
              value={description}
              rows={2}
              maxLength={BLUEPRINT_LIMITS.description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {t('Help documentation')}
            </label>
            <Input
              value={helpUrl}
              placeholder="https://"
              onChange={(event) => setHelpUrl(event.target.value)}
            />
            {!helpUrlValid && (
              <p className="text-xs text-destructive">
                {t('Enter an address starting with http:// or https://')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('Connector name')}</dt>
          <dd>{detail.displayName}</dd>
          <dt className="text-muted-foreground">{t('Connector identifier')}</dt>
          <dd className="font-mono">{detail.identifier}</dd>
          <dt className="text-muted-foreground">
            {t('Connector description')}
          </dt>
          <dd className={cn(!detail.description && 'text-muted-foreground')}>
            {detail.description ||
              t('Not filled in yet, required before publishing')}
          </dd>
          <dt className="text-muted-foreground">{t('Help documentation')}</dt>
          <dd>
            {detail.definition.helpUrl ? (
              <a
                className="text-primary underline"
                href={detail.definition.helpUrl}
                target="_blank"
                rel="noreferrer"
              >
                {detail.definition.helpUrl}
              </a>
            ) : (
              <span className="text-muted-foreground">
                {t('Not configured')}
              </span>
            )}
          </dd>
        </dl>
      )}
    </section>
  );
}

function BaseUrlCard({ detail }: { detail: ConnectorBlueprintDetail }) {
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState(detail.definition.baseUrl);
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onSuccess: () => setEditing(false),
    });
  const valid = blueprintRules.isHttpUrl(baseUrl);

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">{t('Base URL')}</h2>
          {!detail.definition.baseUrl && (
            <Badge variant="destructive">{t('Needs configuration')}</Badge>
          )}
        </div>
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
              disabled={!valid}
              loading={isPending}
              onClick={() =>
                mutate({
                  definition: {
                    ...detail.definition,
                    baseUrl: baseUrl.trim().replace(/\/+$/, ''),
                  },
                })
              }
            >
              {t('Save')}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBaseUrl(detail.definition.baseUrl);
              setEditing(true);
            }}
          >
            {t('Edit')}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          <Input
            value={baseUrl}
            className="font-mono"
            placeholder="https://api.example.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
          {!valid && (
            <p className="text-xs text-destructive">
              {t('Enter an address starting with http:// or https://')}
            </p>
          )}
        </div>
      ) : (
        <span
          className={cn(
            'font-mono text-sm',
            !detail.definition.baseUrl && 'text-muted-foreground',
          )}
        >
          {detail.definition.baseUrl ||
            t('Base URL needs configuration, required before publishing')}
        </span>
      )}
    </section>
  );
}

function DevelopersCard({ detail }: { detail: ConnectorBlueprintDetail }) {
  const [editing, setEditing] = useState(false);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>(
    detail.collaboratorIds,
  );
  const { data: candidates } = connectorBlueprintHooks.useBlueprintCandidates(
    editing ? detail.id : null,
  );
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateBlueprintCollaborators({
      id: detail.id,
      onSuccess: () => setEditing(false),
    });
  const options = (candidates ?? []).filter(
    (person) => person.id !== detail.owner?.id,
  );

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('Developer members')}</h2>
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
              loading={isPending}
              onClick={() => mutate({ collaboratorIds })}
            >
              {t('Save')}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCollaboratorIds(detail.collaboratorIds);
              setEditing(true);
            }}
          >
            {t('Edit')}
          </Button>
        )}
      </div>
      {editing ? (
        <MultiSelect
          value={collaboratorIds}
          onValueChange={setCollaboratorIds}
          items={options.map((person) => ({
            value: person.id,
            label: person.name,
          }))}
        >
          <MultiSelectTrigger>
            <MultiSelectValue
              placeholder={t(
                'Select members who have the connector development module',
              )}
            />
          </MultiSelectTrigger>
          <MultiSelectContent>
            <MultiSelectSearch placeholder={t('Search...')} />
            <MultiSelectList>
              <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
              {options.map((person) => (
                <MultiSelectItem key={person.id} value={person.id}>
                  {person.name}
                </MultiSelectItem>
              ))}
            </MultiSelectList>
          </MultiSelectContent>
        </MultiSelect>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {detail.owner?.name ?? t('Deleted user')} · {t('Owner')}
            </Badge>
            {detail.collaborators.map((person) => (
              <Badge key={person.id} variant="secondary">
                {person.name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('{count} developers can view, edit and publish the connector', {
              count: detail.collaborators.length + 1,
            })}
          </p>
        </div>
      )}
    </section>
  );
}

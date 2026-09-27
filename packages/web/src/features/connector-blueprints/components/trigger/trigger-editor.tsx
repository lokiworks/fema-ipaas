import {
  BlueprintChangeType,
  BlueprintTrigger,
  BlueprintTriggerType,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { MoreHorizontalIcon, Trash2Icon, ZapIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { connectorBlueprintsApi } from '../../api/connector-blueprints-api';
import {
  CONNECTOR_BLUEPRINTS_KEY,
  connectorBlueprintHooks,
} from '../../hooks/connector-blueprint-hooks';
import { BlueprintInputsTable } from '../inputs/blueprint-inputs-table';
import { BlueprintSampleEditor } from '../operation/operation-output-sample-editor';

import { TriggerBasicTab } from './trigger-basic-tab';
import { TriggerConfigTab } from './trigger-config-tab';

export function BlueprintTriggerEditor({
  detail,
  triggerKey,
}: {
  detail: ConnectorBlueprintDetail;
  triggerKey: string;
}) {
  const trigger = detail.definition.triggers.find(
    (candidate) => candidate.key === triggerKey,
  );
  if (!trigger) {
    return <TriggerNotFound detail={detail} />;
  }
  return <TriggerEditorContent detail={detail} trigger={trigger} />;
}

function TriggerEditorContent({
  detail,
  trigger,
}: {
  detail: ConnectorBlueprintDetail;
  trigger: BlueprintTrigger;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('basic');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const base = `/tenant/connectors/development/${detail.id}`;
  const change = detail.changes.find(
    (candidate) => candidate.id === `trigger:${trigger.key}`,
  );
  const published =
    detail.publishedDefinition?.triggers.some(
      (candidate) => candidate.key === trigger.key,
    ) ?? false;
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
    });
  const updateTrigger = (patch: Partial<BlueprintTrigger>) =>
    mutate({
      definition: {
        ...detail.definition,
        triggers: detail.definition.triggers.map((candidate) =>
          candidate.key === trigger.key
            ? { ...candidate, ...patch }
            : candidate,
        ),
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ZapIcon className="size-4 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{trigger.name}</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {trigger.key}
        </span>
        <Badge variant="outline">
          {trigger.type === BlueprintTriggerType.INSTANT
            ? t('Instant trigger')
            : t('Polling trigger')}
        </Badge>
        {change && (
          <Badge
            variant={
              change.change === BlueprintChangeType.ADD ? 'success' : 'outline'
            }
          >
            {change.change === BlueprintChangeType.ADD
              ? t('Unpublished')
              : t('Has unpublished changes')}
          </Badge>
        )}
        <span className="grow" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t('More actions')}>
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              {t('Delete trigger')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="basic">{t('Basic information')}</TabsTrigger>
          <TabsTrigger value="settings">
            {t('Settings form')} ({trigger.inputs.length})
          </TabsTrigger>
          <TabsTrigger value="output">{t('Outputs')}</TabsTrigger>
          <TabsTrigger value="config">{t('Trigger configuration')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'basic' && (
        <TriggerBasicTab
          trigger={trigger}
          onUpdate={updateTrigger}
          isPending={isPending}
        />
      )}
      {tab === 'settings' && (
        <BlueprintInputsTable
          title={t('Settings form')}
          hint={t(
            'Filled in by the workflow user when they configure the trigger. Referenced as {settingsPlaceholder} in the API configuration, alongside {inputPlaceholder} for operation inputs',
            {
              settingsPlaceholder: '{{settings.key}}',
              inputPlaceholder: '{{input.key}}',
            },
          )}
          inputs={trigger.inputs}
          operationOptions={detail.definition.operations.map((operation) => ({
            key: operation.key,
            name: operation.name,
          }))}
          problemOperationKeys={detail.definition.operations.map(
            (operation) => operation.key,
          )}
          onChange={(inputs) => updateTrigger({ inputs })}
        />
      )}
      {tab === 'output' && (
        <BlueprintSampleEditor
          sample={trigger.sample}
          isPending={isPending}
          onSave={(sample) => updateTrigger({ sample })}
        />
      )}
      {tab === 'config' && (
        <TriggerConfigTab
          trigger={trigger}
          onUpdate={updateTrigger}
          isPending={isPending}
        />
      )}
      <ConfirmationDeleteDialog
        title={t('Delete trigger {name}?', { name: trigger.name })}
        message={
          published
            ? t(
                'This trigger is included in a published version. Deleting it becomes a pending change and it can only ship as a new version.',
              )
            : t(
                'This trigger has never been published. Deleting it cannot be undone.',
              )
        }
        entityName={trigger.name}
        buttonText={t('Delete trigger')}
        isDanger
        showToast
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        mutationFn={async () => {
          await connectorBlueprintsApi.update(detail.id, {
            definition: {
              ...detail.definition,
              triggers: detail.definition.triggers.filter(
                (candidate) => candidate.key !== trigger.key,
              ),
            },
          });
          await queryClient.invalidateQueries({
            queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', detail.id],
          });
          navigate(`${base}/basic`);
        }}
      />
    </div>
  );
}

function TriggerNotFound({ detail }: { detail: ConnectorBlueprintDetail }) {
  const navigate = useNavigate();
  return (
    <div className="p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ZapIcon />
          </EmptyMedia>
          <EmptyTitle>{t('Trigger not found')}</EmptyTitle>
          <EmptyDescription>
            {t('It may have been deleted, or the link is out of date.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <div className="mt-4 flex justify-center">
        <Button
          onClick={() =>
            navigate(`/tenant/connectors/development/${detail.id}/basic`)
          }
        >
          {t('Back to basic information')}
        </Button>
      </div>
    </div>
  );
}

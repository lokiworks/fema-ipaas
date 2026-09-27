import {
  BlueprintChangeType,
  BlueprintOperation,
  blueprintRules,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  BugIcon,
  CopyIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
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

import { MethodTag } from './method-tag';
import { OperationApiConfigTab } from './operation-api-config-tab';
import { OperationBasicTab } from './operation-basic-tab';
import { OperationDebugDrawer } from './operation-debug-drawer';
import { BlueprintSampleEditor } from './operation-output-sample-editor';
import { OperationSimulator } from './operation-simulator';
import { OperationStatusTab } from './operation-status-tab';

export function BlueprintOperationEditor({
  detail,
  operationKey,
}: {
  detail: ConnectorBlueprintDetail;
  operationKey: string;
}) {
  const operation = detail.definition.operations.find(
    (candidate) => candidate.key === operationKey,
  );
  if (!operation) {
    return <OperationNotFound detail={detail} />;
  }
  return <OperationEditorContent detail={detail} operation={operation} />;
}

function OperationEditorContent({
  detail,
  operation,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('basic');
  const [debugOpen, setDebugOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const base = `/tenant/connectors/development/${detail.id}`;
  const change = detail.changes.find(
    (candidate) => candidate.id === `operation:${operation.key}`,
  );
  const published =
    detail.publishedDefinition?.operations.some(
      (candidate) => candidate.key === operation.key,
    ) ?? false;
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
    });
  const updateOperation = (
    patch:
      | Partial<BlueprintOperation>
      | ((current: BlueprintOperation) => Partial<BlueprintOperation>),
  ) => {
    const next = typeof patch === 'function' ? patch(operation) : patch;
    mutate({
      definition: {
        ...detail.definition,
        operations: detail.definition.operations.map((candidate) =>
          candidate.key === operation.key
            ? { ...candidate, ...next }
            : candidate,
        ),
      },
    });
  };
  const copyOperation = () => {
    const taken = [
      ...detail.definition.operations.map((candidate) => candidate.key),
      ...(detail.publishedDefinition?.operations ?? []).map(
        (candidate) => candidate.key,
      ),
    ];
    const key = blueprintRules.uniqueKey({
      base: `${operation.key}_copy`,
      taken,
    });
    const copy: BlueprintOperation = {
      ...operation,
      key,
      name: t('{name} copy', { name: operation.name }),
    };
    mutate(
      {
        definition: {
          ...detail.definition,
          operations: [...detail.definition.operations, copy],
        },
      },
      {
        onSuccess: () => navigate(`${base}/op/${key}`),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <MethodTag method={operation.method} />
        <h1 className="text-lg font-semibold">{operation.name}</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {operation.key}
        </span>
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
        <Button variant="outline" onClick={() => setDebugOpen(true)}>
          <BugIcon className="size-4" />
          {t('Debug')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t('More actions')}>
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={copyOperation}>
              <CopyIcon className="size-4" />
              {t('Duplicate operation')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              {t('Delete operation')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="border-b px-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="basic">{t('Basic information')}</TabsTrigger>
            <TabsTrigger value="input">
              {t('Inputs')} ({operation.inputs.length})
            </TabsTrigger>
            <TabsTrigger value="output">{t('Outputs')}</TabsTrigger>
            <TabsTrigger value="api">{t('API configuration')}</TabsTrigger>
            <TabsTrigger value="code">{t('Status codes')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {tab === 'basic' && (
            <OperationBasicTab
              detail={detail}
              operation={operation}
              onUpdate={updateOperation}
              isPending={isPending}
            />
          )}
          {tab === 'input' && (
            <OperationInputsTab
              detail={detail}
              operation={operation}
              onUpdate={updateOperation}
            />
          )}
          {tab === 'output' && (
            <BlueprintSampleEditor
              sample={operation.sample}
              isPending={isPending}
              onSave={(sample) => updateOperation({ sample })}
            />
          )}
          {tab === 'api' && (
            <OperationApiConfigTab
              baseUrl={detail.definition.baseUrl}
              operation={operation}
              onUpdate={updateOperation}
              isPending={isPending}
            />
          )}
          {tab === 'code' && (
            <OperationStatusTab
              detail={detail}
              operation={operation}
              onUpdate={updateOperation}
              isPending={isPending}
            />
          )}
        </div>
        <OperationSimulator detail={detail} operation={operation} />
      </div>
      <OperationDebugDrawer
        open={debugOpen}
        onOpenChange={setDebugOpen}
        detail={detail}
        operation={operation}
      />
      <ConfirmationDeleteDialog
        title={t('Delete operation {name}?', { name: operation.name })}
        message={
          published
            ? t(
                'This operation is included in a published version. Deleting it becomes a pending change and it can only ship as a new version.',
              )
            : t(
                'This operation has never been published. Deleting it cannot be undone.',
              )
        }
        entityName={operation.name}
        buttonText={t('Delete operation')}
        isDanger
        showToast
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        mutationFn={async () => {
          await connectorBlueprintsApi.update(detail.id, {
            definition: {
              ...detail.definition,
              operations: detail.definition.operations.filter(
                (candidate) => candidate.key !== operation.key,
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

function OperationInputsTab({
  detail,
  operation,
  onUpdate,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
  onUpdate: (patch: Partial<BlueprintOperation>) => void;
}) {
  const otherOperations = detail.definition.operations.filter(
    (candidate) => candidate.key !== operation.key,
  );
  return (
    <BlueprintInputsTable
      title={t('Inputs')}
      inputs={operation.inputs}
      operationOptions={otherOperations.map((candidate) => ({
        key: candidate.key,
        name: candidate.name,
      }))}
      problemOperationKeys={otherOperations.map((candidate) => candidate.key)}
      onChange={(inputs) => onUpdate({ inputs })}
    />
  );
}

function OperationNotFound({ detail }: { detail: ConnectorBlueprintDetail }) {
  const navigate = useNavigate();
  return (
    <div className="p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BugIcon />
          </EmptyMedia>
          <EmptyTitle>{t('Operation not found')}</EmptyTitle>
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

import { LocalesEnum, MappingTarget, isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionStatus,
  ConnectorActionSettings,
  StepLocationRelativeToParent,
  SuggestionType,
  WorkflowActionType,
  WorkflowOperationType,
  PropertyExecutionType,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { pathHelpers } from '@/app/builder/data-selector/path-helpers';
import { SearchInput } from '@/components/custom/search-input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { connectionsQueries } from '@/features/connections';
import { connectorsApi } from '@/features/connectors';
import { AddTargetSlotParams } from '@/features/mapping-tables';
import { targetSchema } from '@/features/mapping-tables/utils/target-schema';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { MAPPING_EDITOR_TARGET } from './mapping-editor-target';

export function MappingWriteStepDialog({
  open,
  onOpenChange,
  onCreated,
}: AddTargetSlotParams) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[70vh] flex-col gap-3 sm:max-w-3xl"
        data-testid="mapping-write-step-dialog"
      >
        <DialogHeader className="mb-0">
          <DialogTitle>{t('Add a writing step')}</DialogTitle>
          <DialogDescription>
            {t(
              'Pick the app and the action that receives this data. The step is added right after this one, marked To confirm, and its fields appear here with their types and required marks.',
            )}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <WriteStepPicker
            onCreated={(target) => {
              onCreated(target);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WriteStepPicker({
  onCreated,
}: {
  onCreated: (target: MappingTarget) => void;
}) {
  const { i18n } = useTranslation();
  const projectId = authenticationSession.getProjectId() ?? '';
  const [search, setSearch] = useState('');
  const [debounced] = useDebounce(search, 250);
  const [selected, setSelected] = useState<string | null>(null);
  const locale = localeOf(i18n.language);
  const { data: connectors, isLoading } = useQuery({
    queryKey: ['mapping-write-connectors', projectId, debounced, i18n.language],
    queryFn: async () => {
      const list = await connectorsApi.list({
        projectId,
        searchQuery: debounced.length > 0 ? debounced : undefined,
        suggestionType: SuggestionType.ACTION,
        locale,
      });
      return list.filter(
        (connector) =>
          connector.actions > 0 &&
          connector.name !== MAPPING_EDITOR_TARGET.connectorName,
      );
    },
    enabled: projectId.length > 0,
    staleTime: 30_000,
  });
  const chosen = connectors?.find((connector) => connector.name === selected);
  const { data: model, isLoading: isLoadingModel } = useQuery({
    queryKey: [
      'connector',
      chosen?.name,
      chosen?.version,
      i18n.language,
      undefined,
    ],
    queryFn: () =>
      connectorsApi.get({
        name: chosen?.name ?? '',
        version: chosen?.version,
        locale,
      }),
    enabled: !isNil(chosen),
    staleTime: Infinity,
  });
  const connections = connectionsQueries.useConnections({
    request: { projectId, limit: 1000 },
    extraKeys: ['builder-validation', projectId],
    enabled: projectId.length > 0,
    staleTime: 30_000,
  });
  const [stepName, handleAddingOrUpdatingStep] = useBuilderStateContext(
    (state) => [state.selectedStep, state.handleAddingOrUpdatingStep],
  );
  const actions = Object.entries(model?.actions ?? {}).filter(([, action]) =>
    WRITE_CLASSIFICATIONS.includes(action.classification ?? ''),
  );
  const addStep = (actionName: string) => {
    if (isNil(model) || isNil(stepName)) {
      return;
    }
    const target = targetSchema.fromModelAction({ model, actionName });
    const action = model.actions[actionName];
    if (target === null || isNil(action)) {
      return;
    }
    const active = (connections.data?.data ?? []).filter(
      (connection) =>
        connection.connectorName === model.name &&
        connection.status === ConnectionStatus.ACTIVE,
    );
    const references = Object.fromEntries(
      target.fields.map((field) => [
        field.name,
        `{{${pathHelpers.convertValuePathToPropertyPath(
          stepName,
          field.name,
        )}}}`,
      ]),
    );
    const input = {
      ...(active.length === 1 && model.auth
        ? { auth: `{{connections['${active[0].externalId}']}}` }
        : {}),
      ...references,
    };
    const settings: ConnectorActionSettings = {
      connectorName: model.name,
      connectorVersion: model.version,
      actionName,
      input,
      propertySettings: Object.fromEntries(
        Object.keys(input).map((key) => [
          key,
          { type: PropertyExecutionType.MANUAL, schema: undefined },
        ]),
      ),
      errorHandlingOptions: {
        continueOnFailure: { value: false },
        retryOnFailure: { value: false },
      },
      pendingReview: true,
    };
    onCreated(target);
    handleAddingOrUpdatingStep({
      connectorSelectorItem: {
        type: WorkflowActionType.CONNECTOR,
        actionOrTrigger: action,
        connectorMetadata: {
          displayName: model.displayName,
          logoUrl: model.logoUrl,
          description: model.description,
          type: WorkflowActionType.CONNECTOR,
          connectorName: model.name,
          connectorVersion: model.version,
          categories: model.categories ?? [],
          packageType: model.packageType,
          connectorType: model.connectorType,
          auth: model.auth,
        },
      },
      operation: {
        type: WorkflowOperationType.ADD_ACTION,
        actionLocation: {
          parentStep: stepName,
          stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
        },
      },
      overrideSettings: settings,
      selectStepAfter: false,
    });
  };
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="shrink-0">
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
          data-testid="mapping-write-connectors"
        >
          {isLoading && (
            <span className="text-xs text-muted-foreground">
              {t('Loading...')}
            </span>
          )}
          {(connectors ?? []).map((connector) => (
            <button
              key={connector.name}
              type="button"
              data-testid={`mapping-write-connector-${connector.name}`}
              onClick={() => setSelected(connector.name)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                selected === connector.name && 'bg-muted font-medium',
              )}
            >
              <img
                src={connector.logoUrl}
                alt=""
                className="size-5 shrink-0 object-contain"
              />
              <span className="truncate">{connector.displayName}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex min-h-0 flex-col gap-1 overflow-y-auto"
        data-testid="mapping-write-actions"
      >
        {isNil(chosen) && (
          <span className="text-xs text-muted-foreground">
            {t('Pick an app on the left to see what it can write.')}
          </span>
        )}
        {!isNil(chosen) && isLoadingModel && (
          <span className="text-xs text-muted-foreground">
            {t('Loading...')}
          </span>
        )}
        {!isNil(model) && actions.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t('This app has no action that writes data.')}
          </span>
        )}
        {actions.map(([actionName, action]) => (
          <button
            key={actionName}
            type="button"
            data-testid={`mapping-write-action-${actionName}`}
            onClick={() => addStep(actionName)}
            className="flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {action.displayName}
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Sparkles className="size-3" />
                {t('Added as To confirm')}
              </Badge>
            </span>
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {action.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function localeOf(language: string): LocalesEnum | undefined {
  return Object.values(LocalesEnum).find((locale) => locale === language);
}

const WRITE_CLASSIFICATIONS: string[] = ['WRITE', 'DESTRUCTIVE'];

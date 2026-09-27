import { isNil } from '@fema-ipaas/core-utils';
import {
  McpService,
  McpToolSource,
  McpToolSourceType,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Search, Workflow } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpServiceUiUtils } from '../utils/mcp-service-ui-utils';

import {
  buildToolFormSchema,
  McpToolForm,
  ToolFormValues,
} from './mcp-tool-form';

type WizardMode = 'CONNECTOR' | 'WORKFLOW';

function McpToolWizard({
  service,
  mode,
  preset,
  onClose,
  onCreate,
}: {
  service: McpService;
  mode: WizardMode;
  preset?: { connectorName: string; actionName: string } | null;
  onClose: () => void;
  onCreate: (tool: ToolFormValues) => void;
}) {
  const initialStep = preset ? 1 : 0;
  const [step, setStep] = useState(initialStep);
  const [connectorName, setConnectorName] = useState<string | null>(
    preset?.connectorName ?? null,
  );
  const [actionName, setActionName] = useState<string | null>(
    preset?.actionName ?? null,
  );
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const takenNames = service.tools.map((tool) => tool.name);
  const isConnector = mode === 'CONNECTOR';
  const titles = isConnector
    ? [t('Choose a connector'), t('Choose an action'), t('Confirm')]
    : [t('Choose a workflow'), t('Confirm')];
  const lastStep = titles.length - 1;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isConnector
              ? t('New tool from a connector')
              : t('New tool from a workflow')}
          </DialogTitle>
          <DialogDescription>
            {t('Step {step} of {total}: {title}', {
              step: step + 1,
              total: titles.length,
              title: titles[step],
            })}
          </DialogDescription>
        </DialogHeader>
        {isConnector && step === 0 && (
          <ConnectorPickStep
            selected={connectorName}
            onPick={(name) => {
              setConnectorName(name);
              setActionName(null);
            }}
          />
        )}
        {isConnector && step === 1 && connectorName && (
          <ActionPickStep
            connectorName={connectorName}
            selected={actionName}
            onPick={setActionName}
          />
        )}
        {!isConnector && step === 0 && (
          <WorkflowPickStep
            projectId={service.projectId}
            takenWorkflowIds={service.tools.flatMap((tool) =>
              tool.source.type === McpToolSourceType.WORKFLOW
                ? [tool.source.workflowId]
                : [],
            )}
            selected={workflowId}
            onPick={setWorkflowId}
          />
        )}
        {step === lastStep && isConnector && connectorName && actionName && (
          <ConnectorConfirmStep
            service={service}
            connectorName={connectorName}
            actionName={actionName}
            taken={takenNames}
            onBack={() => setStep(step - 1)}
            onCreate={onCreate}
          />
        )}
        {step === lastStep && !isConnector && workflowId && (
          <WorkflowConfirmStep
            service={service}
            workflowId={workflowId}
            taken={takenNames}
            onBack={() => setStep(step - 1)}
            onCreate={onCreate}
          />
        )}
        {step < lastStep && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={step === 0 ? onClose : () => setStep(step - 1)}
            >
              {step === 0 ? t('Cancel') : t('Back')}
            </Button>
            <Button
              type="button"
              disabled={
                isConnector
                  ? step === 0
                    ? !connectorName
                    : !actionName
                  : !workflowId
              }
              onClick={() => setStep(step + 1)}
            >
              {t('Next')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectorPickStep({
  selected,
  onPick,
}: {
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const { connectors, isLoading } = connectorsHooks.useConnectors({
    searchQuery: search,
  });
  const usable = (connectors ?? []).filter(
    (connector) => connector.actions > 0,
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search connectors')}
          className="pl-8"
        />
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && usable.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('No connectors found')}
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {usable.map((connector) => (
          <button
            key={connector.name}
            type="button"
            onClick={() => onPick(connector.name)}
            className={
              'flex flex-col items-center gap-2 rounded-md border p-3 text-center hover:bg-accent ' +
              (selected === connector.name ? 'border-primary bg-accent' : '')
            }
          >
            <ConnectorIcon
              displayName={connector.displayName}
              logoUrl={connector.logoUrl}
              showTooltip={false}
              size="md"
            />
            <span className="line-clamp-2 text-xs">
              {connector.displayName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionPickStep({
  connectorName,
  selected,
  onPick,
}: {
  connectorName: string;
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const { connectorModel, isLoading } = connectorsHooks.useConnector({
    name: connectorName,
  });
  if (isLoading || !connectorModel) {
    return <Skeleton className="h-40 w-full" />;
  }
  const actions = Object.values(connectorModel.actions);
  return (
    <div className="flex flex-col gap-1">
      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('This connector has no actions')}
        </p>
      )}
      {actions.map((action) => (
        <button
          key={action.name}
          type="button"
          onClick={() => onPick(action.name)}
          className={
            'flex flex-col items-start gap-0.5 rounded-md border p-3 text-left hover:bg-accent ' +
            (selected === action.name ? 'border-primary bg-accent' : '')
          }
        >
          <span className="text-sm font-medium">{action.displayName}</span>
          {action.description && (
            <span className="text-xs text-muted-foreground">
              {action.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function WorkflowPickStep({
  projectId,
  takenWorkflowIds,
  selected,
  onPick,
}: {
  projectId: string;
  takenWorkflowIds: string[];
  selected: string | null;
  onPick: (workflowId: string) => void;
}) {
  const { data: candidates, isLoading } =
    mcpServicesHooks.useCandidates(projectId);
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (!candidates || candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'This project has no workflows yet. Create one that starts with a callable-workflow trigger and publish it.',
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {t(
          'Only published workflows whose trigger is a callable-workflow trigger can become tools. Its params become the tool params.',
        )}
      </p>
      {candidates.map((candidate) => {
        const blocked =
          mcpServiceUiUtils.workflowCandidateBlockedReason(candidate) ??
          (takenWorkflowIds.includes(candidate.workflowId)
            ? t('Already added as a tool')
            : null);
        return (
          <button
            key={candidate.workflowId}
            type="button"
            disabled={Boolean(blocked)}
            onClick={() => onPick(candidate.workflowId)}
            className={
              'flex items-center gap-2 rounded-md border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent ' +
              (selected === candidate.workflowId
                ? 'border-primary bg-accent'
                : '')
            }
          >
            <Workflow className="size-4 text-muted-foreground" />
            <span className="flex-1 text-sm">{candidate.displayName}</span>
            {blocked && <Badge variant="outline">{blocked}</Badge>}
            {!blocked && !candidate.enabled && (
              <Badge variant="outline">{t('Turned off')}</Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ConnectorConfirmStep({
  service,
  connectorName,
  actionName,
  taken,
  onBack,
  onCreate,
}: {
  service: McpService;
  connectorName: string;
  actionName: string;
  taken: string[];
  onBack: () => void;
  onCreate: (tool: ToolFormValues) => void;
}) {
  const { connectorModel } = connectorsHooks.useConnector({
    name: connectorName,
  });
  const { data: params, isLoading } = mcpServicesHooks.useConnectorToolParams({
    request: { projectId: service.projectId, connectorName, actionName },
    enabled: true,
  });
  const action = connectorModel?.actions[actionName];
  if (isLoading || isNil(params) || !action) {
    return <Skeleton className="h-64 w-full" />;
  }
  const source: McpToolSource = {
    type: McpToolSourceType.CONNECTOR_ACTION,
    connectorName,
    actionName,
  };
  return (
    <ConfirmForm
      source={source}
      params={params}
      titleHint={action.displayName}
      taken={taken}
      sourceLabel={
        <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <ConnectorIcon
            displayName={connectorModel.displayName}
            logoUrl={connectorModel.logoUrl}
            showTooltip={false}
            size="xs"
          />
          <span>{connectorModel.displayName}</span>
          <span className="text-muted-foreground">·</span>
          <span>{action.displayName}</span>
        </div>
      }
      onBack={onBack}
      onCreate={onCreate}
    />
  );
}

function WorkflowConfirmStep({
  service,
  workflowId,
  taken,
  onBack,
  onCreate,
}: {
  service: McpService;
  workflowId: string;
  taken: string[];
  onBack: () => void;
  onCreate: (tool: ToolFormValues) => void;
}) {
  const { data: candidates, isLoading } = mcpServicesHooks.useCandidates(
    service.projectId,
  );
  const candidate = candidates?.find((item) => item.workflowId === workflowId);
  if (isLoading || !candidate) {
    return <Skeleton className="h-64 w-full" />;
  }
  const source: McpToolSource = {
    type: McpToolSourceType.WORKFLOW,
    workflowId,
  };
  return (
    <ConfirmForm
      source={source}
      params={candidate.params}
      titleHint={candidate.displayName}
      taken={taken}
      sourceLabel={
        <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <Workflow className="size-4 text-muted-foreground" />
          <span>{candidate.displayName}</span>
        </div>
      }
      onBack={onBack}
      onCreate={onCreate}
    />
  );
}

function ConfirmForm({
  source,
  params,
  titleHint,
  taken,
  sourceLabel,
  onBack,
  onCreate,
}: {
  source: McpToolSource;
  params: ToolFormValues['params'];
  titleHint: string;
  taken: string[];
  sourceLabel: ReactNode;
  onBack: () => void;
  onCreate: (tool: ToolFormValues) => void;
}) {
  const draft = mcpServiceUiUtils.buildToolDraft({
    source,
    sourceParams: params,
    titleHint,
    taken,
  });
  const form = useForm<ToolFormValues>({
    resolver: zodResolver(buildToolFormSchema(taken)),
    mode: 'onChange',
    defaultValues: draft,
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => onCreate(values))}
      >
        <McpToolForm source={sourceLabel} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onBack}>
            {t('Back')}
          </Button>
          <Button type="submit">{t('Create tool')}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export { McpToolWizard };

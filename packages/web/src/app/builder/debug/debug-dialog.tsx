import { isNil } from '@fema-ipaas/core-utils';
import {
  RunEnvironment,
  WorkflowTriggerType,
  workflowConnectorUtil,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import {
  Maximize2,
  Minimize2,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { connectionsQueries } from '@/features/connections';
import { connectorsHooks } from '@/features/connectors';
import { projectCollectionUtils } from '@/features/projects';
import { releasesHooks } from '@/features/releases';
import { cn } from '@/lib/utils';

export function DebugDialog({
  open,
  onOpenChange,
  isManualTrigger,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isManualTrigger: boolean;
  onStart: (options: DebugStartOptions) => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col',
          fullScreen
            ? 'h-[calc(100vh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none sm:max-w-none'
            : 'sm:max-w-2xl',
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Debug')}</DialogTitle>
          <DialogDescription>
            {isManualTrigger
              ? t('Run the draft once from the manual trigger.')
              : t(
                  'Run the draft once with the trigger output below. Nothing is published.',
                )}
          </DialogDescription>
        </DialogHeader>
        <DebugForm
          key={open ? 'open' : 'closed'}
          isManualTrigger={isManualTrigger}
          fullScreen={fullScreen}
          onToggleFullScreen={() => setFullScreen((value) => !value)}
          onCancel={() => onOpenChange(false)}
          onStart={(options) => {
            onOpenChange(false);
            onStart(options);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DebugForm({
  isManualTrigger,
  fullScreen,
  onToggleFullScreen,
  onCancel,
  onStart,
}: {
  isManualTrigger: boolean;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
  onCancel: () => void;
  onStart: (options: DebugStartOptions) => void;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const [trigger, outputSampleData] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.outputSampleData,
  ]);
  const triggerSettings =
    trigger.type === WorkflowTriggerType.CONNECTOR ? trigger.settings : null;
  const { connectorModel } = connectorsHooks.useConnector({
    name: triggerSettings?.connectorName ?? '',
    version: triggerSettings
      ? workflowConnectorUtil.getExactVersion(triggerSettings.connectorVersion)
      : undefined,
    enabled: !isNil(triggerSettings),
  });
  const connectorSample = triggerSettings?.triggerName
    ? connectorModel?.triggers[triggerSettings.triggerName]?.sampleData
    : undefined;
  const form = useForm<DebugValues>({
    resolver: zodResolver(DebugSchema),
    mode: 'onChange',
    defaultValues: defaultValues(outputSampleData[trigger.name]),
  });
  const environment = form.watch('environment');

  const submit = (values: DebugValues) => {
    onStart({
      payload: isManualTrigger ? undefined : JSON.parse(values.payload),
      environment: project.releasesEnabled
        ? values.environment
        : RunEnvironment.TESTING,
    });
  };

  return (
    <Form {...form}>
      <form
        className={cn('flex min-h-0 flex-col gap-4', fullScreen && 'flex-1')}
        onSubmit={form.handleSubmit(submit)}
      >
        {!isManualTrigger && (
          <FormField
            control={form.control}
            name="payload"
            render={({ field }) => (
              <FormItem
                className={cn('flex min-h-0 flex-col', fullScreen && 'flex-1')}
              >
                <div className="flex items-center justify-between gap-2">
                  <FormLabel>{t('Trigger output (JSON)')}</FormLabel>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() =>
                        form.setValue(
                          'payload',
                          stringify(
                            outputSampleData[trigger.name] ??
                              connectorSample ??
                              {},
                          ),
                          { shouldValidate: true },
                        )
                      }
                    >
                      <WandSparkles className="size-3.5" />
                      {t('Generate default')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={onToggleFullScreen}
                    >
                      {fullScreen ? (
                        <Minimize2 className="size-3.5" />
                      ) : (
                        <Maximize2 className="size-3.5" />
                      )}
                      {fullScreen ? t('Exit full screen') : t('Full screen')}
                    </Button>
                  </div>
                </div>
                <FormControl>
                  <Textarea
                    {...field}
                    spellCheck={false}
                    className={cn(
                      'font-mono text-xs',
                      fullScreen ? 'min-h-0 flex-1 resize-none' : 'h-64',
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {project.releasesEnabled && (
          <FormField
            control={form.control}
            name="environment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Run environment')}</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={RunEnvironment.TESTING} />
                      {t('Test')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={RunEnvironment.PRODUCTION} />
                      {t('Production')}
                    </label>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <WriteStepsNotice
          isTestEnvironment={
            project.releasesEnabled && environment === RunEnvironment.TESTING
          }
        />
        {project.releasesEnabled &&
          (environment === RunEnvironment.PRODUCTION ? (
            <Alert variant="warning">
              <TriangleAlert className="size-4" />
              <AlertDescription>
                {t(
                  'This run uses production connections and project config. It creates real data in the connected systems, and a failure is reported like any production failure.',
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <ReplacementList projectId={project.id} />
          ))}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit">{t('Start debugging')}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function WriteStepsNotice({
  isTestEnvironment,
}: {
  isTestEnvironment: boolean;
}) {
  const { writeSteps } = useBuilderValidation();
  if (writeSteps.length === 0) {
    return null;
  }
  const shown = writeSteps.slice(0, MAX_WRITE_STEPS_SHOWN);
  const hasDestructive = writeSteps.some((step) => step.destructive);
  return (
    <Alert
      variant={isTestEnvironment && !hasDestructive ? 'default' : 'warning'}
    >
      <TriangleAlert className="size-4" />
      <AlertDescription className="flex flex-col gap-1">
        <span className="font-medium">
          {t(
            'This run can write to the connected systems: up to {count, plural, =1 {1 write step} other {# write steps}}',
            { count: writeSteps.length },
          )}
        </span>
        <span className="text-xs">
          {shown
            .map((step) =>
              step.destructive
                ? t('{name} (may be irreversible)', { name: step.displayName })
                : step.displayName,
            )
            .join(', ')}
          {writeSteps.length > MAX_WRITE_STEPS_SHOWN ? '…' : ''}
        </span>
        <span className="text-xs">
          {t(
            'Branches decide which of them actually run. Debugging does not publish the workflow, but these steps are not simulated.',
          )}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function ReplacementList({ projectId }: { projectId: string }) {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  const { data: replacements } = releasesHooks.useReplacements(projectId);
  const { data: connectionsPage } = connectionsQueries.useConnections({
    request: { projectId, limit: 1000 },
    extraKeys: ['builder-validation', projectId],
    staleTime: 30_000,
  });
  const connections = connectionsPage?.data ?? [];
  const used = new Set(
    workflowStructureUtil
      .getAllSteps(trigger)
      .flatMap((step) => extractExternalIds(step.settings)),
  );
  const nameOf = (id: string) =>
    connections.find(
      (connection) => connection.id === id || connection.externalId === id,
    )?.displayName ?? id;
  const rows = (replacements ?? []).filter((replacement) => {
    const source = connections.find(
      (connection) =>
        connection.id === replacement.sourceConnectionId ||
        connection.externalId === replacement.sourceConnectionId,
    );
    return !isNil(source) && used.has(source.externalId);
  });
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">{t('Connection replacements')}</span>
      {rows.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t(
            'No replacements apply. Steps use the same connections as production.',
          )}
        </span>
      ) : (
        rows.map((row) => (
          <span key={row.id} className="text-xs text-muted-foreground">
            {nameOf(row.sourceConnectionId)} → {nameOf(row.targetConnectionId)}
          </span>
        ))
      )}
    </div>
  );
}

function extractExternalIds(settings: unknown): string[] {
  const text = JSON.stringify(settings ?? {});
  return [...text.matchAll(CONNECTION_PATTERN)].map((match) => match[1]);
}

function defaultValues(sample: unknown): DebugValues {
  return {
    payload: stringify(sample ?? {}),
    environment: RunEnvironment.TESTING,
  };
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const CONNECTION_PATTERN = /connections\['([^']+)'\]/g;

const MAX_WRITE_STEPS_SHOWN = 5;

const DebugSchema = z.object({
  payload: z.string().refine(isJson, 'debugPayloadInvalidJson'),
  environment: z.enum(RunEnvironment),
});

type DebugValues = z.infer<typeof DebugSchema>;

export type DebugStartOptions = {
  payload: unknown;
  environment: RunEnvironment;
};

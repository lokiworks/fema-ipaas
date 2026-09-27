import { isNil } from '@fema-ipaas/core-utils';
import {
  McpService,
  McpServiceTool,
  McpToolParamMode,
  McpToolSourceType,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Workflow } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConnectorIconWithConnectorName } from '@/features/connectors';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

import {
  buildToolFormSchema,
  McpToolForm,
  ToolFormValues,
} from './mcp-tool-form';

function McpToolDrawer({
  service,
  toolId,
  canEdit,
  onClose,
}: {
  service: McpService;
  toolId: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const tool =
    service.tools.find((candidate) => candidate.id === toolId) ?? null;
  return (
    <Sheet
      open={!isNil(tool)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {tool && (
          <ToolDrawerContent
            key={tool.id}
            service={service}
            tool={tool}
            canEdit={canEdit}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ToolDrawerContent({
  service,
  tool,
  canEdit,
  onClose,
}: {
  service: McpService;
  tool: McpServiceTool;
  canEdit: boolean;
  onClose: () => void;
}) {
  const siblingNames = service.tools
    .filter((candidate) => candidate.id !== tool.id)
    .map((candidate) => candidate.name);
  const form = useForm<ToolFormValues>({
    resolver: zodResolver(buildToolFormSchema(siblingNames)),
    mode: 'onChange',
    defaultValues: tool,
  });
  const { mutate: updateTools, isPending } = mcpServicesHooks.useUpdateTools(
    service.id,
  );

  const handleSubmit = (values: ToolFormValues) => {
    updateTools(
      {
        tools: service.tools.map((candidate) =>
          candidate.id === tool.id
            ? {
                ...values,
                params: values.params.map((param) => ({
                  ...param,
                  value: normalizeParamValue(param),
                })),
              }
            : candidate,
        ),
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-1 flex-col gap-4 overflow-y-auto"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <SheetHeader>
          <SheetTitle>
            {canEdit ? t('Edit tool') : t('Tool details')}
          </SheetTitle>
          <SheetDescription>{tool.title}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-4">
          <fieldset disabled={!canEdit} className="contents">
            <McpToolForm source={<ToolSource tool={tool} />} />
          </fieldset>
        </div>
        {canEdit && (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {t('Save')}
            </Button>
          </SheetFooter>
        )}
      </form>
    </Form>
  );
}

function ToolSource({ tool }: { tool: McpServiceTool }) {
  if (tool.source.type === McpToolSourceType.WORKFLOW) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
        <Workflow className="size-4 text-muted-foreground" />
        <span className="font-mono text-xs">{tool.source.workflowId}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
      <ConnectorIconWithConnectorName
        connectorName={tool.source.connectorName}
        size="xs"
        showTooltip={false}
      />
      <span>{tool.source.connectorName}</span>
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-xs">{tool.source.actionName}</span>
    </div>
  );
}

function normalizeParamValue(param: ToolFormValues['params'][number]) {
  if (param.mode === McpToolParamMode.AI) {
    return undefined;
  }
  return param.value;
}

export { McpToolDrawer };

import {
  McpService,
  McpServiceTool,
  McpToolSourceType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { MoreHorizontal, Plug, Plus, Trash2, Workflow } from 'lucide-react';
import { useState } from 'react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConnectorIconWithConnectorName } from '@/features/connectors';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

import { McpDeleteToolDialog } from './mcp-delete-tool-dialog';
import { McpToolDrawer } from './mcp-tool-drawer';
import { ToolFormValues } from './mcp-tool-form';
import { McpToolWizard } from './mcp-tool-wizard';

function McpToolsTab({
  service,
  canEdit,
  initialWizard,
}: {
  service: McpService;
  canEdit: boolean;
  initialWizard?: {
    mode: 'CONNECTOR';
    connectorName: string;
    actionName: string;
  } | null;
}) {
  const [openToolId, setOpenToolId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{
    mode: 'CONNECTOR' | 'WORKFLOW';
    preset?: { connectorName: string; actionName: string } | null;
  } | null>(
    initialWizard ? { mode: 'CONNECTOR', preset: initialWizard } : null,
  );
  const [deleting, setDeleting] = useState<McpServiceTool | null>(null);
  const { mutate: updateTools } = mcpServicesHooks.useUpdateTools(service.id);

  const handleCreate = (tool: ToolFormValues) => {
    updateTools(
      { tools: [...service.tools, tool] },
      { onSuccess: () => setWizard(null) },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {t(
              'The tool name and description go straight to the AI. Say clearly when to use it and what it needs.',
            )}
          </span>
          <NewToolMenu onPick={(mode) => setWizard({ mode })} />
        </div>
      )}
      {service.tools.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug />
            </EmptyMedia>
            <EmptyTitle>{t('No tools yet')}</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? t(
                    'Create a tool from a connector action or a published workflow.',
                  )
                : t('The service owner has not added any tools yet.')}
            </EmptyDescription>
          </EmptyHeader>
          {canEdit && <NewToolMenu onPick={(mode) => setWizard({ mode })} />}
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Tool')}</TableHead>
              <TableHead>{t('Description')}</TableHead>
              <TableHead>{t('Source')}</TableHead>
              <TableHead>{t('Params')}</TableHead>
              {canEdit && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.tools.map((tool) => (
              <TableRow
                key={tool.id}
                className="cursor-pointer"
                onClick={() => setOpenToolId(tool.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {tool.source.type === McpToolSourceType.WORKFLOW ? (
                      <Workflow className="size-4 text-muted-foreground" />
                    ) : (
                      <ConnectorIconWithConnectorName
                        connectorName={tool.source.connectorName}
                        size="xs"
                        showTooltip={false}
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm">{tool.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {tool.name}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {tool.description || t('No description')}
                    </span>
                    {tool.description.trim().length > 0 &&
                      tool.description.trim().length < 10 && (
                        <Badge variant="outline">{t('Too short')}</Badge>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  {tool.source.type === McpToolSourceType.WORKFLOW ? (
                    <span className="font-mono text-xs">
                      {tool.source.workflowId}
                    </span>
                  ) : (
                    <span className="text-xs">
                      {tool.source.connectorName} · {tool.source.actionName}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {tool.params.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t('None')}
                    </span>
                  ) : (
                    <span className="font-mono text-xs">
                      {tool.params.map((param) => param.name).join('、')}
                    </span>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setOpenToolId(tool.id)}
                        >
                          {t('Edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(tool)}
                        >
                          <Trash2 className="size-4" />
                          {t('Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <McpToolDrawer
        service={service}
        toolId={openToolId}
        canEdit={canEdit}
        onClose={() => setOpenToolId(null)}
      />
      {wizard && (
        <McpToolWizard
          key={wizard.mode}
          service={service}
          mode={wizard.mode}
          preset={wizard.preset}
          onClose={() => setWizard(null)}
          onCreate={handleCreate}
        />
      )}
      <McpDeleteToolDialog
        service={service}
        tool={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  );
}

function NewToolMenu({
  onPick,
}: {
  onPick: (mode: 'CONNECTOR' | 'WORKFLOW') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          {t('New tool')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onPick('CONNECTOR')}>
          <Plug className="size-4" />
          {t('From a connector')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick('WORKFLOW')}>
          <Workflow className="size-4" />
          {t('From a workflow')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { McpToolsTab };

import { isNil } from '@fema-ipaas/core-utils';
import {
  McpServer,
  McpServerStatus,
  McpServerTool,
  mcpServerUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PlayIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { JsonViewer } from '@/components/custom/json-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { mcpServersMutations } from '@/features/mcp-servers/hooks/mcp-servers-hooks';
import {
  ToolFieldIssue,
  mcpToolFormUtils,
} from '@/features/mcp-servers/utils/mcp-tool-form-schema';
import { authenticationSession } from '@/lib/authentication-session';

import { ToolArgumentsForm } from './tool-arguments-form';

export function McpToolTryDrawer({
  server,
  tool,
  onClose,
}: {
  server: McpServer;
  tool: McpServerTool | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={!isNil(tool)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {tool && (
          <TryDrawerContent key={tool.name} server={server} tool={tool} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TryDrawerContent({
  server,
  tool,
}: {
  server: McpServer;
  tool: McpServerTool;
}) {
  const nodes = useMemo(
    () => mcpToolFormUtils.parseSchema(tool.inputSchema),
    [tool.inputSchema],
  );
  const [state, setState] = useState(() =>
    mcpToolFormUtils.initialState(nodes),
  );
  const [issues, setIssues] = useState<ToolFieldIssue[]>([]);
  const connected = server.status === McpServerStatus.CONNECTED;
  const isWriteLike = mcpServerUtils.isWriteLikeTool(tool);
  const { mutate, data, isPending } = mcpServersMutations.useTryMcpServerTool();

  const handleSubmit = () => {
    const resolved = mcpToolFormUtils.resolve({ nodes, state });
    if (!resolved.ok) {
      setIssues(resolved.issues);
      return;
    }
    setIssues([]);
    mutate({
      id: server.id,
      request: {
        projectId: authenticationSession.getProjectId()!,
        toolName: tool.name,
        arguments: resolved.payload,
      },
    });
  };

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <SheetHeader>
        <SheetTitle>
          {t('Try the tool: {name}', { name: tool.title ?? tool.name })}
        </SheetTitle>
        <SheetDescription>
          {server.displayName} · {tool.name}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        <p className="text-sm text-muted-foreground">{tool.description}</p>
        {!connected && (
          <Alert variant="destructive">
            <AlertTitle>{t('The server connection is broken')}</AlertTitle>
            <AlertDescription>
              {t(
                'Retry the connection from the detail page before trying this tool.',
              )}
            </AlertDescription>
          </Alert>
        )}
        {isWriteLike && (
          <Alert variant="warning">
            <AlertTitle>{t('This really runs')}</AlertTitle>
            <AlertDescription>
              {t(
                'This tool can create or change data on the server. Trying it has the same effect as a real call, so double-check the arguments first.',
              )}
            </AlertDescription>
          </Alert>
        )}
        <ToolArgumentsForm
          nodes={nodes}
          state={state}
          issues={issues}
          disabled={isPending}
          onChange={(next) => {
            setState(next);
            setIssues([]);
          }}
        />
        {data && (data.isError || !data.ok) && (
          <Alert variant="destructive">
            <AlertTitle>{t('The call failed')}</AlertTitle>
            <AlertDescription>
              {data.errorMessage ?? data.text}
              <span className="mt-1 block text-xs">
                {t('Took {duration} ms', { duration: data.durationMs })}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {data && !data.isError && data.ok && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t('Result')}</div>
            <JsonViewer
              title={tool.name}
              hideHeader
              json={data.structured ?? data.text}
            />
            <p className="text-xs text-muted-foreground">
              {t('Took {duration} ms', { duration: data.durationMs })}
              {' · '}
              {t(
                'Trials are recorded in the audit log; they do not create a run.',
              )}
            </p>
          </div>
        )}
      </div>
      <SheetFooter className="flex-row justify-end gap-2">
        <Button type="submit" disabled={!connected} loading={isPending}>
          <PlayIcon className="mr-1 size-4" />
          {t('Call')}
        </Button>
      </SheetFooter>
    </form>
  );
}

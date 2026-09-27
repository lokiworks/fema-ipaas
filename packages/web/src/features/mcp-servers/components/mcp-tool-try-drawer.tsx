import { isNil } from '@fema-ipaas/core-utils';
import {
  McpServer,
  McpServerStatus,
  McpServerTool,
  mcpServerUtils,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { PlayIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { JsonViewer } from '@/components/custom/json-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { mcpServersMutations } from '@/features/mcp-servers/hooks/mcp-servers-hooks';
import { mcpToolFormUtils } from '@/features/mcp-servers/utils/mcp-tool-form-schema';
import { authenticationSession } from '@/lib/authentication-session';

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
  const fields = mcpToolFormUtils.buildToolFormFields(tool.inputSchema);
  const schema = mcpToolFormUtils.buildToolFormSchema(fields);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(fields.map((field) => [field.key, ''])),
    mode: 'onChange',
  });
  const connected = server.status === McpServerStatus.CONNECTED;
  const isWriteLike = mcpServerUtils.isWriteLikeTool(tool);
  const { mutate, data, isPending } = mcpServersMutations.useTryMcpServerTool();

  const handleSubmit = form.handleSubmit((values) => {
    mutate({
      id: server.id,
      request: {
        projectId: authenticationSession.getProjectId()!,
        toolName: tool.name,
        arguments: mcpToolFormUtils.parseToolFormValues({ fields, values }),
      },
    });
  });

  return (
    <Form {...form}>
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
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('This tool takes no arguments.')}
            </p>
          )}
          {fields.map((field) => (
            <FormField
              key={field.key}
              control={form.control}
              name={field.key}
              render={({ field: rhfField }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator={field.required}>
                    {field.label}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...rhfField}
                      className={
                        field.kind === 'json' ? 'font-mono' : undefined
                      }
                      placeholder={field.kind === 'json' ? '{}' : undefined}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {field.key} · {field.kind}
                    {field.description ? ` · ${field.description}` : ''}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {data && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{t('Result')}</div>
              <JsonViewer
                title={tool.name}
                hideHeader
                json={data.structured ?? data.text}
              />
              <p className="text-xs text-muted-foreground">
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
    </Form>
  );
}

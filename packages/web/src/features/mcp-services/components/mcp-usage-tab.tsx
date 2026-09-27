import { isNil } from '@fema-ipaas/core-utils';
import {
  McpCredentialMode,
  McpService,
  McpServiceStatus,
  mcpServiceUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { RotateCcw } from 'lucide-react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpClientSnippets } from '../utils/mcp-client-snippets';

function McpUsageTab({
  service,
  canEdit,
}: {
  service: McpService;
  canEdit: boolean;
}) {
  const { data: key, isLoading } = mcpServicesHooks.useMyKey({
    id: service.id,
    enabled: service.canEdit || service.obtained,
  });
  const { mutate: resetKey, isPending: resetting } =
    mcpServicesHooks.useResetMyKey(service.id);
  const endpointFor = mcpServicesHooks.useEndpointUrl();

  if (!service.canEdit && !service.obtained) {
    return (
      <Alert>
        <AlertDescription>
          {t(
            'Obtain this service first to see its connection details and your personal API key.',
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || isNil(key)) {
    return <Skeleton className="h-64 w-full" />;
  }

  const endpoint = endpointFor(key.endpointPath);
  const serverKey = service.key ?? service.id;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {service.releases.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'This service has not been published yet, clients cannot connect.',
            )}{' '}
            {canEdit && t('Add tools and publish to make it usable.')}
          </AlertDescription>
        </Alert>
      )}
      {service.releases.length > 0 &&
        service.status === McpServiceStatus.PAUSED && (
          <Alert variant="warning">
            <AlertDescription>
              {t('This service is paused, calls will return an error.')}
            </AlertDescription>
          </Alert>
        )}
      {service.legacy && (
        <Alert>
          <AlertDescription>
            {t(
              'This is a legacy service served at its own endpoint without a publish step.',
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Service URL')}</span>
        <CopyToClipboardInput textToCopy={endpoint} useInput={true} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('API key')}</span>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <CopyToClipboardInput
              textToCopy={key.key}
              displayValue={mcpServiceUtils.maskKey(key.key)}
              useInput={true}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={resetting}
            onClick={() => resetKey()}
          >
            <RotateCcw className="size-4 mr-1" />
            {t('Reset')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'This key identifies you as the caller. Resetting it breaks the old key immediately.',
          )}
        </p>
      </div>
      {service.credentialMode === McpCredentialMode.USER && (
        <p className="text-xs text-muted-foreground">
          {t(
            'This service is authorized by each user: the first time you call a tool that needs a connector, the client prompts you to pick your account.',
          )}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('Add to a client')}</span>
        <Tabs defaultValue="cursor">
          <TabsList>
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
            <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
            <TabsTrigger value="generic">{t('Other clients')}</TabsTrigger>
          </TabsList>
          <TabsContent value="cursor" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t(
                'Paste this into .cursor/mcp.json (project) or ~/.cursor/mcp.json (global), then check the MCP page in Cursor settings.',
              )}
            </p>
            <CopyToClipboardInput
              textToCopy={mcpClientSnippets.cursorConfig({
                serverKey,
                endpoint,
                token: key.key,
              })}
              displayValue={mcpClientSnippets.cursorConfig({
                serverKey,
                endpoint,
                token: mcpServiceUtils.maskKey(key.key),
              })}
              useInput={false}
            />
          </TabsContent>
          <TabsContent value="claude-code" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t(
                'Run this command in a terminal. Add --scope project to share it with your team via .mcp.json.',
              )}
            </p>
            <CopyToClipboardInput
              textToCopy={mcpClientSnippets.claudeCodeCommand({
                serverKey,
                endpoint,
                token: key.key,
              })}
              displayValue={mcpClientSnippets.claudeCodeCommand({
                serverKey,
                endpoint,
                token: mcpServiceUtils.maskKey(key.key),
              })}
              useInput={false}
            />
          </TabsContent>
          <TabsContent value="generic" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t(
                'For any MCP client that supports Streamable HTTP. Otherwise set the URL and Authorization header manually.',
              )}
            </p>
            <CopyToClipboardInput
              textToCopy={mcpClientSnippets.genericHttpConfig({
                serverKey,
                endpoint,
                token: key.key,
              })}
              displayValue={mcpClientSnippets.genericHttpConfig({
                serverKey,
                endpoint,
                token: mcpServiceUtils.maskKey(key.key),
              })}
              useInput={false}
            />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {t(
            'The copied snippet includes your full API key. Do not commit it to a public repository.',
          )}
        </p>
      </div>
    </div>
  );
}

export { McpUsageTab };

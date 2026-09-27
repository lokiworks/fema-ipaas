import { McpServiceWithToken } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpClientSnippets } from '../utils/mcp-client-snippets';
import { mcpServiceUtils } from '../utils/mcp-service-utils';

export function McpTokenDialog({
  service,
  onClose,
}: {
  service: McpServiceWithToken | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={service !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        {service && <TokenDetails service={service} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function TokenDetails({
  service,
  onClose,
}: {
  service: McpServiceWithToken;
  onClose: () => void;
}) {
  const endpointFor = mcpServicesHooks.useEndpointUrl();
  const endpoint = endpointFor(service.id);
  const input = {
    serverKey: mcpServiceUtils.serverKeyFor(service.name),
    endpoint,
    token: service.token,
  };
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {t('Connect an AI assistant to {name}', { name: service.name })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'Clients connect over Streamable HTTP and send the token as a Bearer header.',
          )}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="warning">
        <TriangleAlert className="size-4" />
        <AlertDescription>
          {t(
            'Copy the token now. It is shown only once. If you lose it, rotate the token and update your clients.',
          )}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        <Label>{t('Endpoint URL')}</Label>
        <CopyToClipboardInput textToCopy={endpoint} useInput={true} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t('Token')}</Label>
        <CopyToClipboardInput textToCopy={service.token} useInput={true} />
      </div>
      <Tabs defaultValue="json" className="w-full">
        <TabsList>
          <TabsTrigger value="json">{t('Claude Desktop / Cursor')}</TabsTrigger>
          <TabsTrigger value="claude-code">{t('Claude Code')}</TabsTrigger>
          <TabsTrigger value="curl">{t('Test with curl')}</TabsTrigger>
        </TabsList>
        <TabsContent value="json" className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t(
              'Add this to the mcpServers section of the client config file, then restart the client.',
            )}
          </p>
          <CopyToClipboardInput
            textToCopy={mcpClientSnippets.mcpServersJson(input)}
            useInput={false}
          />
        </TabsContent>
        <TabsContent value="claude-code" className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t('Run this in a terminal where Claude Code is installed.')}
          </p>
          <CopyToClipboardInput
            textToCopy={mcpClientSnippets.claudeCodeCommand(input)}
            useInput={false}
          />
        </TabsContent>
        <TabsContent value="curl" className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t(
              'Lists the tools this service exposes. Use it to check the token works.',
            )}
          </p>
          <CopyToClipboardInput
            textToCopy={mcpClientSnippets.curlToolsList(input)}
            useInput={false}
          />
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          {t('I have copied the token')}
        </Button>
      </DialogFooter>
    </div>
  );
}

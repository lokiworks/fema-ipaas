import { McpService, McpServiceTool } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpDeleteToolDialog({
  service,
  tool,
  onOpenChange,
}: {
  service: McpService;
  tool: McpServiceTool | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: updateTools, isPending } = mcpServicesHooks.useUpdateTools(
    service.id,
  );
  return (
    <Dialog open={tool !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {tool && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('Delete tool "{name}"?', { name: tool.title })}
              </DialogTitle>
              <DialogDescription>
                {service.releases.length > 0
                  ? t(
                      'After the next publish, AI assistants will no longer be able to call this tool.',
                    )
                  : t('This cannot be undone.')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={isPending}
                onClick={() =>
                  updateTools(
                    {
                      tools: service.tools.filter(
                        (candidate) => candidate.id !== tool.id,
                      ),
                    },
                    { onSuccess: () => onOpenChange(false) },
                  )
                }
              >
                {t('Delete')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { McpDeleteToolDialog };

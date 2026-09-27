import {
  McpService,
  McpServiceIssue,
  McpServiceIssueLevel,
  PublishMcpServiceRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';
import { mcpServiceUiUtils } from '../utils/mcp-service-ui-utils';

function McpPublishDialog({
  service,
  issues,
  nextVersion,
  canPublish,
  open,
  onOpenChange,
  onIssuePick,
}: {
  service: McpService;
  issues: McpServiceIssue[];
  nextVersion: string;
  canPublish: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssuePick: (issue: McpServiceIssue) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <PublishForm
          key={open ? 'open' : 'closed'}
          service={service}
          issues={issues}
          nextVersion={nextVersion}
          canPublish={canPublish}
          onOpenChange={onOpenChange}
          onIssuePick={onIssuePick}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({
  service,
  issues,
  nextVersion,
  canPublish,
  onOpenChange,
  onIssuePick,
}: {
  service: McpService;
  issues: McpServiceIssue[];
  nextVersion: string;
  canPublish: boolean;
  onOpenChange: (open: boolean) => void;
  onIssuePick: (issue: McpServiceIssue) => void;
}) {
  const errors = issues.filter(
    (issue) => issue.level === McpServiceIssueLevel.ERROR,
  );
  const warnings = issues.filter(
    (issue) => issue.level === McpServiceIssueLevel.WARNING,
  );
  const form = useForm<PublishMcpServiceRequestBody>({
    resolver: zodResolver(PublishMcpServiceRequestBody),
    mode: 'onChange',
    defaultValues: { note: '' },
  });
  const { mutate: publish, isPending } = mcpServicesHooks.usePublish(
    service.id,
  );

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          publish(values, { onSuccess: () => onOpenChange(false) }),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Publish {version}', { version: nextVersion })}
          </DialogTitle>
          <DialogDescription>{service.name}</DialogDescription>
        </DialogHeader>
        {errors.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="mb-2 font-medium">
                {t('{count} errors must be fixed first', {
                  count: errors.length,
                })}
              </p>
              <div className="flex flex-col gap-1">
                {errors.map((issue, index) => (
                  <button
                    key={`${issue.code}-${index}`}
                    type="button"
                    className="text-left text-sm underline"
                    onClick={() => onIssuePick(issue)}
                  >
                    {mcpServiceUiUtils.issueMessage(issue)}
                  </button>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertDescription>
              {t(
                'After publishing, AI assistants already connected to this service will see the latest tools in their next session.',
              )}
              {warnings.length > 0 &&
                t(
                  ' There are also {count} warnings, they do not block publishing.',
                  {
                    count: warnings.length,
                  },
                )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {t('Tools included in this release')}
          </span>
          <div className="flex flex-wrap gap-1">
            {service.tools.map((tool) => (
              <Badge key={tool.id} variant="outline" className="font-mono">
                {tool.name}
              </Badge>
            ))}
          </div>
        </div>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Release note')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={200}
                  placeholder={t(
                    'Describe what was added or changed in this release',
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" disabled={!canPublish} loading={isPending}>
            {t('Publish')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export { McpPublishDialog };

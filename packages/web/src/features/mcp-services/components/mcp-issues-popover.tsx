import { McpServiceIssue, McpServiceIssueLevel } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { mcpServiceUiUtils } from '../utils/mcp-service-ui-utils';

function McpIssuesPopover({
  issues,
  onPick,
}: {
  issues: McpServiceIssue[];
  onPick: (issue: McpServiceIssue) => void;
}) {
  const errorCount = issues.filter(
    (issue) => issue.level === McpServiceIssueLevel.ERROR,
  ).length;
  const warningCount = issues.length - errorCount;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {errorCount > 0 ? (
            <CircleX className="size-4 mr-1 text-destructive" />
          ) : warningCount > 0 ? (
            <TriangleAlert className="size-4 mr-1 text-warning" />
          ) : (
            <CircleCheck className="size-4 mr-1 text-success" />
          )}
          {issues.length === 0
            ? t('Problem check')
            : t('Problem check · {errors} errors {warnings} warnings', {
                errors: errorCount,
                warnings: warningCount,
              })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-4 text-success" />
            <span>{t('No problems found, ready to publish')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t(
                '{count} problems found. Errors must be fixed before publishing.',
                {
                  count: issues.length,
                },
              )}
            </p>
            <div className="flex flex-col gap-1">
              {issues.map((issue, index) => (
                <button
                  key={`${issue.code}-${issue.toolId ?? index}-${
                    issue.connectorName ?? ''
                  }`}
                  type="button"
                  className="flex items-start gap-2 rounded-sm p-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => onPick(issue)}
                >
                  {issue.level === McpServiceIssueLevel.ERROR ? (
                    <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  )}
                  <span className="flex-1">
                    {mcpServiceUiUtils.issueMessage(issue)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { McpIssuesPopover };

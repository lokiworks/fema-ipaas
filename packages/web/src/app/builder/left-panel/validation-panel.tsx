import { WorkflowTriggerType, workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { LeftSideBarType } from '@/app/builder/types';
import { useStepDisplayNumbers } from '@/app/builder/use-step-display-numbers';
import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { validationMessages } from '@/app/builder/validation/validation-messages';
import {
  ValidationIssue,
  ValidationSeverity,
} from '@/app/builder/validation/workflow-validator';
import { LoadingSpinner } from '@/components/custom/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function ValidationPanel() {
  const [selectStepByName, setLeftSidebar, openPicker, trigger] =
    useBuilderStateContext((state) => [
      state.selectStepByName,
      state.setLeftSidebar,
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
      state.workflowVersion.trigger,
    ]);
  const { issues, errorCount, warningCount, isLoading } =
    useBuilderValidation();
  const displayNumbers = useStepDisplayNumbers();

  const locate = (issue: ValidationIssue) => {
    const step = workflowStructureUtil.getStep(issue.stepName, trigger);
    if (step?.type === WorkflowTriggerType.EMPTY) {
      selectStepByName(issue.stepName);
      openPicker(issue.stepName);
      return;
    }
    selectStepByName(issue.stepName, { tab: issue.tab });
  };

  return (
    <div className="flex h-full w-full flex-col">
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        <span className="truncate font-semibold">{t('Validation')}</span>
        {isLoading && <LoadingSpinner className="size-3.5" />}
      </SidebarHeader>
      <div className="flex items-center gap-3 px-3 pb-2 text-xs">
        <span className="flex items-center gap-1 text-destructive">
          <CircleAlertIcon className="size-3.5" />
          {t('{count, plural, =1 {1 error} other {# errors}}', {
            count: errorCount,
          })}
        </span>
        <span className="flex items-center gap-1 text-warning">
          <TriangleAlertIcon className="size-3.5" />
          {t('{count, plural, =1 {1 warning} other {# warnings}}', {
            count: warningCount,
          })}
        </span>
      </div>
      <Separator orientation="horizontal" />
      <ScrollArea className="min-h-0 flex-1">
        {issues.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-10">
            <CircleCheckIcon className="size-6 text-success-600" />
            <span className="text-sm text-muted-foreground">
              {t('No problems found. Errors block debugging and publishing.')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {issues.map((issue) => {
              const step = workflowStructureUtil.getStep(
                issue.stepName,
                trigger,
              );
              const isError = issue.severity === ValidationSeverity.ERROR;
              const Icon = isError ? CircleAlertIcon : TriangleAlertIcon;
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => locate(issue)}
                  className="flex items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0',
                      isError ? 'text-destructive' : 'text-warning',
                    )}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm leading-5">
                      {validationMessages.messageOf(issue)}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {step?.displayName ?? issue.stepName}
                      {displayNumbers[issue.stepName]
                        ? ` · ${displayNumbers[issue.stepName]}`
                        : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

ValidationPanel.displayName = 'ValidationPanel';

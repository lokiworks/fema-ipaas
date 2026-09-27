import { RunMonitorOptions, RunMonitorRange } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Calendar, RefreshCw } from 'lucide-react';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { runMonitorLabels } from '../utils/run-monitor-labels';
import { RUN_MONITOR_RANGES } from '../utils/run-monitor-utils';

export function MonitorToolbar({
  range,
  projectIds,
  workflowIds,
  options,
  updatedAt,
  refreshing,
  onRangeChange,
  onProjectsChange,
  onWorkflowsChange,
  onRefresh,
}: {
  range: RunMonitorRange;
  projectIds: string[];
  workflowIds: string[];
  options: RunMonitorOptions | undefined;
  updatedAt: number;
  refreshing: boolean;
  onRangeChange: (range: RunMonitorRange) => void;
  onProjectsChange: (projectIds: string[]) => void;
  onWorkflowsChange: (workflowIds: string[]) => void;
  onRefresh: () => void;
}) {
  const projects = options?.projects ?? [];
  const workflows = (options?.workflows ?? []).filter(
    (workflow) =>
      projectIds.length === 0 || projectIds.includes(workflow.projectId),
  );
  const projectName = (id: string): string =>
    projects.find((project) => project.id === id)?.displayName ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={range}
        onValueChange={(value) =>
          onRangeChange(
            RUN_MONITOR_RANGES.find((item) => item === value) ??
              RunMonitorRange.LAST_7_DAYS,
          )
        }
      >
        <SelectTrigger className="h-9 w-40 gap-2">
          <Calendar className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RUN_MONITOR_RANGES.map((item) => (
            <SelectItem key={item} value={item}>
              {runMonitorLabels.range(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="w-56">
        <MultiSelect
          value={projectIds}
          onValueChange={(value) => onProjectsChange(value)}
          items={projects.map((project) => ({
            value: project.id,
            label: project.displayName,
          }))}
        >
          <MultiSelectTrigger>
            <MultiSelectValue
              placeholder={t('All projects')}
              maxDisplay={1}
              maxItemLength={10}
            />
          </MultiSelectTrigger>
          <MultiSelectContent>
            <MultiSelectSearch placeholder={t('Search...')} />
            <MultiSelectList>
              <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
              {projects.map((project) => (
                <MultiSelectItem key={project.id} value={project.id}>
                  {project.displayName}
                </MultiSelectItem>
              ))}
            </MultiSelectList>
          </MultiSelectContent>
        </MultiSelect>
      </div>
      <div className="w-64">
        <MultiSelect
          value={workflowIds}
          onValueChange={(value) => onWorkflowsChange(value)}
          items={workflows.map((workflow) => ({
            value: workflow.id,
            label: workflow.displayName,
          }))}
        >
          <MultiSelectTrigger>
            <MultiSelectValue
              placeholder={t('All workflows')}
              maxDisplay={1}
              maxItemLength={12}
            />
          </MultiSelectTrigger>
          <MultiSelectContent>
            <MultiSelectSearch placeholder={t('Search...')} />
            <MultiSelectList>
              <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
              {workflows.map((workflow) => (
                <MultiSelectItem key={workflow.id} value={workflow.id}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{workflow.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {projectName(workflow.projectId)}
                    </span>
                  </span>
                </MultiSelectItem>
              ))}
            </MultiSelectList>
          </MultiSelectContent>
        </MultiSelect>
      </div>
      <span className="ml-auto text-xs text-muted-foreground">
        {t('Updated at {time}', {
          time: new Date(updatedAt).toLocaleTimeString(),
        })}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            loading={refreshing}
            onClick={onRefresh}
            aria-label={t('Refresh')}
          >
            <RefreshCw className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('Refresh')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

import {
  dataMapping,
  MappingMissingBehavior,
  MappingTableData,
} from '@fema-ipaas/core-utils';
import { WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import {
  mappingCoverageUtils,
  mappingTablesHooks,
} from '@/features/mapping-tables';
import { mappingSpecUtils } from '@/features/mapping-tables/utils/mapping-spec-utils';
import { MappingCoverageFinding } from '@/features/workflows/utils/workflow-validator';
import { authenticationSession } from '@/lib/authentication-session';

export function useMappingCoverageFindings(): Record<
  string,
  MappingCoverageFinding[]
> | null {
  const [trigger, workflowId, sampleData] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.workflow.id,
    state.outputSampleData,
  ]);
  const mapperSteps = useMemo(
    () =>
      workflowStructureUtil.getAllSteps(trigger).flatMap((step) => {
        if (
          step.type !== WorkflowActionType.CONNECTOR ||
          step.settings.connectorName !== DATA_MAPPER ||
          step.settings.actionName !== MAP_FIELDS ||
          step.skip === true
        ) {
          return [];
        }
        const mapping = step.settings.input['mapping'];
        return [{ stepName: step.name, spec: mappingSpecUtils.parse(mapping) }];
      }),
    [trigger],
  );
  const lookupIds = useMemo(
    () => [
      ...new Set(
        mapperSteps.flatMap(({ spec }) => dataMapping.lookupTableIds(spec)),
      ),
    ],
    [mapperSteps],
  );
  const { data: tables } = mappingTablesHooks.useMappingTablesData(lookupIds);
  const { data: runSources } = mappingTablesHooks.useWorkflowCoverage({
    projectId: authenticationSession.getProjectId(),
    workflowId,
    enabled: lookupIds.length > 0,
  });
  return useMemo(() => {
    if (lookupIds.length === 0 || tables === undefined) {
      return null;
    }
    const tableData: MappingTableData[] = tables.map((table) => ({
      id: table.id,
      name: table.name,
      rows: table.rows,
      missingBehavior: table.missingBehavior,
      defaultValue: table.defaultValue ?? null,
    }));
    return Object.fromEntries(
      mapperSteps.map(({ stepName, spec }) => {
        const sample = mappingCoverageUtils.sampleCoverage({
          spec,
          sampleData,
          tables: tableData,
        });
        const runs = (runSources ?? []).filter(
          (source) => source.stepName === stepName,
        );
        const findings = tableData.flatMap(
          (table): MappingCoverageFinding[] => {
            const fromSample = sample.find(
              (entry) => entry.tableId === table.id,
            );
            const fromRuns = runs.filter(
              (source) => source.tableId === table.id,
            );
            const uncovered = [
              ...new Set([
                ...(fromSample?.uncovered ?? []).map((found) => found.key),
                ...fromRuns.flatMap((source) =>
                  source.uncovered.map((found) => found.key),
                ),
              ]),
            ];
            const measured = fromRuns[0] ?? fromSample;
            return measured === undefined
              ? []
              : [
                  {
                    tableName: table.name,
                    uncovered,
                    hitPercent: mappingCoverageUtils.percent(measured),
                    behavior:
                      table.missingBehavior ?? MappingMissingBehavior.ERROR,
                  },
                ];
          },
        );
        return [stepName, findings];
      }),
    );
  }, [lookupIds, tables, mapperSteps, runSources, sampleData]);
}

const DATA_MAPPER = '@fema-ipaas/connector-data-mapper';
const MAP_FIELDS = 'map_fields';

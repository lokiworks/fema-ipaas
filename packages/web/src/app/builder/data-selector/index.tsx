import { ConnectorMetadataModel } from '@fema-ipaas/connector-sdk';
import { LocalesEnum, isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQueries } from '@tanstack/react-query';
import { t } from 'i18next';
import { Database, SearchXIcon, Variable } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';

import { textMentionUtils } from '@/app/builder/connector-properties/text-input-with-mentions/text-input-utils';
import { SearchInput } from '@/components/custom/search-input';
import { OutputSchema } from '@/components/custom/smart-output-viewer/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VirtualizedList } from '@/components/ui/virtualized-list';
import { connectorsApi } from '@/features/connectors';
import { workflowValidator } from '@/features/workflows/utils/workflow-validator';
import { cn } from '@/lib/utils';

import { ScrollArea } from '../../../components/ui/scroll-area';
import { BuilderState, useBuilderStateContext } from '../builder-hooks';
import { workflowCanvasConsts } from '../workflow-canvas/utils/consts';

import { DataSelectorNode } from './data-selector-node';
import {
  DataSelectorSizeState,
  DataSelectorSizeTogglers,
} from './data-selector-size-togglers';
import { pathHelpers } from './path-helpers';
import { DataSelectorTreeNode } from './type';
import { dataSelectorUtils } from './utils';
import { useDebugRunSamples } from './use-debug-run-samples';
import { schemaTreeUtils } from './utils-schema';
import { VariablesTab } from './variables-tab';

type StepInfo = (WorkflowAction | WorkflowTrigger) & { dfsIndex: number };

function getStepsAndData(state: BuilderState): {
  steps: StepInfo[];
  sampleData: Record<string, unknown>;
  isFocusInsideListMapperModeInput: boolean;
} {
  const { selectedStep, workflowVersion } = state;
  if (!selectedStep || !workflowVersion || !workflowVersion.trigger) {
    return {
      steps: [],
      sampleData: {},
      isFocusInsideListMapperModeInput: false,
    };
  }
  const pathToTargetStep = workflowStructureUtil.findPathToStep(
    workflowVersion.trigger,
    selectedStep,
  );
  return {
    steps: pathToTargetStep,
    sampleData: state.outputSampleData,
    isFocusInsideListMapperModeInput: state.isFocusInsideListMapperModeInput,
  };
}

function buildAdvancedStructure(
  steps: StepInfo[],
  sampleData: Record<string, unknown>,
  isFocusInsideListMapperModeInput: boolean,
  targetStepName: string,
): DataSelectorTreeNode[] {
  return steps.map((step) => {
    try {
      return dataSelectorUtils.traverseStep(
        step,
        sampleData,
        isFocusInsideListMapperModeInput,
        targetStepName,
      );
    } catch {
      return {
        key: `error-${step.name}`,
        data: {
          type: 'chunk' as const,
          displayName: `Error loading ${step.name}`,
        },
      };
    }
  });
}

type DataSelectorProps = {
  parentHeight: number;
  parentWidth: number;
  embedded?: boolean;
};

const doesElementHaveAnInputThatUsesMentions = (
  element: Element | null,
): boolean => {
  if (isNil(element)) {
    return false;
  }
  if (element.classList.contains(textMentionUtils.inputWithMentionsCssClass)) {
    return true;
  }
  const parent = element.parentElement;
  if (parent) {
    return doesElementHaveAnInputThatUsesMentions(parent);
  }
  return false;
};

const DataSelector = ({
  parentHeight,
  parentWidth,
  embedded = false,
}: DataSelectorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [embeddedCount, registerEmbedded] = useBuilderStateContext((state) => [
    state.embeddedDataSelectorCount,
    state.registerEmbeddedDataSelector,
  ]);
  useEffect(
    () => (embedded ? registerEmbedded() : undefined),
    [embedded, registerEmbedded],
  );
  const suppressed = !embedded && embeddedCount > 0;
  const [fit, setFit] = useState<SelectorFit>(DEFAULT_FIT);
  const placement = fit.placement;
  const narrow = parentWidth > 0 && parentWidth < NARROW_CANVAS_PX;
  const dockedWidth = narrow
    ? Math.max(240, Math.min(DOCKED_PX, parentWidth - 2 * EDGE_GAP_PX))
    : DOCKED_PX;
  const preferredHeight = narrow
    ? Math.max(
        180,
        Math.min(DOCKED_PX, Math.floor(parentHeight * NARROW_HEIGHT_RATIO)),
      )
    : DOCKED_PX;
  const dockedHeight = Math.min(
    preferredHeight,
    fit.heightLimit ?? preferredHeight,
  );
  const { i18n } = useTranslation();
  const [dataSelectorSize, setDataSelectorSize] =
    useState<DataSelectorSizeState>(DataSelectorSizeState.DOCKED);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'friendly' | 'advanced'>('friendly');
  const [showDataSelector, setShowDataSelector] = useState(false);

  const {
    steps: pathSteps,
    sampleData: testedSampleData,
    isFocusInsideListMapperModeInput,
  } = useBuilderStateContext(getStepsAndData);
  const debugSamples = useDebugRunSamples({ steps: pathSteps });
  const steps = useMemo(
    () =>
      pathSteps.map((step) =>
        withDebugTestDate({ step, testedAt: debugSamples.testedAt[step.name] }),
      ),
    [pathSteps, debugSamples],
  );
  const sampleData = useMemo(
    () => ({ ...debugSamples.outputs, ...definedEntries(testedSampleData) }),
    [debugSamples, testedSampleData],
  );
  const selectedStepIsLoop = useBuilderStateContext(
    (state) =>
      !isNil(state.selectedStep) &&
      workflowStructureUtil.getStep(
        state.selectedStep,
        state.workflowVersion.trigger,
      )?.type === WorkflowActionType.LOOP_ON_ITEMS,
  );
  const isTriggerSelected = useBuilderStateContext(
    (state) => state.selectedStep === 'trigger',
  );
  const selectedStepName = useBuilderStateContext(
    (state) => state.selectedStep ?? '',
  );
  const defaultTab = isTriggerSelected ? 'variables' : 'data';
  const [requestNonce, trigger] = useBuilderStateContext((state) => [
    state.dataSelectorRequestNonce,
    state.workflowVersion.trigger,
  ]);
  useEffect(() => {
    if (requestNonce === 0) {
      return;
    }
    setDataSelectorSize((size) =>
      size === DataSelectorSizeState.COLLAPSED
        ? DataSelectorSizeState.DOCKED
        : size,
    );
    setShowDataSelector(true);
  }, [requestNonce]);
  const loopVariableNodes = useMemo(
    () =>
      buildLoopVariableNodes({
        trigger,
        selectedStepName,
        sampleData,
      }),
    [trigger, selectedStepName, sampleData],
  );

  const connectorPairs = useMemo(
    () =>
      steps
        .map((step) => {
          if (step.type === WorkflowActionType.CONNECTOR) {
            return {
              stepName: step.name,
              connectorName: step.settings.connectorName,
              connectorVersion: step.settings.connectorVersion,
              stepKey: step.settings.actionName,
            };
          }
          if (step.type === WorkflowTriggerType.CONNECTOR) {
            return {
              stepName: step.name,
              connectorName: step.settings.connectorName,
              connectorVersion: step.settings.connectorVersion,
              stepKey: step.settings.triggerName,
            };
          }
          return null;
        })
        .filter(
          (
            entry,
          ): entry is {
            stepName: string;
            connectorName: string;
            connectorVersion: string;
            stepKey: string;
          } =>
            entry !== null &&
            Boolean(entry.connectorName) &&
            Boolean(entry.stepKey),
        ),
    [steps],
  );

  const connectorQueries = useQueries({
    queries: connectorPairs.map(({ connectorName, connectorVersion }) => ({
      queryKey: ['connector', connectorName, connectorVersion],
      queryFn: () =>
        connectorsApi.get({
          name: connectorName,
          version: connectorVersion,
          locale: i18n.language as LocalesEnum,
        }),
      staleTime: Infinity,
    })),
  });

  const schemaMap = useMemo<Record<string, OutputSchema | null>>(() => {
    const result: Record<string, OutputSchema | null> = {};
    connectorPairs.forEach(({ stepName, stepKey }, idx) => {
      const connector = connectorQueries[idx]?.data as
        | ConnectorMetadataModel
        | undefined;
      result[stepName] =
        connector?.triggers?.[stepKey]?.outputSchema ??
        connector?.actions?.[stepKey]?.outputSchema ??
        null;
    });
    return result;
  }, [connectorPairs, connectorQueries]);

  const advancedStructure = useMemo(
    () =>
      buildAdvancedStructure(
        steps,
        sampleData,
        isFocusInsideListMapperModeInput,
        selectedStepName,
      ),
    [steps, sampleData, isFocusInsideListMapperModeInput, selectedStepName],
  );

  const friendlyStructure = useMemo(
    () =>
      steps.map((step) => {
        const displayName = `${step.dfsIndex + 1}. ${step.displayName}`;
        const stepData = sampleData[step.name];

        if (
          typeof stepData === 'string' ||
          typeof stepData === 'number' ||
          typeof stepData === 'boolean'
        ) {
          return {
            key: step.name,
            data: {
              type: 'value' as const,
              value: '',
              displayName,
              propertyPath: pathHelpers.propertyPathStarter(step.name),
              insertable: true,
              stepName: step.name,
            },
            children: [
              {
                key: `${step.name}_value`,
                data: {
                  type: 'value' as const,
                  value: stepData,
                  displayName: t('Result'),
                  propertyPath: pathHelpers.propertyPathStarter(step.name),
                  insertable: true,
                },
              },
            ],
          };
        }

        const schema = schemaMap[step.name];

        if (Array.isArray(stepData) && stepData.length > 0) {
          const arrayKind = schemaTreeUtils.selectArrayTreeKind(schema);
          // A whole-output wrapper schema (single value:'' field) names the
          // array itself — render it object-style so the wrapper field sits at
          // the top with rows beneath, instead of wrapping each row in Item N.
          const arrayTree =
            schema && arrayKind === 'wrapper'
              ? schemaTreeUtils.buildTreeFromSchema({
                  stepName: step.name,
                  displayName,
                  schema,
                  sampleData: stepData,
                })
              : schema && arrayKind === 'perItem'
              ? schemaTreeUtils.buildTreeFromArrayWithSchema({
                  stepName: step.name,
                  displayName,
                  schema,
                  items: stepData,
                })
              : schemaTreeUtils.buildTreeFromArray({
                  stepName: step.name,
                  displayName,
                  items: stepData,
                });
          return dataSelectorUtils.applyContinueOnFailureView({
            step,
            stepNode: arrayTree,
            targetStepName: selectedStepName,
          });
        }

        if (schema && dataSelectorUtils.stepNeedsTesting(step)) {
          return dataSelectorUtils.applyContinueOnFailureView({
            step,
            stepNode: schemaTreeUtils.buildStructureFromSchema({
              stepName: step.name,
              displayName,
              schema,
              badge: t('Not tested · sample structure'),
            }),
            targetStepName: selectedStepName,
          });
        }

        if (schema) {
          return dataSelectorUtils.applyContinueOnFailureView({
            step,
            stepNode: schemaTreeUtils.buildTreeFromSchema({
              stepName: step.name,
              displayName,
              schema,
              sampleData: stepData,
            }),
            targetStepName: selectedStepName,
          });
        }
        try {
          return dataSelectorUtils.traverseStep(
            step,
            sampleData,
            isFocusInsideListMapperModeInput,
            selectedStepName,
          );
        } catch {
          return {
            key: `error-${step.name}`,
            data: {
              type: 'chunk' as const,
              displayName: `Error loading ${step.name}`,
            },
          };
        }
      }),
    [
      steps,
      sampleData,
      schemaMap,
      isFocusInsideListMapperModeInput,
      selectedStepName,
    ],
  );

  const stepStructure =
    viewMode === 'friendly' ? friendlyStructure : advancedStructure;
  const currentStructure = [
    ...loopVariableNodes,
    ...(selectedStepIsLoop
      ? listOnlyNodes({ nodes: stepStructure })
      : stepStructure),
  ];
  const [debouncedSearchTerm] = useDebounce(searchTerm, 250);
  const filteredNodes = useMemo(
    () => dataSelectorUtils.filterBy(currentStructure, debouncedSearchTerm),
    [currentStructure, debouncedSearchTerm],
  );

  const expansionScope = `${viewMode}|${debouncedSearchTerm}`;
  const [expansion, setExpansion] = useState<ExpansionState>({
    scope: '',
    overrides: EMPTY_OVERRIDES,
  });
  const overrides =
    expansion.scope === expansionScope ? expansion.overrides : EMPTY_OVERRIDES;

  const rows = useMemo(
    () =>
      dataSelectorUtils.flattenVisibleRows({
        nodes: filteredNodes,
        searchActive: debouncedSearchTerm.length > 0,
        overrides,
      }),
    [filteredNodes, debouncedSearchTerm, overrides],
  );

  const setRowExpanded = useCallback(
    (rowId: string, expanded: boolean) => {
      setExpansion((current) => ({
        scope: expansionScope,
        overrides: new Map(
          current.scope === expansionScope
            ? current.overrides
            : EMPTY_OVERRIDES,
        ).set(rowId, expanded),
      }));
    },
    [expansionScope],
  );

  useLayoutEffect(() => {
    if (embedded || !showDataSelector) {
      setFit(DEFAULT_FIT);
      return;
    }
    setFit(
      fitAroundNode({
        container: containerRef.current,
        stepName: selectedStepName,
        bodyHeight: preferredHeight,
        selectorWidth: dockedWidth,
        sideMargin: narrow ? NARROW_SIDE_MARGIN_PX : SIDE_MARGIN_PX,
      }),
    );
  }, [
    embedded,
    narrow,
    dockedWidth,
    showDataSelector,
    selectedStepName,
    preferredHeight,
    parentWidth,
    parentHeight,
    trigger,
  ]);

  const checkFocus = useCallback(() => {
    const isTextMentionInputFocused =
      (!isNil(containerRef.current) &&
        containerRef.current.contains(document.activeElement)) ||
      doesElementHaveAnInputThatUsesMentions(document.activeElement);
    setShowDataSelector(isTextMentionInputFocused);
  }, []);

  useEffect(() => {
    document.addEventListener('focusin', checkFocus);
    document.addEventListener('focusout', checkFocus);
    return () => {
      document.removeEventListener('focusin', checkFocus);
      document.removeEventListener('focusout', checkFocus);
    };
  }, [checkFocus]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        'border border-solid border-outline overflow-x-hidden bg-background rounded-md',
        embedded
          ? 'relative flex h-full w-full flex-col'
          : cn(
              'absolute right-0 z-50 transition-all shadow-lg',
              narrow ? 'mr-2' : 'mr-5',
              placement === 'top' ? 'top-0 mt-5' : 'bottom-0 mb-16',
              {
                'opacity-0 pointer-events-none':
                  !showDataSelector || suppressed,
              },
            ),
        textMentionUtils.dataSelectorCssClassSelector,
      )}
      data-testid={embedded ? 'embedded-data-selector' : 'data-selector'}
    >
      <div className="text-lg items-center px-3 py-2 flex gap-2">
        {t('Data Selector')} <div className="grow"></div>{' '}
        {!embedded && (
          <DataSelectorSizeTogglers
            state={dataSelectorSize}
            setListSizeState={setDataSelectorSize}
          ></DataSelectorSizeTogglers>
        )}
      </div>
      <div
        style={
          embedded
            ? undefined
            : {
                height:
                  dataSelectorSize === DataSelectorSizeState.COLLAPSED
                    ? '0px'
                    : dataSelectorSize === DataSelectorSizeState.DOCKED
                    ? `${dockedHeight}px`
                    : `${parentHeight - 100}px`,
                width:
                  dataSelectorSize !== DataSelectorSizeState.EXPANDED
                    ? `${dockedWidth}px`
                    : `${parentWidth - 40}px`,
              }
        }
        className={cn(
          'transition-all overflow-hidden',
          embedded && 'min-h-0 flex-1',
        )}
      >
        <Tabs
          key={defaultTab}
          defaultValue={defaultTab}
          className="h-full flex flex-col gap-0"
        >
          <TabsList
            variant="outline"
            className="px-3 shrink-0 gap-1 border-b border-border w-full justify-start"
          >
            <TabsTrigger
              value="data"
              variant="outline"
              className="gap-2 px-3 py-2 hover:text-foreground rounded-none"
            >
              <Database className="w-4 h-4" />
              {t('Upstream steps')}
            </TabsTrigger>
            <TabsTrigger
              value="variables"
              variant="outline"
              className="gap-2 px-3 py-2 hover:text-foreground rounded-none"
            >
              <Variable className="w-4 h-4" />
              {t('Project config')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="data"
            className="flex-1 min-h-0 flex flex-col gap-2 mt-2"
          >
            <div className="flex items-center gap-2 px-5">
              <SearchInput
                onChange={(e) => setSearchTerm(e)}
                value={searchTerm}
              ></SearchInput>
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as 'friendly' | 'advanced')}
              >
                <TabsList className="h-9 shrink-0">
                  <TabsTrigger value="friendly" className="text-xs px-2.5 h-7">
                    {t('Friendly View')}
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="text-xs px-2.5 h-7">
                    {t('Advanced')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea className="transition-all flex-1 w-full ">
              <VirtualizedList
                items={rows}
                estimateSize={32}
                getItemKey={(index) => rows[index].id}
                renderItem={(row) => (
                  <DataSelectorNode
                    depth={row.depth}
                    node={row.node}
                    expanded={row.expanded}
                    setExpanded={(expanded) => setRowExpanded(row.id, expanded)}
                  ></DataSelectorNode>
                )}
              />
              {filteredNodes.length === 0 &&
                selectedStepIsLoop &&
                debouncedSearchTerm.length === 0 && (
                  <div className="mx-5 mt-5 text-sm text-muted-foreground">
                    {t(
                      'No list fields in the upstream steps. Loop items need a list, such as the employees returned by a search step.',
                    )}
                  </div>
                )}
              {filteredNodes.length === 0 &&
                !(selectedStepIsLoop && debouncedSearchTerm.length === 0) && (
                <div className="flex items-center justify-center gap-2 mt-5  flex-col">
                  <SearchXIcon className="w-[35px] h-[35px]"></SearchXIcon>
                  <div className="text-center font-semibold text-md">
                    {t('No matching data')}
                  </div>
                  <div className="text-center ">
                    {t('Try adjusting your search')}
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="variables" className="flex-1 min-h-0 mt-2">
            <VariablesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

DataSelector.displayName = 'DataSelector';

function buildLoopVariableNodes({
  trigger,
  selectedStepName,
  sampleData,
}: {
  trigger: WorkflowTrigger;
  selectedStepName: string;
  sampleData: Record<string, unknown>;
}): DataSelectorTreeNode[] {
  const entry = workflowValidator
    .collectSteps(trigger)
    .find(({ step }) => step.name === selectedStepName);
  if (!entry || entry.loops.length === 0) {
    return [];
  }
  const children = entry.loops.flatMap((loopName) => {
    const loop = workflowStructureUtil.getStep(loopName, trigger);
    const loopSample = sampleData[loopName];
    const sampleRecord =
      typeof loopSample === 'object' && loopSample !== null ? loopSample : {};
    return LOOP_VARIABLE_KEYS.map((key) => ({
      key: `loop-variable-${loopName}-${key}`,
      data: {
        type: 'value' as const,
        value: key in sampleRecord ? Reflect.get(sampleRecord, key) : '',
        displayName: `${loop?.displayName ?? loopName} · ${key}`,
        propertyPath: pathHelpers.convertValuePathToPropertyPath(loopName, key),
        insertable: true,
        stepName: loopName,
      },
    }));
  });
  return [
    {
      key: 'loop-variables',
      data: { type: 'chunk' as const, displayName: t('Loop variables') },
      children,
    },
  ];
}

function withDebugTestDate({
  step,
  testedAt,
}: {
  step: StepInfo;
  testedAt: string | undefined;
}): StepInfo {
  if (isNil(testedAt)) {
    return step;
  }
  const settings = {
    ...step.settings,
    sampleData: { ...step.settings.sampleData, lastTestDate: testedAt },
  };
  return Object.assign({}, step, { settings });
}

function definedEntries(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function listOnlyNodes({
  nodes,
}: {
  nodes: DataSelectorTreeNode[];
}): DataSelectorTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.data.type !== 'value') {
      const children = listOnlyNodes({ nodes: node.children ?? [] });
      return node.data.type === 'test' || children.length > 0
        ? [{ ...node, children: node.children ? children : undefined }]
        : [];
    }
    const isList =
      Array.isArray(node.data.value) || node.data.listField === true;
    if (isList) {
      return [{ ...node, children: undefined }];
    }
    const children = listOnlyNodes({ nodes: node.children ?? [] });
    if (children.length === 0) {
      return [];
    }
    return [
      {
        ...node,
        data: { ...node.data, insertable: false },
        children,
      },
    ];
  });
}

function fitAroundNode({
  container,
  stepName,
  bodyHeight,
  selectorWidth,
  sideMargin,
}: {
  container: HTMLElement | null;
  stepName: string;
  bodyHeight: number;
  selectorWidth: number;
  sideMargin: number;
}): SelectorFit {
  const canvas = container?.offsetParent;
  const node = document.querySelector(
    `[data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}="${stepName}"]`,
  );
  if (!container || !canvas || !node) {
    return DEFAULT_FIT;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const selectorLeft = canvasRect.right - sideMargin - selectorWidth;
  if (nodeRect.right + NODE_GAP_PX <= selectorLeft) {
    return DEFAULT_FIT;
  }
  const fullHeight = HEADER_PX + bodyHeight;
  const spaceBelow =
    canvasRect.bottom - TOOLBAR_CLEARANCE_PX - (nodeRect.bottom + NODE_GAP_PX);
  const spaceAbove =
    nodeRect.top - NODE_GAP_PX - (canvasRect.top + EDGE_GAP_PX);
  if (spaceBelow >= fullHeight) {
    return DEFAULT_FIT;
  }
  if (spaceAbove >= fullHeight) {
    return { placement: 'top', heightLimit: null };
  }
  const placement: SelectorPlacement =
    spaceAbove > spaceBelow ? 'top' : 'bottom';
  const space = Math.max(spaceAbove, spaceBelow);
  return {
    placement,
    heightLimit: Math.max(MIN_BODY_PX, Math.floor(space - HEADER_PX)),
  };
}

const LOOP_VARIABLE_KEYS = ['item', 'index'];

const NARROW_CANVAS_PX = 760;
const DOCKED_PX = 450;
const EDGE_GAP_PX = 20;
const TOOLBAR_CLEARANCE_PX = 64;
const NARROW_HEIGHT_RATIO = 0.4;
const HEADER_PX = 48;
const NODE_GAP_PX = 12;
const SIDE_MARGIN_PX = 20;
const NARROW_SIDE_MARGIN_PX = 8;
const MIN_BODY_PX = 140;
const DEFAULT_FIT: SelectorFit = { placement: 'bottom', heightLimit: null };

type SelectorPlacement = 'top' | 'bottom';

type SelectorFit = {
  placement: SelectorPlacement;
  heightLimit: number | null;
};

const EMPTY_OVERRIDES: ReadonlyMap<string, boolean> = new Map();

type ExpansionState = {
  scope: string;
  overrides: ReadonlyMap<string, boolean>;
};

export { DataSelector };

import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowOperationType,
  WorkflowTrigger,
  WorkflowTriggerType,
  workflowConnectorUtil,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import deepEqual from 'deep-equal';
import { useEffect, useRef, useState } from 'react';
import { useForm, Resolver } from 'react-hook-form';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { Form } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  stepsHooks,
  connectorSelectorUtils,
  formUtils,
  ConnectorIcon,
  ConnectorStepMetadata,
} from '@/features/connectors';
import { workspaceCollectionUtils } from '@/features/workspaces';
import { cn, GAP_SIZE_FOR_STEP_SETTINGS } from '@/lib/utils';

import { ActionErrorHandlingForm } from '../connector-properties/action-error-handling';
import { DynamicPropertiesProvider } from '../connector-properties/dynamic-properties-context';
import { SidebarHeader } from '../sidebar-header';
import { StepDataPanelHost } from '../step-data/step-data-panel-host';
import {
  ActionTestRunnerProvider,
  TriggerTestRunnerProvider,
} from '../test-step/test-runner-context';
import { TestStepCTAButton } from '../test-step/test-step-cta-button';

import { CodeSettings } from './code-settings';
import { ComponentSettings } from './component-settings';
import { ConnectorSettings } from './connector-settings';
import EditableStepName from './editable-step-name';
import { JoinEdgesSection } from './join-edges-section';
import { LoopsSettings } from './loops-settings';
import { ParallelSettings } from './parallel-settings';
import { RouterSettings } from './router-settings';
import { StepNavigationButtons } from './step-navigation-buttons';
import { useStepSettingsContext } from './step-settings-context';
import { UpdateConnectorVersionDialog } from './update-connector-version-dialog/update-connector-version-dialog';

const StepSettingsContainer = () => {
  const { selectedStep, connectorModel, formSchema } = useStepSettingsContext();
  const { workspace } = workspaceCollectionUtils.useCurrentWorkspace();
  const [
    readonly,
    exitStepSettings,
    applyOperation,
    saving,
    workflowVersion,
    selectedBranchIndex,
    setSelectedBranchIndex,
    run,
    stepDataPanelView,
    isStepDataPanelOpen,
  ] = useBuilderStateContext((state) => [
    state.readonly,
    state.exitStepSettings,
    state.applyOperation,
    state.saving,
    state.workflowVersion,
    state.selectedBranchIndex,
    state.setSelectedBranchIndex,
    state.run,
    state.stepDataPanelView,
    state.isStepDataPanelOpen,
  ]);

  const { stepMetadata } = stepsHooks.useStepMetadata({
    step: selectedStep,
  });

  const selectedStepRef = useRef(selectedStep);
  selectedStepRef.current = selectedStep;

  const currentValuesRef = useRef<WorkflowAction | WorkflowTrigger>(
    selectedStep,
  );
  const form = useForm<WorkflowAction | WorkflowTrigger>({
    mode: 'all',
    disabled: readonly,
    reValidateMode: 'onChange',
    defaultValues: selectedStep,
    resetOptions: {
      keepDefaultValues: false,
      keepDirtyValues: true,
    },
    resolver: async (values, context, options) => {
      const result = await (
        zodResolver(formSchema) as unknown as Resolver<
          WorkflowAction | WorkflowTrigger
        >
      )(values, context, options);

      const cleanedNewValues = formUtils.removeUndefinedFromInput(values);
      const cleanedCurrentValues = formUtils.removeUndefinedFromInput(
        currentValuesRef.current,
      );
      const valid = Object.keys(result.errors).length === 0;
      cleanedNewValues.valid = valid;
      if (
        cleanedNewValues.type === WorkflowTriggerType.EMPTY ||
        (isNil(connectorModel) &&
          (cleanedNewValues.type === WorkflowActionType.CONNECTOR ||
            cleanedNewValues.type === WorkflowTriggerType.CONNECTOR))
      ) {
        return result;
      }
      if (
        deepEqual(
          stripSampleData(cleanedNewValues),
          stripSampleData(cleanedCurrentValues),
        )
      ) {
        return result;
      }
      //We need to copy the object because the form is using the same object reference
      currentValuesRef.current = JSON.parse(JSON.stringify(cleanedNewValues));
      if (cleanedNewValues.type === WorkflowTriggerType.CONNECTOR) {
        applyOperation({
          type: WorkflowOperationType.UPDATE_TRIGGER,
          request: {
            ...cleanedNewValues,
            valid,
          },
        });
      } else {
        applyOperation({
          type: WorkflowOperationType.UPDATE_ACTION,
          request: {
            ...cleanedNewValues,
            valid,
          },
        });
      }
      return result;
    },
  });

  const sidebarHeaderContainerRef = useRef<HTMLDivElement>(null);
  const modifiedStep = form.getValues();
  const isManualTrigger =
    modifiedStep.type === WorkflowTriggerType.CONNECTOR &&
    connectorSelectorUtils.isManualTrigger({
      connectorName: modifiedStep.settings.connectorName,
      triggerName: modifiedStep.settings.triggerName ?? '',
    });
  const isEmptyTrigger = modifiedStep.type === WorkflowTriggerType.EMPTY;
  const showGenerateSampleData =
    !readonly && !isManualTrigger && !isEmptyTrigger;
  const showStepInputOutFromRun =
    !isNil(run) && !isManualTrigger && !isEmptyTrigger;

  const [isEditingStepOrBranchName, setIsEditingStepOrBranchName] =
    useState(false);
  const runAgentStep =
    modifiedStep.settings.connectorName === '@fema-ipaas/connector-ai' &&
    modifiedStep.settings.actionName === 'run_agent';

  const showActionErrorHandlingForm =
    !isNil(stepMetadata) &&
    (modifiedStep.type === WorkflowActionType.CODE ||
      (modifiedStep.type === WorkflowActionType.CONNECTOR && runAgentStep));

  useEffect(() => {
    //RHF doesn't automatically trigger validation when the form is rendered, so we need to trigger it manually
    form.trigger();
  }, []);

  const showTestPanel = showGenerateSampleData || showStepInputOutFromRun;

  const settingsForm = (
    <ScrollArea className="h-full">
      <div
        className={cn(
          'flex flex-col px-4 pb-6 pt-3',
          GAP_SIZE_FOR_STEP_SETTINGS,
        )}
      >
        {modifiedStep.type === WorkflowActionType.LOOP_ON_ITEMS && (
          <LoopsSettings readonly={readonly}></LoopsSettings>
        )}
        {modifiedStep.type === WorkflowActionType.CODE && (
          <CodeSettings readonly={readonly}></CodeSettings>
        )}
        {modifiedStep.type === WorkflowActionType.COMPONENT && (
          <ComponentSettings step={modifiedStep} readonly={readonly} />
        )}
        {modifiedStep.type === WorkflowActionType.CONNECTOR && modifiedStep && (
          <ConnectorSettings
            step={modifiedStep}
            workflowId={workflowVersion.workflowId}
            readonly={readonly}
          ></ConnectorSettings>
        )}
        {modifiedStep.type === WorkflowActionType.ROUTER && modifiedStep && (
          <RouterSettings readonly={readonly}></RouterSettings>
        )}
        {modifiedStep.type === WorkflowActionType.PARALLEL && (
          <ParallelSettings readonly={readonly} />
        )}
        {workflowStructureUtil.isAction(modifiedStep.type) && (
          <JoinEdgesSection stepName={modifiedStep.name} readonly={readonly} />
        )}
        {modifiedStep.type === WorkflowTriggerType.CONNECTOR &&
          modifiedStep && (
            <ConnectorSettings
              step={modifiedStep}
              workflowId={workflowVersion.workflowId}
              readonly={readonly}
            ></ConnectorSettings>
          )}
        {showActionErrorHandlingForm && (
          <ActionErrorHandlingForm
            hideContinueOnFailure={
              stepMetadata.type === WorkflowActionType.CONNECTOR
                ? stepMetadata.errorHandlingOptions?.continueOnFailure?.hide
                : false
            }
            disabled={readonly}
            hideRetryOnFailure={
              stepMetadata.type === WorkflowActionType.CONNECTOR
                ? stepMetadata.errorHandlingOptions?.retryOnFailure?.hide
                : false
            }
          ></ActionErrorHandlingForm>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => e.preventDefault()}
        onChange={(e) => e.preventDefault()}
        className="w-full h-full flex flex-col"
      >
        <div
          ref={sidebarHeaderContainerRef}
          className="relative z-10 bg-background"
        >
          <SidebarHeader
            onClose={() => exitStepSettings()}
            leadingIcon={
              stepMetadata ? (
                <ConnectorIcon
                  logoUrl={stepMetadata.logoUrl}
                  displayName={stepMetadata.displayName}
                  showTooltip={false}
                  border={false}
                  size="md"
                />
              ) : null
            }
            actions={
              <div className="flex items-center gap-1">
                {isConnectorMetadata(stepMetadata) &&
                  stepMetadata.connectorVersion &&
                  (modifiedStep.type === WorkflowActionType.CONNECTOR ||
                    modifiedStep.type === WorkflowTriggerType.CONNECTOR) && (
                    <ConnectorVersionInHeader
                      step={modifiedStep}
                      connectorVersion={stepMetadata.connectorVersion}
                      readonly={readonly}
                    />
                  )}
                <StepNavigationButtons />
              </div>
            }
          >
            <EditableStepName
              selectedBranchIndex={selectedBranchIndex}
              stepIndex={workflowStructureUtil.getStepNumber(
                workflowVersion.trigger,
                selectedStep.name,
              )}
              setDisplayName={(value) => {
                form.setValue('displayName', value, {
                  shouldValidate: true,
                });
              }}
              readonly={readonly}
              displayName={modifiedStep.displayName}
              branchName={
                !isNil(selectedBranchIndex)
                  ? modifiedStep.settings.branches?.[selectedBranchIndex]
                      ?.branchName
                  : undefined
              }
              setBranchName={(value) => {
                if (!isNil(selectedBranchIndex)) {
                  form.setValue(
                    `settings.branches[${selectedBranchIndex}].branchName`,
                    value,
                    {
                      shouldValidate: true,
                    },
                  );
                }
              }}
              setSelectedBranchIndex={setSelectedBranchIndex}
              isEditingStepOrBranchName={isEditingStepOrBranchName}
              setIsEditingStepOrBranchName={setIsEditingStepOrBranchName}
              tooltipTitle={
                stepMetadata?.actionOrTriggerOrAgentDisplayName ||
                stepMetadata?.displayName
              }
              tooltipDescription={
                stepMetadata?.actionOrTriggerOrAgentDescription ||
                stepMetadata?.description
              }
              connectorVersion={
                isConnectorMetadata(stepMetadata)
                  ? stepMetadata.connectorVersion
                  : undefined
              }
            ></EditableStepName>
          </SidebarHeader>
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-3 left-0 right-0 h-3 bg-gradient-to-b from-background to-transparent"
          />
        </div>

        <DynamicPropertiesProvider
          key={`${selectedStep.name}-${selectedStep.type}`}
        >
          <StepTestRunnerProvider step={selectedStep}>
            <StepSettingsLayout
              isSplit={
                showTestPanel &&
                isStepDataPanelOpen &&
                stepDataPanelView === 'split'
              }
              showTestPanel={showTestPanel}
              isStepDataPanelOpen={isStepDataPanelOpen}
              settingsForm={settingsForm}
              testPanelHost={
                showTestPanel ? (
                  <StepDataPanelHost
                    mode={stepDataPanelView === 'split' ? 'split' : 'drawer'}
                    workflowId={workflowVersion.workflowId}
                    workflowVersionId={workflowVersion.id}
                    workspaceId={workspace?.id}
                    stepType={modifiedStep.type}
                    showGenerateSampleData={showGenerateSampleData}
                    showStepInputOutFromRun={showStepInputOutFromRun}
                    saving={saving}
                  />
                ) : null
              }
            />
          </StepTestRunnerProvider>
        </DynamicPropertiesProvider>
      </form>
    </Form>
  );
};
StepSettingsContainer.displayName = 'StepSettingsContainer';
export { StepSettingsContainer };

type StepSettingsLayoutProps = {
  isSplit: boolean;
  showTestPanel: boolean;
  isStepDataPanelOpen: boolean;
  settingsForm: React.ReactNode;
  testPanelHost: React.ReactNode;
};

const StepSettingsLayout = ({
  isSplit,
  showTestPanel,
  isStepDataPanelOpen,
  settingsForm,
  testPanelHost,
}: StepSettingsLayoutProps) => {
  if (isSplit) {
    return (
      <div className="relative flex-1 min-h-0 flex flex-row">
        <div className="w-1/2 min-w-0 min-h-0 h-full">{settingsForm}</div>
        {testPanelHost && (
          <div className="w-1/2 min-w-0 min-h-0 h-full pt-2 pl-1">
            {testPanelHost}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col w-full">
      <div
        className={cn('min-h-0', isStepDataPanelOpen ? 'h-[40%]' : 'flex-1')}
      >
        {settingsForm}
      </div>
      {showTestPanel && !isStepDataPanelOpen && (
        <div className="shrink-0">
          <TestStepCTAButton />
        </div>
      )}
      {testPanelHost && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 h-0 transition-all z-50',
            {
              'h-[60%]': isStepDataPanelOpen,
            },
          )}
        >
          {testPanelHost}
        </div>
      )}
    </div>
  );
};

type ConnectorVersionInHeaderProps = {
  step: WorkflowAction | WorkflowTrigger;
  connectorVersion: string;
  readonly: boolean;
};

const ConnectorVersionInHeader = ({
  step,
  connectorVersion,
  readonly,
}: ConnectorVersionInHeaderProps) => {
  const exactVersion = workflowConnectorUtil.getExactVersion(connectorVersion);
  const showSwitcher =
    !readonly &&
    (step.type === WorkflowActionType.CONNECTOR ||
      step.type === WorkflowTriggerType.CONNECTOR);
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-xs text-muted-foreground">v{exactVersion}</span>
      {showSwitcher && (
        <UpdateConnectorVersionDialog
          step={step}
          currentVersion={exactVersion}
        />
      )}
    </div>
  );
};

const isWorkflowActionStep = (
  step: WorkflowAction | WorkflowTrigger,
): step is WorkflowAction => workflowStructureUtil.isAction(step.type);

const StepTestRunnerProvider = ({
  step,
  children,
}: {
  step: WorkflowAction | WorkflowTrigger;
  children: React.ReactNode;
}) => {
  if (isWorkflowActionStep(step)) {
    return (
      <ActionTestRunnerProvider step={step} key={step.name}>
        {children}
      </ActionTestRunnerProvider>
    );
  }
  return (
    <TriggerTestRunnerProvider step={step} key={step.name}>
      {children}
    </TriggerTestRunnerProvider>
  );
};

const stripSampleData = (step: WorkflowAction | WorkflowTrigger) => {
  const { sampleData: _, ...settingsWithoutSampleData } = step.settings;
  const { lastUpdatedDate: __, ...stepWithoutMetadata } = step;

  return { ...stepWithoutMetadata, settings: settingsWithoutSampleData };
};

const isConnectorMetadata = (
  metadata: { type: WorkflowActionType | WorkflowTriggerType } | undefined,
): metadata is ConnectorStepMetadata =>
  metadata?.type === WorkflowActionType.CONNECTOR ||
  metadata?.type === WorkflowTriggerType.CONNECTOR;

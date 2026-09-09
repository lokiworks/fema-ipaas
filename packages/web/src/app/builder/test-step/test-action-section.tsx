import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  Step,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FlaskConical, Play } from 'lucide-react';
import React, { useContext } from 'react';

import { Button } from '@/components/ui/button';
import { connectorsHooks } from '@/features/connectors';

import { useBuilderStateContext } from '../builder-hooks';
import { DynamicPropertiesContext } from '../connector-properties/dynamic-properties-context';
import { stepPropertiesSnapshotUtils } from '../data-display/build-step-properties-snapshot';
import { ErrorExplanationContext } from '../data-display/explanation-prompt';
import { StepDataPanelHeader } from '../step-data/step-data-panel-header';

import { useActionTestRunner } from './test-runner-context';
import { TestSampleDataViewer } from './test-sample-data-viewer';
import { TestButtonTooltip } from './test-step-tooltip';

const TestStepSectionImplementation = React.memo(
  ({
    isSaving,
    currentStep,
  }: TestActionComponentProps & { currentStep: WorkflowAction }) => {
    const [
      sampleData,
      sampleDataInput,
      errorMessage,
      consoleLogs,
      isStepBeingTested,
      removeStepTestListener,
      revertSampleDataLocally,
    ] = useBuilderStateContext((state) => {
      return [
        state.outputSampleData[currentStep.name],
        state.inputSampleData[currentStep.name],
        state.errorLogs[currentStep.name],
        currentStep.type === WorkflowActionType.CODE
          ? state.consoleLogs[currentStep.name]
          : null,
        state.isStepBeingTested,
        state.removeStepTestListener,
        state.revertSampleDataLocallyCallbacks[currentStep.name],
      ];
    });

    const runner = useActionTestRunner();
    const onTestButtonClick = () => runner?.fireTest();

    const lastTestDate = currentStep.settings.sampleData?.lastTestDate;

    const sampleDataExists =
      !isNil(lastTestDate) ||
      !isNil(errorMessage) ||
      isStepBeingTested(currentStep.name);

    const isTesting = runner?.isTesting ?? false;
    const { isLoadingDynamicProperties } = useContext(DynamicPropertiesContext);

    const connectorName =
      currentStep.type === WorkflowActionType.CONNECTOR
        ? currentStep.settings.connectorName
        : undefined;
    const connectorVersion =
      currentStep.type === WorkflowActionType.CONNECTOR
        ? currentStep.settings.connectorVersion
        : undefined;
    const { connectorModel } = connectorsHooks.useConnector({
      name: connectorName ?? '',
      version: connectorVersion,
      enabled: !isNil(connectorName),
    });
    const stepKind = 'action';
    const stepName =
      currentStep.type === WorkflowActionType.CONNECTOR
        ? currentStep.settings.actionName
        : currentStep.type;
    const stepInput =
      currentStep.type === WorkflowActionType.CONNECTOR
        ? (currentStep.settings.input as Record<string, unknown> | undefined)
        : undefined;
    const explanationContext: ErrorExplanationContext = {
      connectorName,
      connectorVersion,
      connectorDisplayName: connectorModel?.displayName,
      connectorAuthType:
        stepPropertiesSnapshotUtils.findAuthType(connectorModel),
      stepKind,
      stepName,
      stepDisplayName: currentStep.displayName,
      stepDescription: stepPropertiesSnapshotUtils.findDescription({
        connectorModel,
        stepKind,
        stepName,
      }),
      stepProperties: stepPropertiesSnapshotUtils.build({
        connectorModel,
        stepKind,
        stepName,
        input: stepInput,
      }),
    };

    return (
      <>
        {!sampleDataExists && !isTesting && (
          <div className="flex flex-col h-full">
            <StepDataPanelHeader status="idle" />
            <div className="grow flex flex-col items-center justify-center w-full px-6 py-10 gap-4 text-center">
              <div className="flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary">
                <FlaskConical className="size-6" />
              </div>
              <div className="flex flex-col gap-1.5 max-w-[280px]">
                <span className="text-sm font-medium text-foreground">
                  {t('No sample data yet')}
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {t(
                    'Run this step to capture sample data. You can then use the result in following steps.',
                  )}
                </span>
              </div>
              <TestButtonTooltip saving={isSaving} invalid={!currentStep.valid}>
                <Button
                  size="sm"
                  onClick={onTestButtonClick}
                  loading={isTesting || isSaving}
                  disabled={!currentStep.valid || isLoadingDynamicProperties}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="size-3.5 fill-current" />
                  {t('Test Step')}
                </Button>
              </TestButtonTooltip>
            </div>
          </div>
        )}
        {(sampleDataExists || isTesting) && (
          <TestSampleDataViewer
            isValid={currentStep.valid && !isLoadingDynamicProperties}
            currentStep={currentStep}
            isTesting={isTesting}
            sampleData={sampleData}
            sampleDataInput={sampleDataInput ?? null}
            lastTestDate={lastTestDate}
            isSaving={isSaving}
            onRetest={onTestButtonClick}
            errorMessage={errorMessage}
            consoleLogs={consoleLogs}
            explanationContext={explanationContext}
            connectorDisplayName={connectorModel?.displayName}
            connectorSchema={
              connectorModel?.actions[stepName ?? '']?.outputSchema ?? null
            }
            onCancelTesting={() => {
              removeStepTestListener(currentStep.name);
              revertSampleDataLocally?.();
            }}
          ></TestSampleDataViewer>
        )}
      </>
    );
  },
);

const isAction = (step: Step): step is WorkflowAction => {
  return workflowStructureUtil.isAction(step.type);
};
const TestActionSection = React.memo((props: TestActionComponentProps) => {
  const currentStep = useBuilderStateContext((state) =>
    state.selectedStep
      ? workflowStructureUtil.getStep(
          state.selectedStep,
          state.workflowVersion.trigger,
        )
      : null,
  );
  if (isNil(currentStep) || !isAction(currentStep)) {
    return null;
  }

  return <TestStepSectionImplementation {...props} currentStep={currentStep} />;
});

TestStepSectionImplementation.displayName = 'TestStepSectionImplementation';
TestActionSection.displayName = 'TestActionSection';

type TestActionComponentProps = {
  isSaving: boolean;
  workflowVersionId: string;
  projectId: string;
};

export { TestActionSection };

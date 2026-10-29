import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  Step,
  WorkflowTrigger,
  WorkflowActionType,
  WorkflowTriggerType,
  workflowStructureUtil,
  ConnectorCategory,
} from '@fema-ipaas/shared';
import { cva } from 'class-variance-authority';
import { t } from 'i18next';
import { useMemo } from 'react';

import {
  componentLogoUrl,
  componentsHooks,
  TranslatedComponentMetadata,
} from '@/features/components';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { connectorsHooks } from '../hooks/connectors-hooks';
import {
  extractConnectorNamesAndCoreMetadata,
  getCoreStepMetadata,
} from '../utils/step-utils';

import { ConnectorIcon } from './connector-icon';

const extraIconVariants = cva(
  'flex items-center justify-center rounded-md bg-background border border-solid text-xs select-none',
  {
    variants: {
      size: {
        xxl: 'size-[64px]',
        xl: 'size-[48px]',
        lg: 'size-[40px]',
        md: 'size-[38px]',
        sm: 'size-[25px]',
        xs: 'size-[25px]',
      },
    },
  },
);

export function ConnectorIconList({
  maxNumberOfIconsToShow,
  trigger,
  size,
  className,
  background,
  excludeCore = false,
}: {
  trigger: WorkflowTrigger;
  maxNumberOfIconsToShow: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  background?: string;
  excludeCore?: boolean;
}) {
  const steps = workflowStructureUtil.getAllSteps(trigger);

  const { connectorNames } = useMemo(
    () => extractConnectorNamesAndCoreMetadata(steps, excludeCore),
    [steps, excludeCore],
  );

  const { summaries } = connectorsHooks.useConnectorSummariesByNames({
    names: connectorNames,
  });
  const { data: components } = componentsHooks.useComponents();

  const uniqueMetadata: StepIcon[] = steps
    .flatMap((step) =>
      iconsOfStep({
        step,
        summaries,
        components: components ?? [],
        excludeCore,
      }),
    )
    .filter(
      (item, index, self) =>
        self.findIndex(
          (secondItem) => item.displayName === secondItem.displayName,
        ) === index,
    );
  const visibleMetadata = uniqueMetadata.slice(0, maxNumberOfIconsToShow);
  const extraConnectors = uniqueMetadata.length - visibleMetadata.length;
  const extraMetadata = uniqueMetadata.slice(maxNumberOfIconsToShow);

  return (
    <div className={className || 'flex gap-0.5 '}>
      {visibleMetadata.map((metadata) => (
        <ConnectorIcon
          logoUrl={metadata.logoUrl}
          showTooltip={true}
          size={size ?? 'md'}
          border={true}
          displayName={metadata.displayName}
          key={metadata.displayName}
          background={background}
        />
      ))}
      {extraConnectors > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={extraIconVariants({ size: size ?? 'xs' })}>
              +{extraConnectors}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {extraMetadata.length > 1 &&
              extraMetadata
                .map((m) => m?.displayName || '')
                .slice(0, -1)
                .join(', ') +
                ` ${t('and')} ${
                  extraMetadata[extraMetadata.length - 1].displayName
                }`}
            {extraMetadata.length === 1 && extraMetadata[0].displayName}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function iconsOfStep({
  step,
  summaries,
  components,
  excludeCore,
}: {
  step: Step;
  summaries: ConnectorMetadataModelSummary[];
  components: TranslatedComponentMetadata[];
  excludeCore: boolean;
}): StepIcon[] {
  if (
    step.type === WorkflowActionType.CONNECTOR ||
    step.type === WorkflowTriggerType.CONNECTOR
  ) {
    const summary = summaries.find(
      (candidate) => candidate.name === step.settings.connectorName,
    );
    if (
      isNil(summary) ||
      (excludeCore && summary.categories?.includes(ConnectorCategory.CORE))
    ) {
      return [];
    }
    return [{ displayName: summary.displayName, logoUrl: summary.logoUrl }];
  }
  if (excludeCore) {
    return [];
  }
  if (step.type === WorkflowActionType.COMPONENT) {
    const component = components.find(
      (candidate) => candidate.type === step.settings.componentType,
    );
    return [
      {
        displayName: component?.displayName ?? step.settings.componentType,
        logoUrl: componentLogoUrl(component?.icon ?? ''),
      },
    ];
  }
  const core = getCoreStepMetadata()[step.type];
  return [{ displayName: core.displayName, logoUrl: core.logoUrl }];
}

type StepIcon = {
  displayName: string;
  logoUrl: string;
};

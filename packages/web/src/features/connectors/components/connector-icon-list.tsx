import {
  FlowTrigger,
  FlowActionType,
  flowStructureUtil,
  ConnectorCategory,
} from '@fema/shared';
import { cva } from 'class-variance-authority';
import { t } from 'i18next';
import { useMemo } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { connectorsHooks } from '../hooks/connectors-hooks';
import { StepMetadata } from '../types';
import { extractConnectorNamesAndCoreMetadata } from '../utils/step-utils';

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
  trigger: FlowTrigger;
  maxNumberOfIconsToShow: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  background?: string;
  excludeCore?: boolean;
}) {
  const steps = flowStructureUtil.getAllSteps(trigger);

  const { connectorNames, coreMetadata } = useMemo(
    () => extractConnectorNamesAndCoreMetadata(steps, excludeCore),
    [steps, excludeCore],
  );

  const { summaries } = connectorsHooks.useConnectorSummariesByNames({
    names: connectorNames,
  });

  const stepsMetadata: StepMetadata[] = useMemo(() => {
    const connectorMetadata: StepMetadata[] = summaries
      .filter(
        (connector) =>
          !excludeCore ||
          !connector.categories?.includes(ConnectorCategory.CORE),
      )
      .map((connector) => ({
        displayName: connector.displayName,
        logoUrl: connector.logoUrl,
        description: connector.description,
        type: FlowActionType.CONNECTOR as const,
        connectorType: connector.connectorType,
        connectorName: connector.name,
        connectorVersion: connector.version,
        categories: connector.categories ?? [],
        packageType: connector.packageType,
        auth: connector.auth,
      }));
    return [...coreMetadata, ...connectorMetadata];
  }, [summaries, coreMetadata, excludeCore]);

  const uniqueMetadata: StepMetadata[] = stepsMetadata.filter(
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

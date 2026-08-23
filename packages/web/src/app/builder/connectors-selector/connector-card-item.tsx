import { useRef } from 'react';

import { CardListItem } from '@/components/custom/card-list';
import {
  ConnectorIcon,
  ConnectorSelectorOperation,
  StepMetadataWithSuggestions,
  CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS,
} from '@/features/connectors';
import { useIsMobile } from '@/hooks/use-mobile';
import { wait } from '@/lib/dom-utils';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../builder-hooks';

import { ConnectorActionsOrTriggersList } from './connector-actions-or-triggers-list';

type ConnectorCardListItemProps = {
  connectorMetadata: StepMetadataWithSuggestions;
  searchQuery: string;
  operation: ConnectorSelectorOperation;
  isTemporaryDisabledUntilNextCursorMove: boolean;
};

const ConnectorCardListItem = ({
  connectorMetadata,
  searchQuery,
  operation,
  isTemporaryDisabledUntilNextCursorMove,
}: ConnectorCardListItemProps) => {
  const isMobile = useIsMobile();
  const showSuggestions = searchQuery.length > 0 || isMobile;
  const isMouseOver = useRef(false);
  const selectConnectorMetatdata = async () => {
    if (isTemporaryDisabledUntilNextCursorMove || showSuggestions) {
      return;
    }
    isMouseOver.current = true;
    await wait(250);
    if (isMouseOver.current) {
      setSelectedConnectorMetadataInConnectorSelector(connectorMetadata);
    }
  };
  const [
    selectedConnectorMetadataInConnectorSelector,
    setSelectedConnectorMetadataInConnectorSelector,
  ] = useBuilderStateContext((state) => [
    state.selectedConnectorMetadataInConnectorSelector,
    state.setSelectedConnectorMetadataInConnectorSelector,
  ]);
  const itemHeight = CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS.CONNECTOR_ITEM_HEIGHT;
  return (
    <>
      <CardListItem
        className={cn('flex-col p-3 gap-1 items-start truncate', {
          'hover:bg-transparent!': isTemporaryDisabledUntilNextCursorMove,
        })}
        style={{ height: `${itemHeight}px`, maxHeight: `${itemHeight}px` }}
        selected={
          selectedConnectorMetadataInConnectorSelector?.displayName ===
            connectorMetadata.displayName && searchQuery.length === 0
        }
        interactive={!showSuggestions}
        onMouseEnter={selectConnectorMetatdata}
        onMouseMove={selectConnectorMetatdata}
        onClick={() => {
          if (!showSuggestions) {
            setSelectedConnectorMetadataInConnectorSelector(connectorMetadata);
          }
        }}
        onMouseLeave={() => {
          isMouseOver.current = false;
        }}
        id={connectorMetadata.displayName}
        data-testid={connectorMetadata.displayName}
      >
        <div className="flex gap-2 items-center h-full">
          <ConnectorIcon
            logoUrl={connectorMetadata.logoUrl}
            displayName={connectorMetadata.displayName}
            showTooltip={false}
            size={'sm'}
          />
          <div className="grow h-full flex items-center justify-left text-sm">
            {connectorMetadata.displayName}
          </div>
        </div>
      </CardListItem>

      {showSuggestions && (
        <div>
          <ConnectorActionsOrTriggersList
            stepMetadataWithSuggestions={connectorMetadata}
            hideConnectorIconAndDescription={true}
            operation={operation}
          />
        </div>
      )}
    </>
  );
};

ConnectorCardListItem.displayName = 'ConnectorCardListItem';
export { ConnectorCardListItem };

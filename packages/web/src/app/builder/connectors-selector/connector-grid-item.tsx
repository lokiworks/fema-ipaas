import {
  ConnectorIcon,
  StepMetadataWithSuggestions,
} from '@/features/connectors';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../builder-hooks';

export function ConnectorGridItem({
  connectorMetadata,
  isTemporaryDisabledUntilNextCursorMove,
}: ConnectorGridItemProps) {
  const [selected, setSelected] = useBuilderStateContext((state) => [
    state.selectedConnectorMetadataInConnectorSelector,
    state.setSelectedConnectorMetadataInConnectorSelector,
  ]);
  const isSelected = selected?.displayName === connectorMetadata.displayName;

  return (
    <button
      type="button"
      id={connectorMetadata.displayName}
      data-testid={connectorMetadata.displayName}
      title={connectorMetadata.displayName}
      disabled={isTemporaryDisabledUntilNextCursorMove}
      onClick={() => setSelected(connectorMetadata)}
      className={cn(
        'flex h-full w-full flex-col items-center justify-start gap-1.5 rounded-md px-1 py-2',
        'transition-colors hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'bg-primary/10 hover:bg-primary/10',
      )}
    >
      <ConnectorIcon
        logoUrl={connectorMetadata.logoUrl}
        displayName={connectorMetadata.displayName}
        showTooltip={false}
        size="md"
      />
      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-muted-foreground">
        {connectorMetadata.displayName}
      </span>
    </button>
  );
}

ConnectorGridItem.displayName = 'ConnectorGridItem';

export const CONNECTOR_GRID_COLUMNS = 3;
export const CONNECTOR_GRID_ROW_HEIGHT = 78;

export type ConnectorGridItemProps = {
  connectorMetadata: StepMetadataWithSuggestions;
  isTemporaryDisabledUntilNextCursorMove: boolean;
};

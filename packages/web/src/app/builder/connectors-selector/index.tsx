import React from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ConnectorSelectorOperation } from '@/features/connectors';

const ConnectorSelector = ({
  children,
  id,
  operation,
  openSelectorOnClick = true,
  stepToReplaceConnectorDisplayName,
}: ConnectorSelectorProps) => {
  const [setOpenedConnectorSelectorStepNameOrAddButtonId] =
    useBuilderStateContext((state) => [
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
    ]);

  return (
    <div
      className="contents"
      onClick={() => {
        if (openSelectorOnClick) {
          setOpenedConnectorSelectorStepNameOrAddButtonId(
            id,
            operation,
            stepToReplaceConnectorDisplayName,
          );
        }
      }}
    >
      {children}
    </div>
  );
};

type ConnectorSelectorProps = {
  children: React.ReactNode;
  id: string;
  operation: ConnectorSelectorOperation;
  openSelectorOnClick?: boolean;
  stepToReplaceConnectorDisplayName?: string;
};

export { ConnectorSelector };

import { connectorsHooks } from '../hooks/connectors-hooks';

import { ConnectorIcon } from './connector-icon';

type ConnectorIconWithConnectorNameProps = {
  connectorName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
  showTooltip?: boolean;
};

const ConnectorIconWithConnectorName = ({
  connectorName,
  size = 'md',
  border = true,
  showTooltip = true,
}: ConnectorIconWithConnectorNameProps) => {
  const { summary } = connectorsHooks.useConnectorSummary({
    name: connectorName,
  });

  return (
    <ConnectorIcon
      size={size}
      border={border}
      displayName={summary?.displayName}
      logoUrl={summary?.logoUrl}
      showTooltip={showTooltip}
    />
  );
};

export { ConnectorIconWithConnectorName };

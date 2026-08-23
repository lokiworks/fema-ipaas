import { connectorsHooks } from '../hooks/connectors-hooks';

type ConnectorDisplayNameProps = {
  connectorName: string;
  fallback?: string;
};

const ConnectorDisplayName = ({
  connectorName,
  fallback,
}: ConnectorDisplayNameProps) => {
  const { summary } = connectorsHooks.useConnectorSummary({
    name: connectorName,
  });

  return <span>{summary?.displayName || fallback || connectorName}</span>;
};

export { ConnectorDisplayName };

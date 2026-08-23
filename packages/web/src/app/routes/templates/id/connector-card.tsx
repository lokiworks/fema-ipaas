import { Card, CardContent } from '@/components/ui/card';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';
import { formatUtils } from '@/lib/format-utils';

type ConnectorCardProps = {
  connectorName: string;
};

export const ConnectorCard = ({ connectorName }: ConnectorCardProps) => {
  const { summary } = connectorsHooks.useConnectorSummary({
    name: connectorName,
  });

  return (
    <Card>
      <CardContent className="p-2 w-[165px] flex items-center gap-3">
        <ConnectorIconWithConnectorName
          connectorName={connectorName}
          size="md"
        />
        <span className="text-sm font-medium">
          {summary?.displayName ||
            formatUtils.convertEnumToHumanReadable(connectorName)}
        </span>
      </CardContent>
    </Card>
  );
};

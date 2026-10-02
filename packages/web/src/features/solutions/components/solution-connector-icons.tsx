import { ConnectorIconWithConnectorName } from '@/features/connectors';
import { cn } from '@/lib/utils';

function SolutionConnectorIcons({
  connectorNames,
  size = 'sm',
  className,
}: SolutionConnectorIconsProps) {
  const visible = connectorNames.slice(0, MAX_VISIBLE_ICONS);
  const hidden = connectorNames.length - visible.length;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {visible.map((connectorName) => (
        <ConnectorIconWithConnectorName
          key={connectorName}
          connectorName={connectorName}
          size={size}
        />
      ))}
      {hidden > 0 && (
        <span className="text-xs text-muted-foreground">+{hidden}</span>
      )}
    </div>
  );
}

const MAX_VISIBLE_ICONS = 4;

export { SolutionConnectorIcons };

type SolutionConnectorIconsProps = {
  connectorNames: string[];
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

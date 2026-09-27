import { Template } from '@fema-ipaas/shared';
import { Play } from 'lucide-react';

import { ConnectorIconWithConnectorName } from '@/features/connectors';
import { cn } from '@/lib/utils';

import { templateCenterUtils } from '../utils/template-center-utils';

export function TemplateConnectorChain({
  template,
  size = 'sm',
  className,
}: {
  template: Template;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [first, ...rest] = templateCenterUtils.connectorNamesOf(template);
  if (!first) {
    return null;
  }
  const visible = rest.slice(0, MAX_FOLLOWING_ICONS);
  const hidden = rest.length - visible.length;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <ConnectorIconWithConnectorName connectorName={first} size={size} />
      {rest.length > 0 && (
        <Play className="size-2.5 text-muted-foreground" aria-hidden="true" />
      )}
      {visible.map((name) => (
        <ConnectorIconWithConnectorName
          key={name}
          connectorName={name}
          size={size}
        />
      ))}
      {hidden > 0 && (
        <span className="text-xs text-muted-foreground">+{hidden}</span>
      )}
    </div>
  );
}

const MAX_FOLLOWING_ICONS = 3;

import { WorkflowVersionTemplate } from '@fema-ipaas/shared';
import { Workflow } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { ConnectorIconList } from '@/features/connectors';

type WorkflowCardProps = {
  workflow: WorkflowVersionTemplate;
  isSelected: boolean;
  singleWorkflow: boolean;
  onClick: () => void;
};

export const WorkflowCard = ({
  workflow,
  isSelected,
  singleWorkflow,
  onClick,
}: WorkflowCardProps) => {
  return (
    <Card
      onClick={onClick}
      variant={singleWorkflow ? 'default' : 'interactive'}
      isSelected={!singleWorkflow && isSelected}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 shrink-0" />
            <span className="font-medium text-sm leading-tight truncate">
              {workflow.displayName}
            </span>
          </div>
          {workflow.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {workflow.description}
            </p>
          )}
        </div>

        {workflow.trigger && (
          <div className="h-6 px-3 flex items-center rounded-md shrink-0">
            <ConnectorIconList
              trigger={workflow.trigger}
              maxNumberOfIconsToShow={3}
              size="md"
              className="flex gap-1.5"
              background="white"
              excludeCore={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

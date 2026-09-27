import { ExecutionStatus } from '@fema-ipaas/shared';

import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { executionUtils } from '@/features/executions/utils/execution-utils';

export function RunStatus({ status }: { status: ExecutionStatus }) {
  const { Icon, variant } = executionUtils.getStatusIcon(status);
  return (
    <StatusIconWithText
      icon={Icon}
      text={executionUtils.getStatusLabel(status)}
      variant={variant}
    />
  );
}

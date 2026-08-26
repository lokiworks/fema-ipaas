import { isNil } from '@fema-ipaas/core-utils';

import { ResourceLockWidget } from '@/components/custom/resource-lock-widget';

import { useBuilderStateContext } from '../../builder-hooks';

import { RunInfoWidget } from './run-info-widget';
import { useWorkflowLock } from './use-workflow-lock';
import { ViewingOldVersionWidget } from './viewing-old-version-widget';

const BuilderBanner = () => {
  const { lockedBy, takeOver } = useWorkflowLock();
  const run = useBuilderStateContext((state) => state.run);

  if (lockedBy) {
    return (
      <ResourceLockWidget
        lockedBy={lockedBy}
        takeOver={takeOver}
        resourceLabel="workflow"
      />
    );
  }
  if (!isNil(run)) {
    return <RunInfoWidget />;
  }
  return <ViewingOldVersionWidget />;
};

BuilderBanner.displayName = 'BuilderBanner';
export { BuilderBanner };

import { isNil } from '@fema/core-utils';

import { ResourceLockWidget } from '@/components/custom/resource-lock-widget';

import { useBuilderStateContext } from '../../builder-hooks';

import { PublishWorkflowReminderWidget } from './publish-workflow-reminder-widget';
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
  return (
    <>
      <ViewingOldVersionWidget />
      <PublishWorkflowReminderWidget />
    </>
  );
};

BuilderBanner.displayName = 'BuilderBanner';
export { BuilderBanner };

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ConnectorPickerPanel } from '@/app/builder/connector-picker-panel';
import { RunsList } from '@/app/builder/run-list';
import { LeftSideBarType } from '@/app/builder/types';
import { WorkflowVersionsList } from '@/app/builder/workflow-versions';

import { ToolRail } from './tool-rail';
import { useInvalidSteps, ValidationPanel } from './validation-panel';

export function BuilderLeftPanel() {
  const invalidStepCount = useInvalidSteps().length;
  const [leftSidebar, setLeftSidebar, closePicker] = useBuilderStateContext(
    (state) => [
      state.leftSidebar,
      state.setLeftSidebar,
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
    ],
  );

  const handleSelect = (type: LeftSideBarType) => {
    if (leftSidebar === LeftSideBarType.CONNECTOR_PICKER) {
      closePicker(null);
    }
    setLeftSidebar(type);
  };

  return (
    <div className="flex h-full shrink-0 flex-row">
      <ToolRail
        active={leftSidebar}
        onSelect={handleSelect}
        badges={{ [LeftSideBarType.VALIDATION]: invalidStepCount }}
      />
      {leftSidebar !== LeftSideBarType.NONE && (
        <div className="flex h-full w-[260px] shrink-0 flex-col border-r bg-background">
          {leftSidebar === LeftSideBarType.CONNECTOR_PICKER && (
            <ConnectorPickerPanel />
          )}
          {leftSidebar === LeftSideBarType.RUNS && <RunsList />}
          {leftSidebar === LeftSideBarType.VERSIONS && <WorkflowVersionsList />}
          {leftSidebar === LeftSideBarType.VALIDATION && <ValidationPanel />}
        </div>
      )}
    </div>
  );
}

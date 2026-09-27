import { stepDisplayNumberUtil } from '@fema-ipaas/shared';
import { createContext, useContext, useMemo } from 'react';

import { useBuilderStateContext } from './builder-hooks';

const StepDisplayNumbersContext = createContext<Record<string, string> | null>(
  null,
);

export function StepDisplayNumbersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const numbers = useComputedDisplayNumbers();
  return (
    <StepDisplayNumbersContext.Provider value={numbers}>
      {children}
    </StepDisplayNumbersContext.Provider>
  );
}

export function useStepDisplayNumbers(): Record<string, string> {
  const provided = useContext(StepDisplayNumbersContext);
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  return useMemo(
    () => provided ?? stepDisplayNumberUtil.computeNumbers(trigger),
    [provided, trigger],
  );
}

function useComputedDisplayNumbers(): Record<string, string> {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  return useMemo(
    () => stepDisplayNumberUtil.computeNumbers(trigger),
    [trigger],
  );
}

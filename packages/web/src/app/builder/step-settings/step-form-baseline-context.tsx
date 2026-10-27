import { createContext, useContext } from 'react';

const StepFormBaselineContext = createContext<StepFormBaseline>({
  adoptCurrentValues: () => {},
});

function useStepFormBaseline(): StepFormBaseline {
  return useContext(StepFormBaselineContext);
}

export const stepFormBaseline = {
  Provider: StepFormBaselineContext.Provider,
  useBaseline: useStepFormBaseline,
};

export type StepFormBaseline = {
  adoptCurrentValues: () => void;
};

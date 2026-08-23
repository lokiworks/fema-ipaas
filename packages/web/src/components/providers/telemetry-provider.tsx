import React from 'react';

type TelemetryContextValue = {
  capture: (event: { name: string; payload?: unknown }) => void;
  reset: () => void;
};

const noop = () => undefined;

const TelemetryContext = React.createContext<TelemetryContextValue>({
  capture: noop,
  reset: noop,
});

const TelemetryProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <TelemetryContext.Provider value={{ capture: noop, reset: noop }}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => React.useContext(TelemetryContext);

export default TelemetryProvider;

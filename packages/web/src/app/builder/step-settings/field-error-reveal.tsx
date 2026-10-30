import { isNil } from '@fema-ipaas/core-utils';
import deepEqual from 'deep-equal';
import React, { createContext, useContext, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';

import { useFormField } from '@/components/ui/form';

export function FieldErrorRevealProvider({
  stepName,
  revealInitially,
  children,
}: {
  stepName: string;
  revealInitially: boolean;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(() =>
    revealOnMount({ stepName, revealInitially }),
  );
  const reveal = () => {
    revealSession.revealed.add(stepName);
    setRevealed(true);
  };
  return (
    <FieldErrorRevealContext.Provider value={{ revealed, reveal }}>
      {children}
    </FieldErrorRevealContext.Provider>
  );
}

export function useShowFieldError(): boolean {
  const { error, isTouched, name } = useFormField();
  const value: unknown = useWatch({ name });
  const initialValue = useRef(comparableValue(value));
  const { revealed } = useContext(FieldErrorRevealContext);
  const changed = !deepEqual(initialValue.current, comparableValue(value), {
    strict: true,
  });
  return !isNil(error) && (revealed || isTouched || changed);
}

function comparableValue(value: unknown): unknown {
  if (isNil(value) || value === '') {
    return null;
  }
  if (Array.isArray(value) && value.length === 0) {
    return null;
  }
  return value;
}

export const useFieldErrorReveal = () => useContext(FieldErrorRevealContext);

function revealOnMount({
  stepName,
  revealInitially,
}: {
  stepName: string;
  revealInitially: boolean;
}): boolean {
  if (revealSession.current === stepName) {
    return revealSession.revealed.has(stepName);
  }
  const revealed = revealInitially || revealSession.visited.has(stepName);
  revealSession.current = stepName;
  revealSession.visited.add(stepName);
  if (revealed) {
    revealSession.revealed.add(stepName);
  } else {
    revealSession.revealed.delete(stepName);
  }
  return revealed;
}

const revealSession: {
  current: string | null;
  visited: Set<string>;
  revealed: Set<string>;
} = {
  current: null,
  visited: new Set<string>(),
  revealed: new Set<string>(),
};

const FieldErrorRevealContext = createContext<FieldErrorReveal>({
  revealed: true,
  reveal: () => undefined,
});

type FieldErrorReveal = {
  revealed: boolean;
  reveal: () => void;
};

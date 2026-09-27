import { createContext, useContext } from 'react';

const BuilderSnapshotContext = createContext<string | null>(null);

export function BuilderSnapshotProvider({
  versionId,
  children,
}: {
  versionId: string | null;
  children: React.ReactNode;
}) {
  return (
    <BuilderSnapshotContext.Provider value={versionId}>
      {children}
    </BuilderSnapshotContext.Provider>
  );
}

export function useBuilderSnapshotVersionId(): string | null {
  return useContext(BuilderSnapshotContext);
}

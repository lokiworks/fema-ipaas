import { createContext, useContext, useState } from 'react';

export type ConnectorSearchContextState = {
  searchQuery: string;
  setSearchQuery: (searchQuery: string) => void;
};

const ConnectorSearchContext = createContext<ConnectorSearchContextState>({
  searchQuery: '',
  setSearchQuery: () => {},
});

export const ConnectorSearchProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  return (
    <ConnectorSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      {children}
    </ConnectorSearchContext.Provider>
  );
};

export const useConnectorSearchContext = () =>
  useContext(ConnectorSearchContext);

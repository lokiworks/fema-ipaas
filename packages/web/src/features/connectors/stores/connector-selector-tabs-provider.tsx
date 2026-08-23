import { createContext, useContext, useState } from 'react';

import { StepMetadataWithSuggestions } from '@/features/connectors/types';

export enum ConnectorSelectorTabType {
  EXPLORE = 'EXPLORE',
  AI_AND_AGENTS = 'AI_AND_AGENTS',
  APPROVALS = 'APPROVALS',
  APPS = 'APPS',
  UTILITY = 'UTILITY',
  CUSTOM = 'CUSTOM',
  NONE = 'NONE',
}

export const ConnectorSelectorTabsContext = createContext({
  selectedTab: ConnectorSelectorTabType.EXPLORE,
  selectedCustomTabId: null as string | null,
  setSelectedTab: (
    _tab: ConnectorSelectorTabType,
    _customTabId?: string | null,
  ) => {},
  resetToBeforeNoneWasSelected: () => {},
  setSelectedConnectorInExplore: (
    _connector: StepMetadataWithSuggestions | null,
  ) => {},
  selectedConnectorInExplore: null as null | StepMetadataWithSuggestions,
});

export const ConnectorSelectorTabsProvider = ({
  children,
  onTabChange,
  initiallySelectedTab,
  initiallySelectedCustomTabId = null,
}: {
  children: React.ReactNode;
  onTabChange: (tab: ConnectorSelectorTabType) => void;
  initiallySelectedTab: ConnectorSelectorTabType;
  initiallySelectedCustomTabId?: string | null;
}) => {
  const [selectedTab, setSelectedTab] = useState(initiallySelectedTab);
  const [selectedCustomTabId, setSelectedCustomTabId] = useState<string | null>(
    initiallySelectedCustomTabId,
  );
  const [lastTabBefroeNoneWasSelected, setLastTabBeforeNoneWasSelected] =
    useState<{ tab: ConnectorSelectorTabType; customTabId: string | null }>({
      tab: initiallySelectedTab,
      customTabId: initiallySelectedCustomTabId,
    });
  const [selectedConnectorInExplore, setSelectedConnectorInExplore] =
    useState<StepMetadataWithSuggestions | null>(null);
  return (
    <ConnectorSelectorTabsContext.Provider
      value={{
        selectedTab,
        selectedCustomTabId,
        setSelectedConnectorInExplore,
        selectedConnectorInExplore,
        setSelectedTab: (
          tab: ConnectorSelectorTabType,
          customTabId: string | null = null,
        ) => {
          if (tab !== ConnectorSelectorTabType.NONE) {
            setLastTabBeforeNoneWasSelected({ tab, customTabId });
            onTabChange(tab);
          }
          setSelectedTab(tab);
          setSelectedCustomTabId(customTabId);
        },
        resetToBeforeNoneWasSelected: () => {
          setSelectedTab(lastTabBefroeNoneWasSelected.tab);
          setSelectedCustomTabId(lastTabBefroeNoneWasSelected.customTabId);
        },
      }}
    >
      {children}
    </ConnectorSelectorTabsContext.Provider>
  );
};

export const useConnectorSelectorTabs = () => {
  const context = useContext(ConnectorSelectorTabsContext);
  if (!context) {
    throw new Error(
      'useConnectorSelectorTabs must be used within a ConnectorSelectorTabsProvider',
    );
  }
  return context;
};

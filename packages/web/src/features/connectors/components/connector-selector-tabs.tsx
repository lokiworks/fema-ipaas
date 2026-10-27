import { Tabs, TabsTrigger, TabsList } from '@/components/ui/tabs';

import {
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
} from '../stores/connector-selector-tabs-provider';
import { ResolvedConnectorSelectorTab } from '../utils/connector-selector-customization';

export const ConnectorSelectorTabs = ({
  tabs,
}: {
  tabs: ResolvedConnectorSelectorTab[];
}) => {
  const { selectedTab, selectedCustomTabId, setSelectedTab } =
    useConnectorSelectorTabs();
  const selectedTabKey =
    selectedTab === ConnectorSelectorTabType.CUSTOM
      ? selectedCustomTabId ?? ''
      : selectedTab;
  return (
    <Tabs
      value={selectedTabKey}
      onValueChange={(value) => {
        const tab = tabs.find((candidate) => candidate.key === value);
        if (tab) {
          setSelectedTab(tab.type, tab.customTabId ?? null);
        }
      }}
      className="w-full min-w-0"
    >
      <TabsList className="w-full justify-start gap-5 overflow-x-auto px-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className="shrink-0">
            {tab.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
